import os
import tempfile
from datetime import date, datetime
from typing import Optional

from flask import Flask, after_this_request, jsonify, request, send_file
from flask_cors import CORS
from dotenv import load_dotenv

from rezervasyon_pdf import generate_rezervasyon_pdf

app = Flask(__name__)
CORS(app)

# Load .env from project root so backend can access VITE_* keys too.
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Supabase is optional — used only by the legacy /api/reservations/:id/pdf endpoint
# and the signature download helper.
_SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or ""
_SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")
    or ""
)
_SIGNATURES_BUCKET = (
    os.getenv("SIGNATURES_BUCKET")
    or os.getenv("VITE_SIGNATURES_BUCKET")
    or "signatures"
)
_supabase = None
if _SUPABASE_URL and _SUPABASE_KEY:
    try:
        from supabase import create_client
        _supabase = create_client(_SUPABASE_URL, _SUPABASE_KEY)
    except Exception as exc:
        print(f"[warn] Supabase bağlantısı kurulamadı: {exc}")


# ─── Signature helper ─────────────────────────────────────────────────────────

def get_user_signature(user_id: str) -> Optional[str]:
    """
    Fetch the user's signature PNG from Supabase Storage (bucket: signatures).
    Returns a local temp-file path, or None if unavailable.
    Caller is responsible for deleting the temp file after use.
    """
    if not _supabase or not user_id:
        return None
    try:
        profile = (
            _supabase.table("profiles")
            .select("imza_url")
            .eq("id", user_id)
            .single()
            .execute()
            .data or {}
        )
        imza_url = profile.get("imza_url")
        if not imza_url:
            return None

        # imza_url is stored as the storage path, e.g. "signatures/uuid.png"
        storage_path = imza_url.lstrip("/")
        bucket = _SIGNATURES_BUCKET
        # Strip "bucket/" prefix if already included
        if storage_path.startswith(bucket + "/"):
            storage_path = storage_path[len(bucket) + 1:]

        file_bytes = _supabase.storage.from_(bucket).download(storage_path)
        if not file_bytes:
            return None

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
        tmp.write(file_bytes)
        tmp.close()
        return tmp.name
    except Exception as exc:
        print(f"[warn] İmza indirilemedi ({user_id}): {exc}")
        return None


# ─── helpers ──────────────────────────────────────────────────────────────────

def _tr_date(v):
    if not v:
        return "-"
    s = str(v)
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return f"{s[8:10]}.{s[5:7]}.{s[0:4]}"
    return s


def _money(v):
    try:
        return (
            f"{float(v or 0):,.2f}"
            .replace(",", "X")
            .replace(".", ",")
            .replace("X", ".")
        )
    except Exception:
        return str(v or "0")


def _diff_days(start_str, end_str):
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"):
        try:
            s = datetime.strptime(str(start_str)[:19], fmt).date()
            e = datetime.strptime(str(end_str)[:19], fmt).date()
            return max(0, (e - s).days)
        except Exception:
            continue
    return "-"


def _body_to_pdf_data(b: dict) -> dict:
    """Map camelCase frontend fields → PDF data dict."""
    start = b.get("startDate") or b.get("start_date") or ""
    end   = b.get("endDate")   or b.get("end_date")   or ""
    adults   = int(b.get("adults")   or 0)
    children = int(b.get("children") or 0)

    no = (
        b.get("reservationNo")
        or b.get("reservation_no")
        or b.get("id")
        or "-"
    )

    temizlik_amount = b.get("ekTemizlikUcreti") or b.get("ek_temizlik_ucreti")
    depozito_amount = b.get("depozitoTutar") or b.get("depozito_tutar") or 0

    temizlik_var = b.get("ekTemizlikVar")
    if temizlik_var is None:
        temizlik_var = b.get("ek_temizlik_var")
    if temizlik_var is None:
        temizlik_var = bool(temizlik_amount)

    hasar_var = b.get("hasarDepozitoVar")
    if hasar_var is None:
        hasar_var = b.get("hasar_depozito_var")
    if hasar_var is None:
        hasar_var = bool(depozito_amount)

    return {
        "no":             no,
        "misafir_isim":   b.get("guestName")    or b.get("guest_name")    or "-",
        "kisi_sayisi":    (adults + children) or "-",
        "iletisim":       b.get("guestPhone")   or b.get("guest_phone")   or "-",
        "konaklama_yeri": b.get("villaName")    or b.get("villa_name")    or "-",
        "rez_tarihi":     _tr_date(b.get("createdAt")   or b.get("created_at")),
        "giris_tarihi":   _tr_date(start),
        "cikis_tarihi":   _tr_date(end),
        "gun_sayisi":     _diff_days(start, end),
        "toplam_tutar":   _money(b.get("toplamTutar")    or b.get("toplam_tutar")),
        "on_odeme":       _money(b.get("alinanOnOdeme")  or b.get("alinan_on_odeme")),
        "kalan_odeme":    _money(b.get("kapidaOdenecek") or b.get("kapida_odenecek")),
        "temizlik_var":   bool(temizlik_var),
        "temizlik_tutar": (
            _money(temizlik_amount)
            if bool(temizlik_var)
            else "—"
        ),
        "hasar_depozito_var": bool(hasar_var),
        "depozito_tutar": _money(depozito_amount if bool(hasar_var) else 0),
        "rez_alan":       b.get("createdBy") or b.get("created_by") or "-",
    }


