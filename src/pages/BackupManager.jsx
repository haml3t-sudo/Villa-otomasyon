import { useEffect, useRef, useState } from "react";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { exportAllData, importData, previewFile, BACKUP_TABLES } from "../utils/backup";

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TABLE_LABELS = {
  villas: "Villalar",
  reservations: "Rezervasyonlar",
  profiles: "Kullanıcılar",
  tasks: "Görevler",
  audit_logs: "Sistem Günlükleri",
};

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmModal
// ─────────────────────────────────────────────────────────────────────────────

function ConfirmModal({ preview, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 flex-shrink-0">
              <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Geri Yüklemeyi Onayla</h3>
              <p className="text-xs text-slate-500 mt-0.5">Bu işlem geri alınamaz</p>
            </div>
          </div>

          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">
            <strong>Uyarı:</strong> Bu işlem mevcut verilerin üzerine yazar. Devam etmeden önce güncel bir yedek almanızı öneririz.
          </div>

          <p className="text-sm text-slate-600 mb-3">
            Yedek tarihi:{" "}
            <span className="font-medium text-slate-800">{formatDateTime(preview?.exported_at)}</span>
          </p>

          <div className="space-y-1">
            {BACKUP_TABLES.filter((t) => t !== "profiles").map((t) => (
              <div key={t} className="flex justify-between text-sm">
                <span className="text-slate-600">{TABLE_LABELS[t] ?? t}</span>
                <span className="font-medium text-slate-800">
                  {preview?.counts?.[t] ?? 0} kayıt
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            İptal
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
          >
            Evet, Geri Yükle
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BackupHistory
// ─────────────────────────────────────────────────────────────────────────────

function BackupHistory({ onRestoreFromHistory }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [downloadingFile, setDownloadingFile] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!supabaseAdmin) {
      setFiles([]);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: listErr } = await supabaseAdmin.storage
      .from("backups")
      .list("", { limit: 30, sortBy: { column: "created_at", order: "desc" } });
    setLoading(false);
    if (listErr) {
      setError(listErr.message);
      return;
    }
    setFiles((data ?? []).filter((f) => f.name.endsWith(".json")).slice(0, 30));
  }

  async function handleDownload(filename) {
    if (!supabaseAdmin) return;
    setDownloadingFile(filename);
    try {
      const { data, error: urlErr } = await supabaseAdmin.storage
        .from("backups")
        .createSignedUrl(filename, 3600);
      if (urlErr) throw new Error(urlErr.message);
      const anchor = document.createElement("a");
      anchor.href = data.signedUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err) {
      alert("İndirme başlatılamadı: " + err.message);
    } finally {
      setDownloadingFile(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100">
            <svg className="h-4 w-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Yedek Geçmişi</h3>
            <p className="text-xs text-slate-500">Otomatik yedekler — en fazla 30 adet, yeniden eskiye</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
        >
          <svg className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Yenile
        </button>
      </div>

      <div className="p-6">
        {!supabaseAdmin ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 px-4 py-5">
            <svg className="h-5 w-5 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-slate-500">
              Yedek geçmişi için Supabase bağlantısı gereklidir.
            </p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            Yedekler yüklenirken hata: {error}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-sm text-slate-500">
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Yükleniyor…
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 px-4 py-5">
            <svg className="h-5 w-5 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-sm text-slate-500">
              "backups" depolama klasöründe henüz yedek yok. Planlı Edge Function çalıştığında burada görünür.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Dosya</th>
                  <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Boyut</th>
                  <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Tarih</th>
                  <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {files.map((file) => (
                  <tr key={file.name} className="hover:bg-slate-50/50 transition">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="font-mono text-xs text-slate-700 truncate max-w-[220px]">{file.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-500 tabular-nums">
                      {formatBytes(file.metadata?.size)}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-500 tabular-nums">
                      {formatDateTime(file.created_at)}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleDownload(file.name)}
                          disabled={downloadingFile === file.name}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          İndir
                        </button>
                        <button
                          onClick={() => onRestoreFromHistory(file.name)}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Geri Yükle
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BackupManager (main page)
// ─────────────────────────────────────────────────────────────────────────────

export default function BackupManager() {
  // ── Manual export ─────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState(null);
  const [exportError, setExportError] = useState(null);

  // ── Restore: file selection & preview ─────────────────────────
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileInputRef = useRef(null);

  // ── Restore: confirmation modal ────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ── Restore: import progress & result ─────────────────────────
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState([]); // [{ table, status, count }]
  const [importResult, setImportResult] = useState(null); // { success, counts } | null
  const [importError, setImportError] = useState(null);

  // ─── Manual export ────────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await exportAllData();
      setLastExport(new Date().toISOString());
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  }

  // ─── File select / preview ────────────────────────────────────

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setImportResult(null);
    setImportError(null);
    setImportProgress([]);
    setPreview(null);
    setPreviewLoading(true);
    const result = await previewFile(file);
    setPreview(result);
    setPreviewLoading(false);
  }

  function clearFile() {
    setSelectedFile(null);
    setPreview(null);
    setImportResult(null);
    setImportError(null);
    setImportProgress([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ─── Import ───────────────────────────────────────────────────

  async function handleImport() {
    if (!preview?.valid || !preview?.raw) return;
    setConfirmOpen(false);
    setImporting(true);
    setImportProgress([]);
    setImportError(null);
    setImportResult(null);

    try {
      const counts = await importData(preview.raw, ({ table, status, count }) => {
        setImportProgress((prev) => {
          const idx = prev.findIndex((p) => p.table === table);
          const entry = { table, status, count };
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = entry;
            return next;
          }
          return [...prev, entry];
        });
      });
      setImportResult({ success: true, counts });
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  }

  // ─── Restore from history ─────────────────────────────────────

  async function handleRestoreFromHistory(filename) {
    if (!supabaseAdmin) return;
    try {
      const { data, error: urlErr } = await supabaseAdmin.storage
        .from("backups")
        .createSignedUrl(filename, 3600);
      if (urlErr) throw new Error(urlErr.message);

      const resp = await fetch(data.signedUrl);
      if (!resp.ok) throw new Error("Dosya indirilemedi: " + resp.statusText);
      const raw = await resp.json();

      const counts = {};
      for (const table of BACKUP_TABLES) {
        counts[table] = Array.isArray(raw.tables?.[table])
          ? raw.tables[table].length
          : 0;
      }

      clearFile();
      setPreview({ valid: true, exported_at: raw.exported_at, counts, raw });
      setSelectedFile({ name: filename, fromHistory: true });
      setConfirmOpen(true);
    } catch (err) {
      alert("Geri yükleme başlatılamadı: " + err.message);
    }
  }

  // ─── Render ───────────────────────────────────────────────────

  const hasValidPreview = preview?.valid && !importing && !importResult;

  return (
    <>
      <header className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
        <p className="text-sm text-slate-500">Sistem Yönetimi</p>
        <h2 className="mt-1 text-3xl font-semibold text-slate-900">Yedekleme & Geri Yükleme</h2>
      </header>

      <div className="mt-6 space-y-6">
        {/* ── Section 1: Manuel Yedek ─────────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
              <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Manuel Yedek Al</h3>
              <p className="text-xs text-slate-500">Tüm tablolar tek JSON dosyasına aktarılır</p>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition"
              >
                {exporting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Hazırlanıyor…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Yedeği İndir
                  </>
                )}
              </button>

              {lastExport && (
                <p className="text-sm text-slate-500">
                  Son indirme:{" "}
                  <span className="font-medium text-slate-700">{formatDateTime(lastExport)}</span>
                </p>
              )}
            </div>

            {exportError && (
              <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {exportError}
              </div>
            )}

            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              <strong className="text-slate-600">Kapsam:</strong>{" "}
              {BACKUP_TABLES.map((t) => TABLE_LABELS[t] ?? t).join(", ")}
            </div>
          </div>
        </section>

        {/* ── Section 2: Geri Yükleme ─────────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
              <svg className="h-4 w-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Veri Geri Yükleme</h3>
              <p className="text-xs text-slate-500">Yedek dosyasını seçin ve onaylayın</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* File upload area */}
            {!selectedFile ? (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center hover:border-blue-400 hover:bg-blue-50/30 transition">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm">
                  <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">JSON dosyası seçmek için tıklayın</p>
                  <p className="text-xs text-slate-400 mt-0.5">Yalnızca .json formatı kabul edilir</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="sr-only"
                />
              </label>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 flex-shrink-0">
                    <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-slate-700 truncate">{selectedFile.name}</span>
                </div>
                {!importing && !importResult && (
                  <button
                    onClick={clearFile}
                    className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition"
                    title="Dosyayı kaldır"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Preview */}
            {previewLoading && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Dosya analiz ediliyor…
              </div>
            )}

            {preview && !previewLoading && (
              <>
                {!preview.valid ? (
                  <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                    <strong>Geçersiz dosya:</strong> {preview.error}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-100">
                      <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs font-semibold text-emerald-700">
                        Geçerli yedek — {formatDateTime(preview.exported_at)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-emerald-100 sm:grid-cols-5">
                      {BACKUP_TABLES.map((t) => (
                        <div key={t} className="bg-white px-4 py-3 text-center">
                          <p className="text-xs text-slate-500">{TABLE_LABELS[t] ?? t}</p>
                          <p className="mt-1 text-lg font-semibold text-slate-800 tabular-nums">
                            {preview.counts[t] ?? 0}
                          </p>
                          <p className="text-xs text-slate-400">kayıt</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Import progress */}
            {importing && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-4 w-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm font-medium text-blue-700">İçe aktarılıyor…</p>
                </div>
                <div className="space-y-1.5">
                  {BACKUP_TABLES.filter((t) => t !== "profiles").map((t) => {
                    const entry = importProgress.find((p) => p.table === t);
                    return (
                      <div key={t} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">{TABLE_LABELS[t] ?? t}</span>
                        {!entry ? (
                          <span className="text-slate-400">Bekliyor…</span>
                        ) : entry.status === "importing" ? (
                          <span className="text-blue-500">Aktarılıyor…</span>
                        ) : (
                          <span className="font-medium text-emerald-600">✓ {entry.count} kayıt</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Import result */}
            {importResult?.success && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-semibold text-emerald-700">Geri yükleme tamamlandı</p>
                </div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 text-xs">
                  {Object.entries(importResult.counts).map(([t, n]) => (
                    <div key={t} className="flex justify-between gap-2 rounded-md bg-white px-2.5 py-1.5 border border-emerald-100">
                      <span className="text-slate-500">{TABLE_LABELS[t] ?? t}</span>
                      <span className="font-medium text-slate-800">{n}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={clearFile}
                  className="mt-3 text-xs text-emerald-600 hover:text-emerald-800 underline underline-offset-2"
                >
                  Başka bir dosya seç
                </button>
              </div>
            )}

            {importError && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                <strong>Hata:</strong> {importError}
              </div>
            )}

            {/* Warning + Import button */}
            {hasValidPreview && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-100 bg-amber-50/50 px-5 py-4">
                <div className="flex items-start gap-2 flex-1">
                  <svg className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-xs text-amber-700">
                    <strong>Bu işlem mevcut verilerin üzerine yazar.</strong> Devam etmeden önce güncel bir yedek almanızı öneririz.
                  </p>
                </div>
                <button
                  onClick={() => setConfirmOpen(true)}
                  className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  İçe Aktar
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── Section 3: Yedek Geçmişi ────────────────────────────── */}
        <BackupHistory onRestoreFromHistory={handleRestoreFromHistory} />
      </div>

      {/* Confirmation modal */}
      {confirmOpen && (
        <ConfirmModal
          preview={preview}
          onConfirm={handleImport}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}
