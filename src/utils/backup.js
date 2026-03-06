import { supabaseAdmin } from "../lib/supabaseAdmin";

/** Tables that are included in every backup snapshot. */
export const BACKUP_TABLES = [
  "villas",
  "reservations",
  "profiles",
  "tasks",
  "audit_logs",
];

/**
 * Tables that are written during a restore.
 * profiles is intentionally excluded — user accounts are managed separately.
 */
const RESTORE_TABLES = BACKUP_TABLES.filter((t) => t !== "profiles");

// ─────────────────────────────────────────────────────────────────────────────
// exportAllData
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch every row from BACKUP_TABLES, build a versioned JSON payload,
 * trigger a browser download, and return the payload.
 *
 * Uses supabaseAdmin so RLS is bypassed — call only from admin-guarded routes.
 */
export async function exportAllData() {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase bağlantısı yok — gerçek bir proje ile çalışıyorsanız .env dosyasını kontrol edin.",
    );
  }

  const tables = {};
  for (const table of BACKUP_TABLES) {
    const { data, error } = await supabaseAdmin.from(table).select("*");
    if (error) throw new Error(`"${table}" tablosu alınamadı: ${error.message}`);
    tables[table] = data ?? [];
  }

  const payload = {
    version: "1.0",
    exported_at: new Date().toISOString(),
    tables,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// previewFile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a .json File object, validate structure, and return row counts per table.
 * Does NOT write to the database — safe to call before user confirmation.
 *
 * Returns { valid: true, exported_at, counts, raw }
 *      or { valid: false, error }
 */
export function previewFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target.result);
        if (raw?.version !== "1.0") {
          resolve({
            valid: false,
            error: `Geçersiz yedek sürümü: "${raw?.version ?? "bilinmiyor"}". Beklenen: "1.0"`,
          });
          return;
        }
        const counts = {};
        for (const table of BACKUP_TABLES) {
          counts[table] = Array.isArray(raw.tables?.[table])
            ? raw.tables[table].length
            : 0;
        }
        resolve({ valid: true, exported_at: raw.exported_at, counts, raw });
      } catch (err) {
        resolve({ valid: false, error: "JSON ayrıştırma hatası: " + err.message });
      }
    };
    reader.onerror = () => resolve({ valid: false, error: "Dosya okunamadı." });
    reader.readAsText(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// importData
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert rows for every RESTORE_TABLE found in a parsed backup payload.
 *
 * @param {object} raw          - The parsed JSON payload (returned by previewFile).
 * @param {Function} onProgress - Optional callback: ({ table, status: 'importing'|'done', count? })
 * @returns {object} counts     - { [tableName]: rowCount }
 *
 * Throws on any Supabase error.
 */
export async function importData(raw, onProgress) {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase bağlantısı yok — geri yükleme işlemi gerçek bir projeye ihtiyaç duyar.",
    );
  }

  const counts = {};
  for (const table of RESTORE_TABLES) {
    const rows = raw.tables?.[table];
    onProgress?.({ table, status: "importing" });

    if (!rows?.length) {
      counts[table] = 0;
      onProgress?.({ table, status: "done", count: 0 });
      continue;
    }

    const { error } = await supabaseAdmin.from(table).upsert(rows);
    if (error) throw new Error(`"${table}" tablosu geri yüklenemedi: ${error.message}`);

    counts[table] = rows.length;
    onProgress?.({ table, status: "done", count: rows.length });
  }

  return counts;
}
