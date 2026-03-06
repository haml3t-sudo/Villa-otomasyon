import { useMemo, useState } from "react";
import { format } from "date-fns";

const STATUS_OPTIONS = [
  { label: "Yapılacak", value: "pending" },
  { label: "Yapılıyor", value: "in_progress" },
  { label: "Tamamlandı", value: "done" },
];

function toIsoDate(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "yyyy-MM-dd");
}

export default function AddTaskModal({
  initialDate,
  profiles,
  onClose,
  onSave,
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("pending");
  const [dueDate, setDueDate] = useState(toIsoDate(initialDate));
  const [assignedTo, setAssignedTo] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredProfiles = useMemo(() => {
    if (!profileSearch.trim()) return profiles;
    const q = profileSearch.toLowerCase();
    return profiles.filter((p) =>
      (p.full_name || p.email || "").toLowerCase().includes(q),
    );
  }, [profiles, profileSearch]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        text: text.trim(),
        assigned_to: assignedTo || null,
        due_date: dueDate,
        status,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Yeni Görev Ekle</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Başlık
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
              placeholder="Görev başlığı"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Açıklama
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
              placeholder="Opsiyonel açıklama"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative text-sm font-medium text-slate-700">
              <p>Atanan Kişi</p>
              <input
                value={profileSearch}
                onChange={(e) => {
                  setProfileSearch(e.target.value);
                  setAssignedTo("");
                  setShowDrop(true);
                }}
                onFocus={() => setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 180)}
                placeholder="İsim ara..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
              />
              {showDrop && filteredProfiles.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {filteredProfiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={() => {
                        setAssignedTo(p.id);
                        setProfileSearch(p.full_name || p.email || "");
                        setShowDrop(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      {p.full_name || p.email}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Tarih
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
              />
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Durum
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
