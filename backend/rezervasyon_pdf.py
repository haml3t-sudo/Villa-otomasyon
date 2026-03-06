import os
import urllib.request
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# ─── Directories ──────────────────────────────────────────────────────────────
ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")
FONTS_DIR  = os.path.join(ASSETS_DIR, "fonts")
os.makedirs(FONTS_DIR, exist_ok=True)

# ─── Fonts — DejaVu Sans (full Unicode / Turkish support) ────────────────────
# Bundled in backend/assets/fonts/; downloaded once on first run.
_FONT_FILES = {
    "DejaVuSans.ttf": (
        "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf"
    ),
    "DejaVuSans-Bold.ttf": (
        "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf"
    ),
}

def _ensure_fonts() -> None:
    """Download DejaVu Sans fonts to FONTS_DIR if not already present."""
    for fname, url in _FONT_FILES.items():
        dest = os.path.join(FONTS_DIR, fname)
        if not os.path.exists(dest):
            print(f"[font] İndiriliyor: {fname} …")
            try:
                urllib.request.urlretrieve(url, dest)
                print(f"[font] Kaydedildi: {dest}")
            except Exception as exc:
                print(f"[font] HATA — {fname} indirilemedi: {exc}")

_ensure_fonts()

_DV_REG  = os.path.join(FONTS_DIR, "DejaVuSans.ttf")
_DV_BOLD = os.path.join(FONTS_DIR, "DejaVuSans-Bold.ttf")

# System-font fallback chain (used only when download fails)
_SYS_FONT_CANDIDATES = [
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
     "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ("/Library/Fonts/Arial Unicode MS.ttf",
     "/Library/Fonts/Arial Bold.ttf"),
]

def _register_fonts() -> None:
    if os.path.exists(_DV_REG) and os.path.exists(_DV_BOLD):
        pdfmetrics.registerFont(TTFont("DV",  _DV_REG))
        pdfmetrics.registerFont(TTFont("DVB", _DV_BOLD))
        return
    for reg, bold in _SYS_FONT_CANDIDATES:
        if os.path.exists(reg) and os.path.exists(bold):
            pdfmetrics.registerFont(TTFont("DV",  reg))
            pdfmetrics.registerFont(TTFont("DVB", bold))
            print(f"[font] Sistem fontu kullanılıyor: {reg}")
            return
    raise RuntimeError(
        "Türkçe karakter destekleyen hiçbir font bulunamadı. "
        "backend/assets/fonts/ klasörüne DejaVuSans.ttf ve DejaVuSans-Bold.ttf kopyalayın."
    )

_register_fonts()

# ─── Colors ───────────────────────────────────────────────────────────────────
BLUE   = colors.HexColor("#1E6EB5")
RED    = colors.HexColor("#CC2222")
DARK   = colors.HexColor("#111111")
GRAY   = colors.HexColor("#555555")
LGRAY  = colors.HexColor("#888888")
ROW_A  = colors.HexColor("#EBF4FC")
ROW_B  = colors.white
BORDER = colors.HexColor("#BBCFE0")


# ─── Logo helper ──────────────────────────────────────────────────────────────

def get_logo_png() -> Optional[str]:
    """
    Crop the top-left 28 % × 22 % of aydede-foto.jpg, remove white background,
    save as aydede-logo.png (cached). Returns the PNG path, or None if source missing.
    """
    dest = os.path.join(ASSETS_DIR, "aydede-logo.png")
    if os.path.exists(dest):
        return dest

    src = os.path.join(ASSETS_DIR, "aydede-foto.jpg")
    if not os.path.exists(src):
        return None

    try:
        import numpy as np
        from PIL import Image

        img  = Image.open(src).convert("RGBA")
        iw, ih = img.size
        crop = img.crop((0, 0, int(iw * 0.28), int(ih * 0.22)))
        arr  = np.array(crop)
        white = (arr[:, :, 0] > 220) & (arr[:, :, 1] > 220) & (arr[:, :, 2] > 220)
        arr[white, 3] = 0
        Image.fromarray(arr).save(dest)
        return dest
    except Exception as exc:
        print(f"[warn] Logo üretilemedi: {exc}")
        return None


