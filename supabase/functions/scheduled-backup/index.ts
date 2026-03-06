import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BACKUP_BUCKET = "backups";
const BACKUP_TABLES = [
  "villas",
  "reservations",
  "profiles",
  "tasks",
  "audit_logs",
];
const RETENTION_DAYS = 30;

Deno.serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // ── 1. Fetch all tables ───────────────────────────────────────
    const tables: Record<string, unknown[]> = {};
    for (const table of BACKUP_TABLES) {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        throw new Error(`"${table}" tablosu alınamadı: ${error.message}`);
      }
      tables[table] = data ?? [];
    }

    // ── 2. Build JSON payload ─────────────────────────────────────
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const filename =
      `backup_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `_${pad(now.getHours())}-${pad(now.getMinutes())}.json`;

    const payload = JSON.stringify(
      { version: "1.0", exported_at: now.toISOString(), tables },
      null,
      2,
    );

    // ── 3. Upload to Storage ──────────────────────────────────────
    const { error: uploadErr } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(filename, new Blob([payload], { type: "application/json" }), {
        contentType: "application/json",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Depolama yüklemesi başarısız: ${uploadErr.message}`);
    }

    // ── 4. Delete backups older than RETENTION_DAYS ───────────────
    const { data: allFiles, error: listErr } = await supabase.storage
      .from(BACKUP_BUCKET)
      .list("", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });

    let deleted = 0;
    if (!listErr && allFiles) {
      const cutoff = new Date(
        Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      const toDelete = allFiles
        .filter((f) => f.created_at && new Date(f.created_at) < cutoff)
        .map((f) => f.name);

      if (toDelete.length > 0) {
        const { error: deleteErr } = await supabase.storage
          .from(BACKUP_BUCKET)
          .remove(toDelete);
        if (!deleteErr) deleted = toDelete.length;
      }
    }

    return Response.json({ saved: filename, deleted });
  } catch (err) {
    console.error("scheduled-backup error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
});
