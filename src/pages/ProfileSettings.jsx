import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { useAuth } from "../contexts/AuthContext";

const SIG_BUCKET = import.meta.env.VITE_SIGNATURES_BUCKET || "signatures";
const MAX_SIGNATURE_MB = Number(import.meta.env.VITE_SIGNATURE_MAX_MB || 2);
const MAX_SIGNATURE_BYTES = Math.max(1, MAX_SIGNATURE_MB) * 1024 * 1024;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parseStorageRef(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.replace(/^\/+/, "");
  const slash = v.indexOf("/");
  if (slash <= 0) return null;
  return {
    bucket: v.slice(0, slash),
    path: v.slice(slash + 1),
  };
}

async function optimizeImageToPngBlob(file, maxSide = 1400) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl;
    });
    const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * ratio));
    canvas.height = Math.max(1, Math.round(img.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function parseLimitFromSupabaseError(message) {
  const m = String(message || "").match(/(\d+)\s*bytes/i);
  return m ? Number(m[1]) : null;
}

async function imageToPngBlob(img, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function shrinkBlobToLimit(blob, limitBytes) {
  if (!blob || !limitBytes || blob.size <= limitBytes) return blob;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });

    let current = blob;
    let w = img.width;
    let h = img.height;
    for (let i = 0; i < 6 && current.size > limitBytes; i += 1) {
      const ratio = Math.max(0.45, Math.sqrt(limitBytes / current.size) * 0.9);
      w = Math.max(120, Math.round(w * ratio));
      h = Math.max(40, Math.round(h * ratio));
      const next = await imageToPngBlob(img, w, h);
      if (!next) break;
      current = next;
    }
    return current;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function normalizeBucketLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

async function exportTrimmedSignature(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const isInk = !(r > 245 && g > 245 && b > 245);
      if (isInk) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  // Boş imza: mevcut canvas'ı kullan
  if (maxX < minX || maxY < minY) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  const pad = 10;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(width - sx, maxX - minX + 1 + pad * 2);
  const sh = Math.min(height - sy, maxY - minY + 1 + pad * 2);

  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const octx = out.getContext("2d");
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, sw, sh);
  octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve) => out.toBlob(resolve, "image/png"));
}