def _pdf_response(pdf_data: dict):
    """Generate PDF from pdf_data dict and return Flask response."""
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp_path = tmp.name
    tmp.close()
    generate_rezervasyon_pdf(pdf_data, tmp_path)

    @after_this_request
    def _cleanup(response):
        try:
            os.remove(tmp_path)
        except Exception:
            pass
        return response

    return send_file(
        tmp_path,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"rezervasyon_{pdf_data['no']}.pdf",
    )


# ─── PRIMARY endpoint: data comes from request body ───────────────────────────
# Frontend sends the full reservation object — no Supabase lookup needed.
# Optionally include `currentUserId` to embed the user's signature.

@app.post("/api/pdf/reservation")
def reservation_pdf_from_body():
    body = request.get_json(force=True, silent=True) or {}
    if not body:
        return jsonify({"error": "İstek gövdesi boş."}), 400

    pdf_data = _body_to_pdf_data(body)

    # Attach signature if caller provides their user_id
    current_user_id = body.get("currentUserId") or body.get("current_user_id")
    sig_path = get_user_signature(current_user_id) if current_user_id else None
    pdf_data["imza_path"] = sig_path

    try:
        response = _pdf_response(pdf_data)
    finally:
        if sig_path:
            try:
                os.remove(sig_path)
            except Exception:
                pass

    return response


# ─── LEGACY endpoint: looks up reservation in Supabase by id ─────────────────

@app.post("/api/reservations/<reservation_id>/pdf")
def reservation_pdf_by_id(reservation_id):
    if not _supabase:
        return jsonify({"error": "Supabase bağlantısı yok. /api/pdf/reservation endpoint'ini kullanın."}), 503

    rows = (
        _supabase.table("reservations")
        .select("*, villas(name)")
        .eq("id", reservation_id)
        .limit(1)
        .execute()
        .data or []
    )
    if not rows:
        return jsonify({"error": "Rezervasyon bulunamadı."}), 404

    r = rows[0]
    villa_name = (r.get("villas") or {}).get("name") if isinstance(r.get("villas"), dict) else None

    # Inject camelCase aliases so _body_to_pdf_data works
    r["guestName"]      = r.get("guest_name")
    r["guestPhone"]     = r.get("guest_phone")
    r["villaName"]      = villa_name
    r["startDate"]      = r.get("start_date")
    r["endDate"]        = r.get("end_date")
    r["toplamTutar"]    = r.get("toplam_tutar")
    r["alinanOnOdeme"]  = r.get("alinan_on_odeme")
    r["kapidaOdenecek"] = r.get("kapida_odenecek")
    r["createdBy"]      = r.get("created_by")
    r["createdAt"]      = r.get("created_at")

    pdf_data = _body_to_pdf_data(r)

    current_user_id = request.args.get("user_id") or request.json and request.json.get("user_id")
    sig_path = get_user_signature(current_user_id) if current_user_id else None
    pdf_data["imza_path"] = sig_path

    try:
        response = _pdf_response(pdf_data)
    finally:
        if sig_path:
            try:
                os.remove(sig_path)
            except Exception:
                pass

    return response


# ─── health check ─────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "supabase": _supabase is not None})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