# ─── Checkbox helper ──────────────────────────────────────────────────────────

def _draw_checkbox(c, x, y, checked: bool):
    size = 3.5 * mm
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.6)
    c.rect(x, y, size, size, stroke=1, fill=0)
    if checked:
        c.setStrokeColor(BLUE)
        c.setLineWidth(1)
        c.line(x + 0.7 * mm, y + 1.6 * mm, x + 1.5 * mm, y + 0.8 * mm)
        c.line(x + 1.5 * mm, y + 0.8 * mm, x + 3.0 * mm, y + 2.9 * mm)


def _fmt_date(v):
    if not v:
        return "-"
    s = str(v)
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return f"{s[8:10]}.{s[5:7]}.{s[0:4]}"
    return s


# ─── Main PDF generator ───────────────────────────────────────────────────────

def generate_rezervasyon_pdf(data: dict, out_path: str):
    W, H = A4
    M    = 13 * mm
    TW   = W - 2 * M

    c = canvas.Canvas(out_path, pagesize=A4)

    # ── Outer border ──────────────────────────────────────────────────────────
    c.setStrokeColor(BLUE)
    c.setLineWidth(2)
    c.rect(M - 3 * mm, 9 * mm, TW + 6 * mm, H - 18 * mm, stroke=1, fill=0)

    # ── Header logo ───────────────────────────────────────────────────────────
    logo_path = data.get("logo_path") or get_logo_png()
    if logo_path and os.path.exists(logo_path):
        try:
            c.drawImage(
                logo_path,
                M, H - 47 * mm,
                width=34 * mm, height=34 * mm,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            logo_path = None

    if not logo_path or not os.path.exists(logo_path or ""):
        c.setFillColor(BLUE)
        c.setFont("DVB", 14)
        c.drawString(M, H - 30 * mm, "AYDEDE")

    # ── Center titles ─────────────────────────────────────────────────────────
    c.setFillColor(BLUE)
    c.setFont("DVB", 12)
    c.drawCentredString(W / 2, H - 22 * mm, "AYDEDE TATİL EVLERİ & CAMPING")

    c.setFillColor(RED)
    c.setFont("DVB", 16)
    c.drawCentredString(W / 2, H - 32 * mm, "REZERVASYON FORMU")

    c.setFillColor(DARK)
    c.setFont("DVB", 12)
    c.drawRightString(W - M, H - 32 * mm, f"No: {data.get('no', '-')}")

    # ── Top-right contact block ────────────────────────────────────────────────
    c.setFillColor(RED)
    c.setFont("DVB", 7.5)
    c.drawRightString(W - M, H - 15 * mm, "TÜRSAB  Belge No: 6444")

    c.setFillColor(LGRAY)
    c.setFont("DV", 7)
    right_lines = [
        "Aydede Tatil Evleri",
        "Cumhuriyet Mah. Turizm Cad. No:12",
        "Ortaca / Muğla",
        "Gsm: 0533 297 2390",
    ]
    yy = H - 19 * mm
    for line in right_lines:
        c.drawRightString(W - M, yy, line)
        yy -= 4 * mm

    # ── Separator ─────────────────────────────────────────────────────────────
    sep_y = H - 49 * mm
    c.setStrokeColor(BLUE)
    c.setLineWidth(1)
    c.line(M, sep_y, W - M, sep_y)

    # ── Table ─────────────────────────────────────────────────────────────────
    table_top = sep_y - 2 * mm
    col1_w    = 72 * mm
    col2_w    = TW - col1_w
    head_h    = 9 * mm

    c.setFillColor(BLUE)
    c.rect(M,           table_top - head_h, col1_w, head_h, fill=1, stroke=0)
    c.rect(M + col1_w,  table_top - head_h, col2_w, head_h, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("DVB", 8.5)
    base_y = table_top - head_h + (head_h - 8.5) / 2 + 1.2
    c.drawString(M + 2.5 * mm,          base_y, "Bilgi")
    c.drawString(M + col1_w + 2.5 * mm, base_y, "Değer")

    rows = [
        ("single", "Misafir İsim-Soyisim",       data.get("misafir_isim",   "-"), 10 * mm),
        ("single", "Misafir Kişi Sayısı",         data.get("kisi_sayisi",    "-"), 10 * mm),
        ("single", "Misafir İletişim Numarası",   data.get("iletisim",       "-"), 10 * mm),
        ("single", "Konaklama Yeri",              data.get("konaklama_yeri", "-"), 10 * mm),
        ("single", "Rezervasyon Yapılan Tarih",   data.get("rez_tarihi",     "-"), 10 * mm),
        ("single", "Konaklama Giriş Tarihi",      data.get("giris_tarihi",   "-"), 10 * mm),
        ("single", "Konaklama Çıkış Tarihi",      data.get("cikis_tarihi",   "-"), 10 * mm),
        ("single", "Konaklama Gün Sayısı",        data.get("gun_sayisi",     "-"), 10 * mm),
        ("single", "Toplam Ödeme Tutarı",         f"# {data.get('toplam_tutar', '-')} TL #", 10 * mm),
        (
            "double",
            ("Rezervasyon İçin Alınan", "Ön Ödeme Tutarı"),
            f"# {data.get('on_odeme', '-')} TL #",
            14 * mm,
        ),
        (
            "double",
            ("Girişte Alınacak Olan", "Kalan Ödeme Tutarı"),
            f"# {data.get('kalan_odeme', '-')} TL #",
            14 * mm,
        ),
    ]

    y = table_top - head_h
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.4)

    for i, (rtype, label, val, h) in enumerate(rows):
        bg  = ROW_A if i % 2 == 0 else ROW_B
        y  -= h
        c.setFillColor(bg)
        c.rect(M,          y, col1_w, h, fill=1, stroke=0)
        c.rect(M + col1_w, y, col2_w, h, fill=1, stroke=0)
        c.rect(M,          y, col1_w, h, fill=0, stroke=1)
        c.rect(M + col1_w, y, col2_w, h, fill=0, stroke=1)

        c.setFillColor(GRAY)
        c.setFont("DVB", 8)
        if rtype == "single":
            ly = y + (h - 8) / 2 + 1.2
            c.drawString(M + 2.5 * mm, ly, label)
        else:
            line1, line2 = label
            c.drawString(M + 2.5 * mm, y + h - 4.5 * mm, line1)
            c.drawString(M + 2.5 * mm, y + h - 9.5 * mm, line2)

        money_row = "Ödeme Tutarı" in (label if isinstance(label, str) else " ".join(label))
        c.setFillColor(DARK)
        c.setFont("DVB" if money_row else "DV", 9.5 if money_row else 8.5)
        vfs = 9.5 if money_row else 8.5
        vy  = y + (h - vfs) / 2 + 1.2
        c.drawString(M + col1_w + 2.5 * mm, vy, str(val))

    table_bottom = y

    # ─── Below-table sections ─────────────────────────────────────────────────
    sec_y = table_bottom - 8 * mm   # top of "Ek Temizlik" row

    # ── Ek Temizlik ───────────────────────────────────────────────────────────
    c.setFillColor(DARK)
    c.setFont("DVB", 8.5)
    c.drawString(M, sec_y, "Ek Temizlik Ücreti")
    _draw_checkbox(c, M + 45 * mm, sec_y - 3.2 * mm, bool(data.get("temizlik_var")))
    c.setFont("DV", 8.5)
    c.drawString(M + 49.5 * mm, sec_y, "Var")
    _draw_checkbox(c, M + 61 * mm, sec_y - 3.2 * mm, not bool(data.get("temizlik_var")))
    c.drawString(M + 65.5 * mm, sec_y, "Yok")
    c.drawString(M + 78 * mm,   sec_y, f"Tutar: {data.get('temizlik_tutar') or '—'}")

    # ── Signature box (right side, aligned to Temizlik top) ───────────────────
    bw, bh = 55 * mm, 32 * mm
    bx     = W - M - bw
    by     = sec_y - bh                # bottom-left corner of box

    c.setFillColor(colors.HexColor("#F4F9FF"))
    c.setStrokeColor(BLUE)
    c.setLineWidth(0.8)
    c.roundRect(bx, by, bw, bh, 2 * mm, fill=1, stroke=1)

    c.setFillColor(DARK)
    c.setFont("DVB", 7.5)
    c.drawCentredString(bx + bw / 2, by + bh - 6 * mm, "Rezervasyonu Alan / İmza")

    c.setFont("DVB", 8.5)
    c.drawCentredString(bx + bw / 2, by + bh - 12 * mm, str(data.get("rez_alan", "-")))

    imza_path = data.get("imza_path")
    if imza_path and os.path.exists(imza_path):
        try:
            c.drawImage(
                imza_path,
                bx + 4 * mm, by + 8 * mm,
                width=bw - 8 * mm, height=12 * mm,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            imza_path = None

    if not imza_path or not os.path.exists(imza_path or ""):
        c.setStrokeColor(LGRAY)
        c.setLineWidth(0.5)
        c.line(bx + 5 * mm, by + 10 * mm, bx + bw - 5 * mm, by + 10 * mm)

    # ── Depozito notu ─────────────────────────────────────────────────────────
    depo_y = sec_y - 7 * mm
    c.setFillColor(GRAY)
    c.setFont("DV", 7.5)
    if data.get("hasar_depozito_var", True):
        c.drawString(
            M, depo_y,
            f"Not: Toplam tutara ek {data.get('depozito_tutar', '0')} TL hasar depozitosu alınacaktır.",
        )
        c.drawString(
            M, depo_y - 4.5 * mm,
            "Çıkıştan 10 dakika önce yapılacak kontrolde hasar yoksa iade edilecektir.",
        )
    else:
        c.drawString(
            M, depo_y,
            "Not: Bu rezervasyonda hasar depozitosu alınmayacaktır.",
        )
        c.drawString(
            M, depo_y - 4.5 * mm,
            "Depozito iadesi süreci uygulanmaz.",
        )

    # ── Hasar Depozitosu ──────────────────────────────────────────────────────
    hasar_y = depo_y - 12 * mm
    c.setFillColor(DARK)
    c.setFont("DVB", 8.5)
    c.drawString(M, hasar_y, "Hasar Depozitosu")
    hasar_var = bool(data.get("hasar_depozito_var", True))
    _draw_checkbox(c, M + 33 * mm, hasar_y - 3.2 * mm, hasar_var)
    c.setFont("DV", 8.5)
    c.drawString(M + 37.5 * mm, hasar_y, "Var")
    _draw_checkbox(c, M + 48 * mm, hasar_y - 3.2 * mm, not hasar_var)
    c.drawString(M + 52.5 * mm, hasar_y, "Yok")

    # ── İptal/İade Footer ─────────────────────────────────────────────────────
    footer_y = hasar_y - 8 * mm - 22 * mm
    c.setFillColor(colors.HexColor("#FFF5F5"))
    c.setStrokeColor(RED)
    c.setLineWidth(0.8)
    c.roundRect(M, footer_y, TW, 22 * mm, 2 * mm, fill=1, stroke=1)
    c.setFillColor(RED)
    c.setFont("DVB", 8.5)
    c.drawString(M + 2.5 * mm, footer_y + 17.5 * mm, "İptal / İade Politikası:")
    c.setFillColor(DARK)
    c.setFont("DV", 7.5)
    c.drawString(
        M + 2.5 * mm, footer_y + 13 * mm,
        "Giriş gününden 30 gün öncesine kadar misafirin iade ya da tarih değişikliği hakkı bulunmaktadır.",
    )
    c.drawString(
        M + 2.5 * mm, footer_y + 8.5 * mm,
        "30 günden kısa sürede iptal/iade yapılmayacaktır. Misafir iptal etmek isterse ödemenin",
    )
    c.drawString(
        M + 2.5 * mm, footer_y + 4 * mm,
        "tamamını yapmak zorundadır.",
    )

    c.showPage()
    c.save()
