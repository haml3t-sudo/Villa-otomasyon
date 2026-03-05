import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// ── Constants ──────────────────────────────────────────────────────────────

const ACTION_META = {
  CREATE:       { label: "Oluşturuldu",    color: "bg-emerald-50 text-emerald-700 border-emerald-200",  dot: "bg-emerald-500" },
  UPDATE:       { label: "Güncellendi",    color: "bg-blue-50 text-blue-700 border-blue-200",           dot: "bg-blue-500"    },
  DELETE:       { label: "Silindi",        color: "bg-red-50 text-red-700 border-red-200",              dot: "bg-red-500"     },
  STATUS_CHANGE:{ label: "Durum Değişti", color: "bg-amber-50 text-amber-700 border-amber-200",        dot: "bg-amber-500"   },
  CANCEL:       { label: "İptal Edildi",   color: "bg-orange-50 text-orange-700 border-orange-200",     dot: "bg-orange-500"  },
  PRICE_UPDATE: { label: "Fiyat Güncellendi", color: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500"  },
};

const TABLE_LABEL = {
  villas:       "Villalar",
  reservations: "Rezervasyonlar",
  transactions: "Finansal İşlemler",
};

const ALL_ACTIONS  = ["", ...Object.keys(ACTION_META)];
const ALL_TABLES   = ["", "villas", "reservations", "transactions"];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTs(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function ActionBadge({ action }) {
  const meta = ACTION_META[action] || { label: action, color: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${meta.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function DataPopover({ label, data }) {
  const [open, setOpen] = useState(false);
  if (!data) return <span className="text-slate-300 text-xs">—</span>;

  const parsed = typeof data === "string" ? (() => { try { return JSON.parse(data); } catch { return data; } })() : data;
  const preview = typeof parsed === "object"
    ? Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(", ")
    : String(parsed);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 left-0 top-6 w-72 bg-white rounded-xl border border-slate-200 shadow-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
            <pre className="text-xs text-slate-700 whitespace-pre-wrap break-all leading-relaxed font-mono bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
              {JSON.stringify(parsed, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AuditLogsPage({ devLogs = [] }) {
  const [logs, setLogs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filterAction, setFilterAction]   = useState("");
  const [filterTable, setFilterTable]     = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo]   = useState("");
  const [search, setSearch]         = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage]             = useState(0);
  const PAGE_SIZE = 50;

  const fetchLogs = useCallback(async () => {
    if (!supabase) {
      setLogs(devLogs);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (filterAction) query = query.eq("action", filterAction);
    if (filterTable)  query = query.eq("table_name", filterTable);
    if (filterDateFrom) query = query.gte("created_at", filterDateFrom + "T00:00:00");
    if (filterDateTo)   query = query.lte("created_at", filterDateTo + "T23:59:59");

    const { data, error } = await query;
    if (!error) setLogs(data || []);
    setLoading(false);
  }, [filterAction, filterTable, filterDateFrom, filterDateTo, devLogs]);

  useEffect(() => {
    fetchLogs();
    setPage(0);
  }, [fetchLogs]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return logs;
    return logs.filter(
      (l) =>
        l.description?.toLowerCase().includes(s) ||
        l.user_name?.toLowerCase().includes(s) ||
        l.record_id?.toLowerCase().includes(s) ||
        l.action?.toLowerCase().includes(s),
    );
  }, [logs, search]);

  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  function clearFilters() {
    setFilterAction("");
    setFilterTable("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSearch("");
  }

  const hasFilters = filterAction || filterTable || filterDateFrom || filterDateTo || search;

  // Stats
  const stats = useMemo(() => {
    const counts = {};
    for (const l of logs) counts[l.action] = (counts[l.action] || 0) + 1;
    return counts;
  }, [logs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Yönetim</p>
          <h2 className="mt-1 text-3xl font-semibold text-slate-900">Sistem Günlükleri</h2>
        </div>
        <button
          onClick={fetchLogs}
          className="inline-flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-xl px-4 py-2.5 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Yenile
        </button>
      </header>

      {/* Stats chips */}
      <div className="flex flex-wrap gap-3">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
          <span className="text-2xl font-semibold text-slate-900">{logs.length}</span>
          <span className="text-sm text-slate-500">Toplam Kayıt</span>
        </div>
        {Object.entries(ACTION_META).map(([action, meta]) =>
          stats[action] ? (
            <div key={action} className={`border rounded-xl px-4 py-3 shadow-sm flex items-center gap-2 ${meta.color}`}>
              <span className="text-lg font-semibold">{stats[action]}</span>
              <span className="text-xs font-medium">{meta.label}</span>
            </div>
          ) : null
        )}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Action filter */}
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-xs font-medium text-slate-500">İşlem Tipi</label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 ring-blue-500"
            >
              <option value="">Tümü</option>
              {Object.entries(ACTION_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Table filter */}
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-xs font-medium text-slate-500">Tablo</label>
            <select
              value={filterTable}
              onChange={(e) => setFilterTable(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 ring-blue-500"
            >
              <option value="">Tümü</option>
              {ALL_TABLES.filter(Boolean).map((t) => (
                <option key={t} value={t}>{TABLE_LABEL[t] || t}</option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-500">Başlangıç Tarihi</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 ring-blue-500"
            />
          </div>

          {/* Date to */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-500">Bitiş Tarihi</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 ring-blue-500"
            />
          </div>

          {/* Search */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-500">Arama</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Açıklama, kullanıcı veya ID ara..."
                className="w-full border border-slate-300 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 ring-blue-500"
              />
            </div>
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-500 text-sm rounded-xl px-3 py-2.5 transition self-end"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Temizle
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400 text-sm">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Günlükler yükleniyor...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <svg className="w-14 h-14 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium">Kayıt bulunamadı</p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-2 text-xs text-blue-600 hover:underline">
                Filtreleri temizle
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Tarih / Saat</th>
                    <th className="px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Kullanıcı</th>
                    <th className="px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">İşlem</th>
                    <th className="px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tablo</th>
                    <th className="px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Açıklama</th>
                    <th className="px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Detay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginated.map((log) => (
                    <>
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50 transition cursor-pointer"
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      >
                        <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap font-mono text-xs">
                          {formatTs(log.created_at)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-semibold flex-shrink-0">
                              {(log.user_name || "?")[0].toUpperCase()}
                            </div>
                            <span className="text-slate-700 text-xs">{log.user_name || "—"}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <ActionBadge action={log.action} />
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
                            {TABLE_LABEL[log.table_name] || log.table_name}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-700 max-w-xs">
                          <p className="truncate">{log.description || "—"}</p>
                          {log.record_id && (
                            <p className="text-xs text-slate-400 font-mono truncate mt-0.5">ID: {log.record_id}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {(log.old_data || log.new_data) ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === log.id ? null : log.id); }}
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition ${expandedId === log.id ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                            >
                              <svg className={`w-4 h-4 transition-transform ${expandedId === log.id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                      {expandedId === log.id && (log.old_data || log.new_data) && (
                        <tr key={`${log.id}-expand`} className="bg-blue-50/50">
                          <td colSpan={6} className="px-5 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              {log.old_data && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                                    Eski Değer
                                  </p>
                                  <pre className="text-xs font-mono text-slate-700 bg-white border border-slate-200 rounded-xl p-3 whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto">
                                    {JSON.stringify(
                                      typeof log.old_data === "string" ? JSON.parse(log.old_data) : log.old_data,
                                      null, 2
                                    )}
                                  </pre>
                                </div>
                              )}
                              {log.new_data && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                                    Yeni Değer
                                  </p>
                                  <pre className="text-xs font-mono text-slate-700 bg-white border border-slate-200 rounded-xl p-3 whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto">
                                    {JSON.stringify(
                                      typeof log.new_data === "string" ? JSON.parse(log.new_data) : log.new_data,
                                      null, 2
                                    )}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  {filtered.length} kayıttan {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} arası gösteriliyor
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-sm text-slate-600 min-w-[80px] text-center">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
