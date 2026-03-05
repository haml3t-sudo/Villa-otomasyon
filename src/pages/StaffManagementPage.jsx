import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const ROLE_LABEL = { admin: "Yönetici", staff: "Personel" };
const ROLE_STYLE = {
  admin: "bg-blue-50 text-blue-700 border-blue-200",
  staff: "bg-slate-100 text-slate-600 border-slate-200",
};

const DEV_PROFILES = [
  {
    id: "1",
    full_name: "Admin Kullanıcı",
    email: "admin@villa.com",
    role: "admin",
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    full_name: "Personel Kullanıcı",
    email: "personel@villa.com",
    role: "staff",
    created_at: new Date().toISOString(),
  },
];

export default function StaffManagementPage() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState("staff");
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  async function fetchProfiles() {
    if (!supabase) {
      setProfiles(DEV_PROFILES);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: fetchErr } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at");
    if (fetchErr) setError(fetchErr.message);
    else setProfiles(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchProfiles();
  }, []);

  function flash(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  async function handleRoleSave(profileId) {
    setSavingId(profileId);
    setError(null);
    if (supabase) {
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ role: editRole })
        .eq("id", profileId);
      if (updateErr) {
        setError(updateErr.message);
        setSavingId(null);
        return;
      }
    } else {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, role: editRole } : p))
      );
    }
    await fetchProfiles();
    setEditingId(null);
    setSavingId(null);
    flash("Yetki başarıyla güncellendi.");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Yönetim</p>
          <h2 className="mt-1 text-3xl font-semibold text-slate-900">Personel Yönetimi</h2>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl px-5 py-2.5 transition shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Yeni Personel Ekle
        </button>
      </header>

      {/* Banners */}
      {successMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-5 py-3 text-sm">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {successMsg}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Toplam Personel", value: profiles.length, color: "text-slate-900" },
          { label: "Yönetici", value: profiles.filter((p) => p.role === "admin").length, color: "text-blue-700" },
          { label: "Personel", value: profiles.filter((p) => p.role === "staff").length, color: "text-slate-600" },
          { label: "Aktif Hesap", value: profiles.length, color: "text-emerald-700" },
        ].map((card) => (
          <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${card.color}`}>{card.value}</p>
          </article>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-400 text-sm">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Yükleniyor...
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Henüz personel kaydı bulunmuyor.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ad Soyad</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">E-posta</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Yetki</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Kayıt Tarihi</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs flex-shrink-0">
                        {(profile.full_name || profile.email || "?")[0].toUpperCase()}
                      </div>
                      <span>{profile.full_name || <span className="text-slate-400 font-normal">—</span>}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{profile.email}</td>
                  <td className="px-6 py-4">
                    {editingId === profile.id ? (
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:ring-2 ring-blue-500"
                      >
                        <option value="admin">Yönetici</option>
                        <option value="staff">Personel</option>
                      </select>
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${ROLE_STYLE[profile.role] || ROLE_STYLE.staff}`}>
                        {ROLE_LABEL[profile.role] || profile.role}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(profile.created_at).toLocaleDateString("tr-TR")}
                  </td>
                  <td className="px-6 py-4">
                    {editingId === profile.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRoleSave(profile.id)}
                          disabled={savingId === profile.id}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg px-3 py-1.5 transition disabled:opacity-60"
                        >
                          {savingId === profile.id ? "Kaydediliyor..." : "Kaydet"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg px-3 py-1.5 transition"
                        >
                          İptal
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingId(profile.id); setEditRole(profile.role); }}
                        className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 text-xs font-medium hover:underline transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Yetkiyi Düzenle
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreateModal && (
        <CreateStaffModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(msg) => { fetchProfiles(); flash(msg); }}
        />
      )}
    </div>
  );
}

// ── Create Staff Modal ─────────────────────────────────────────────────────

function CreateStaffModal({ onClose, onSuccess }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("staff");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Dev mode
    if (!supabaseAdmin) {
      setLoading(false);
      onSuccess(`"${fullName}" adlı personel oluşturuldu. (Dev modu — gerçek kayıt yok)`);
      onClose();
      return;
    }

    // Create user via admin API — does NOT touch the admin's session
    const { data, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // e-posta onayı atlanır, hesap anında aktif
      user_metadata: { full_name: fullName, role },
    });

    if (createErr) {
      setError(createErr.message);
      setLoading(false);
      return;
    }

    // Ensure profile row exists with correct role
    if (data.user) {
      await supabaseAdmin
        .from("profiles")
        .upsert(
          { id: data.user.id, full_name: fullName, email, role },
          { onConflict: "id" }
        );
    }

    setLoading(false);
    onSuccess(`"${fullName}" adlı personel başarıyla oluşturuldu. Giriş bilgileri: ${email} / ${password}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900">Yeni Personel Ekle</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Ad Soyad</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ahmet Yılmaz"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">E-posta Adresi</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ahmet@firma.com"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Şifre</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 6 karakter"
                className="w-full border border-slate-300 rounded-xl px-4 pr-10 py-2.5 text-sm outline-none focus:ring-2 ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">Bu bilgileri personele iletin. Personel daha sonra şifresini kendi panelinden değiştirebilir.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Yetki Seviyesi</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 ring-blue-500"
            >
              <option value="staff">Personel</option>
              <option value="admin">Yönetici</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {!supabaseAdmin && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-xl px-4 py-3 flex items-start gap-2">
              <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span><b>VITE_SUPABASE_SERVICE_ROLE_KEY</b> tanımlanmamış. .env dosyanıza service role anahtarını ekleyin.</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl px-4 py-2.5 text-sm font-medium transition"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-60"
            >
              {loading ? "Oluşturuluyor..." : "Personel Oluştur"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