export default function ProfileSettings() {
  const { user, profile, displayName } = useAuth();

  const [imzaUrl, setImzaUrl]       = useState(profile?.imza_url ?? null);
  const [signedUrl, setSignedUrl]   = useState(null);
  const [modalOpen, setModalOpen]   = useState(false);
  const [tab, setTab]               = useState("draw"); // "draw" | "upload"
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState(null);

  const canvasRef = useRef(null);
  const drawing   = useRef(false);

  // Fetch signed URL when imzaUrl changes
  useEffect(() => {
    if (!imzaUrl || !supabase) { setSignedUrl(null); return; }
    const parsed = parseStorageRef(imzaUrl);
    const bucket = parsed?.bucket || SIG_BUCKET;
    const storagePath =
      parsed?.path ||
      (imzaUrl.startsWith(SIG_BUCKET + "/")
        ? imzaUrl.slice(SIG_BUCKET.length + 1)
        : imzaUrl);
    supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, 3600)
      .then(({ data, error }) => {
        if (error) {
          setSignedUrl(null);
          return;
        }
        setSignedUrl(data?.signedUrl ?? null);
      });
  }, [imzaUrl]);

  async function ensureSignatureBucket() {
    if (!supabase) return false;
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (!listErr && (buckets || []).some((b) => b.name === SIG_BUCKET)) {
      // Bucket varsa da limit yanlış ayarlanmış olabilir; service-role ile güncellemeyi dene.
      if (supabaseAdmin) {
        await supabaseAdmin.storage.updateBucket(SIG_BUCKET, {
          public: false,
          fileSizeLimit: MAX_SIGNATURE_BYTES,
          allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
        }).catch(() => {
          // Sessiz geç: update yetkisi yoksa mevcut konfigürasyonla devam ederiz.
        });
      }
      return true;
    }

    // Eğer listBuckets RLS nedeniyle görünmüyorsa doğrudan upload denemesi yapılacak.
    if (!supabaseAdmin) return false;

    const { error: createErr } = await supabaseAdmin.storage.createBucket(SIG_BUCKET, {
      public: false,
      fileSizeLimit: 2 * 1024 * 1024,
      allowedMimeTypes: ["image/png", "image/jpeg"],
    });

    if (
      !createErr ||
      String(createErr.message || "").toLowerCase().includes("already exists")
    ) {
      if (supabaseAdmin) {
        await supabaseAdmin.storage.updateBucket(SIG_BUCKET, {
          public: false,
          fileSizeLimit: MAX_SIGNATURE_BYTES,
          allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
        }).catch(() => {});
      }
      return true;
    }
    return false;
  }

  async function getSignatureBucketLimitBytes() {
    if (!supabase) return null;
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error || !buckets) return null;
    const bucket = buckets.find((b) => b.name === SIG_BUCKET);
    if (!bucket) return null;
    // Supabase SDK sürümüne göre farklı field adı gelebilir.
    return (
      normalizeBucketLimit(bucket.file_size_limit) ||
      normalizeBucketLimit(bucket.fileSizeLimit) ||
      null
    );
  }

  async function uploadSignatureWithRetry(storagePath, initialBlob) {
    let blob = initialBlob;
    const knownBucketLimit = await getSignatureBucketLimitBytes();
    if (knownBucketLimit) {
      blob = await shrinkBlobToLimit(blob, Math.floor(knownBucketLimit * 0.9));
    }

    let uploadErr = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let { error } = await supabase.storage
        .from(SIG_BUCKET)
        .upload(storagePath, blob, {
          contentType: "image/png",
          upsert: true,
        });
      // Eğer storage RLS insert/update engellerse admin client ile fallback dene.
      if (
        error &&
        supabaseAdmin &&
        String(error.message || "").toLowerCase().includes("row-level security")
      ) {
        const adminTry = await supabaseAdmin.storage
          .from(SIG_BUCKET)
          .upload(storagePath, blob, {
            contentType: "image/png",
            upsert: true,
          });
        error = adminTry.error;
      }
      uploadErr = error;
      if (!uploadErr) return { blob, error: null };

      const msg = String(uploadErr.message || "").toLowerCase();
      if (!msg.includes("larger than")) break;

      const parsed = parseLimitFromSupabaseError(uploadErr.message);
      const targetLimit =
        (parsed && Math.floor(parsed * 0.9)) ||
        (knownBucketLimit && Math.floor(knownBucketLimit * 0.9)) ||
        Math.floor(blob.size * 0.65);
      const next = await shrinkBlobToLimit(blob, Math.max(2 * 1024, targetLimit));
      if (!next || next.size >= blob.size) break;
      blob = next;
    }
    return { blob, error: uploadErr };
  }

  // ── Canvas drawing helpers ─────────────────────────────────────────────────
  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (canvas.width  / rect.width),
      y: (src.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  function initCanvas() {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = "#1E3A5F";
    ctx.lineWidth   = 2;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
  }

  function onDrawStart(e) {
    e.preventDefault();
    drawing.current = true;
    const cv  = canvasRef.current;
    const ctx = cv.getContext("2d");
    const pos = getPos(e, cv);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function onDrawMove(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const cv  = canvasRef.current;
    const ctx = cv.getContext("2d");
    const pos = getPos(e, cv);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function onDrawEnd(e) {
    e.preventDefault();
    drawing.current = false;
  }

  function clearCanvas() {
    const cv  = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
  }

  // ── Upload file select ─────────────────────────────────────────────────────
  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setUploadPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!user || !supabase) return;
    setSaving(true);

    try {
      let blob;
      if (tab === "draw") {
        const cv = canvasRef.current;
        blob = await exportTrimmedSignature(cv);
      } else {
        if (!uploadFile) throw new Error("Lütfen bir dosya seçin.");
        blob = await optimizeImageToPngBlob(uploadFile);
      }
      if (!blob) throw new Error("İmza dosyası hazırlanamadı.");
      if (blob.size > MAX_SIGNATURE_BYTES) {
        throw new Error(
          `İmza dosyası çok büyük (${formatBytes(blob.size)}). En fazla ${MAX_SIGNATURE_MB} MB olmalı.`,
        );
      }

      const storagePath = `${user.id}.png`;
      await ensureSignatureBucket();

      const uploadResult = await uploadSignatureWithRetry(storagePath, blob);
      blob = uploadResult.blob;
      const uploadErr = uploadResult.error;
      if (uploadErr) {
        const msg = String(uploadErr.message || "");
        if (msg.toLowerCase().includes("row-level security")) {
          throw new Error(
            "Storage RLS imza yüklemeyi engelliyor. signatures bucket için insert/update policy eklenmeli.",
          );
        }
        if (msg.toLowerCase().includes("larger than")) {
          throw new Error(
            `Dosya boyutu bucket limitini aşıyor. Son deneme boyutu: ${formatBytes(blob.size)}. ` +
            `Bucket limiti çok düşük olabilir. Supabase Storage'da "${SIG_BUCKET}" bucket file size limit değerini en az ${MAX_SIGNATURE_MB} MB yapın.`,
          );
        }
        if (msg.toLowerCase().includes("bucket") && msg.toLowerCase().includes("not found")) {
          throw new Error(
            `Imza bucket bulunamadı. Supabase Storage'da "${SIG_BUCKET}" adında private bucket oluşturun.`,
          );
        }
        throw uploadErr;
      }

      const fullPath = `${SIG_BUCKET}/${storagePath}`;
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ imza_url: fullPath })
        .eq("id", user.id);
      if (profileErr) throw profileErr;

      setImzaUrl(fullPath);
      setModalOpen(false);
      showToast("İmza başarıyla kaydedildi.", "success");
    } catch (err) {
      showToast(err?.message || "İmza kaydedilemedi.", "error");
    } finally {
      setSaving(false);
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function openModal() {
    setTab("draw");
    setUploadFile(null);
    setUploadPreview(null);
    setModalOpen(true);
    // init canvas after render
    requestAnimationFrame(() => requestAnimationFrame(initCanvas));
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 rounded-xl px-5 py-3 text-sm font-medium shadow-lg transition-all ${
            toast.type === "success"
              ? "bg-emerald-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <header className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
        <p className="text-sm text-slate-500">Hesap</p>
        <h2 className="mt-1 text-3xl font-semibold text-slate-900">Profil Ayarları</h2>
      </header>

      {/* Profile info card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-slate-800">Bilgiler</h3>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Ad Soyad</dt>
            <dd className="font-medium text-slate-900">{displayName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">E-posta</dt>
            <dd className="font-medium text-slate-900">{user?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Rol</dt>
            <dd className="font-medium capitalize text-slate-900">{profile?.role ?? "—"}</dd>
          </div>
        </dl>
      </div>

      {/* Signature card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">İmza</h3>
          <button
            onClick={openModal}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            {imzaUrl ? "İmzayı Güncelle" : "İmza Ekle"}
          </button>
        </div>

        {signedUrl ? (
          <div className="flex items-center gap-4">
            <img
              src={signedUrl}
              alt="İmza"
              className="h-20 w-52 rounded-lg border border-slate-200 bg-white object-contain p-2 shadow-sm"
            />
            <p className="text-xs text-slate-500">
              Bu imza, oluşturulan PDF rezervasyon formlarına otomatik eklenir.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Henüz imza eklenmedi. İmza ekleyerek PDF'lere otomatik imzalanmış form oluşturabilirsiniz.
          </p>
        )}
      </div>

      {/* Signature modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h4 className="text-base font-semibold text-slate-900">İmza Güncelle</h4>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-100 px-6 pt-3">
              {["draw", "upload"].map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); if (t === "draw") requestAnimationFrame(() => requestAnimationFrame(initCanvas)); }}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                    tab === t
                      ? "border-b-2 border-blue-600 text-blue-600"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t === "draw" ? "Çiz" : "Yükle"}
                </button>
              ))}
            </div>

            <div className="px-6 py-5">
              {tab === "draw" && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Aşağıdaki alana fare veya dokunarak imzanızı çizin.
                  </p>
                  <canvas
                    ref={canvasRef}
                    width={460}
                    height={150}
                    className="w-full rounded-lg border border-slate-300 bg-white touch-none cursor-crosshair"
                    onMouseDown={onDrawStart}
                    onMouseMove={onDrawMove}
                    onMouseUp={onDrawEnd}
                    onMouseLeave={onDrawEnd}
                    onTouchStart={onDrawStart}
                    onTouchMove={onDrawMove}
                    onTouchEnd={onDrawEnd}
                  />
                  <button
                    onClick={clearCanvas}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                  >
                    Temizle
                  </button>
                </div>
              )}

              {tab === "upload" && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs text-slate-500">
                      PNG veya JPEG dosyası seçin (maks. {MAX_SIGNATURE_MB} MB)
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={onFileChange}
                      className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </label>
                  {uploadPreview && (
                    <img
                      src={uploadPreview}
                      alt="Önizleme"
                      className="h-24 w-full rounded-lg border border-slate-200 bg-white object-contain p-2"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
