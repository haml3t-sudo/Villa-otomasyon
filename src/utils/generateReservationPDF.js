import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import aydedeLogo from "../assets/aydede-logo.png";

const LOGO_PATH = aydedeLogo;

function formatDateTR(dateLike) {
  if (!dateLike) return "-";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return String(dateLike);
  return d.toLocaleDateString("tr-TR");
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString("tr-TR")} ₺`;
}

function diffDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

function deriveReservationNo(reservation) {
  return (
    reservation?.reservation_no ||
    reservation?.reservationNo ||
    reservation?.no ||
    reservation?.id ||
    "-"
  );
}

function sanitizeFilename(text) {
  return String(text || "misafir")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9çğıöşü_]/gi, "");
}

async function loadImageDataUrl(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function drawCheckbox(doc, x, y, label, checked = false) {
  doc.rect(x, y - 3, 3, 3);
  if (checked) {
    doc.setLineWidth(0.4);
    doc.line(x + 0.5, y - 1.5, x + 1.3, y - 0.4);
    doc.line(x + 1.3, y - 0.4, x + 2.6, y - 2.6);
  }
  doc.text(label, x + 4.2, y);
}

export async function generateReservationPDF(reservation) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  const villaName =
    reservation?.villaName ||
    reservation?.villa?.name ||
    reservation?.villa_name ||
    "-";
  const guestName = reservation?.guestName || reservation?.guest_name || "-";
  const guestPhone = reservation?.guestPhone || reservation?.guest_phone || "-";
  const adults = Number(reservation?.adults || 0);
  const children = Number(reservation?.children || 0);
  const guestCount = adults + children;
  const reservationNo = deriveReservationNo(reservation);
  const createdAt =
    reservation?.createdAt || reservation?.created_at || new Date().toISOString();
  const startDate = reservation?.startDate || reservation?.start_date;
  const endDate = reservation?.endDate || reservation?.end_date;
  const nights = diffDays(startDate, endDate);
  const totalAmount = reservation?.toplamTutar ?? reservation?.toplam_tutar ?? 0;
  const prepayment = reservation?.alinanOnOdeme ?? reservation?.alinan_on_odeme ?? 0;
  const remaining = reservation?.kapidaOdenecek ?? reservation?.kapida_odenecek ?? 0;
  const depositAmount =
    reservation?.depozito_tutar ?? reservation?.depozitoTutar ?? 0;
  const staffName = reservation?.createdBy || reservation?.created_by || "-";
  const extraCleaning = Number(reservation?.ek_temizlik_ucreti || 0);

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const logoDataUrl = await loadImageDataUrl(LOGO_PATH);
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 12, 10, 35, 20);
    } catch {
      doc.setTextColor(60, 60, 60);
      doc.text("AYDEDE", 16, 20);
    }
  } else {
    doc.setTextColor(60, 60, 60);
    doc.text("AYDEDE", 16, 20);
  }

  doc.setTextColor(31, 78, 121);
  doc.setFontSize(14);
  doc.text("AYDEDE TATİL EVLERİ & CAMPING", pageWidth / 2, 18, { align: "center" });
  doc.setTextColor(180, 0, 0);
  doc.setFontSize(12);
  doc.text("REZERVASYON FORMU", pageWidth / 2, 25, { align: "center" });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`No: ${reservationNo}`, pageWidth - 12, 25, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    [
      "TÜRSAB Belge No: 6444",
      "Aydede Tatil Evleri",
      "Cumhuriyet Mah. Turizm Cad. No:12",
      "Ortaca / Muğla",
    ],
    pageWidth - 12,
    11,
    { align: "right" },
  );

  const rows = [
    ["Misafir İsim-Soyisim", guestName],
    ["Misafir Kişi Sayısı", String(guestCount || "-")],
    ["Misafir İletişim Numarası", guestPhone],
    ["Konaklama Yeri", villaName],
    ["Rezervasyon Yapılan Tarih", formatDateTR(createdAt)],
    ["Konaklama Giriş Tarihi", formatDateTR(startDate)],
    ["Konaklama Çıkış Tarihi", formatDateTR(endDate)],
    ["Konaklama Gün Sayısı", `${nights} Gece`],
    ["Toplam Ödeme Tutarı", `# ${formatCurrency(totalAmount)} #`],
    ["Rezervasyon İçin Alınan Ön Ödeme Tutarı", `# ${formatCurrency(prepayment)} #`],
    ["Girişte Alınacak Olan Kalan Ödeme Tutarı", `# ${formatCurrency(remaining)} #`],
  ];

  autoTable(doc, {
    startY: 35,
    head: [["Bilgi", "Değer"]],
    body: rows,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, lineColor: [210, 210, 210], lineWidth: 0.2 },
    headStyles: { fillColor: [231, 76, 60], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 63, fontStyle: "bold" },
      1: { cellWidth: 122 },
    },
  });

  let y = doc.lastAutoTable.finalY + 8;
  if (y > 230) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Ek Temizlik Ücreti", 14, y);
  doc.setFont("helvetica", "normal");
  drawCheckbox(doc, 58, y, "Var", extraCleaning > 0);
  drawCheckbox(doc, 78, y, "Yok", extraCleaning <= 0);
  doc.text(`Tutar: ${extraCleaning > 0 ? formatCurrency(extraCleaning) : "-"}`, 98, y);

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Depozito Notu: Çıkışta villa kontrolü sonrası hasar/deformasyon yoksa # ${formatCurrency(depositAmount)} # iade edilir.`,
    14,
    y,
    { maxWidth: pageWidth - 26 },
  );

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Hasar Depozitosu", 14, y);
  doc.setFont("helvetica", "normal");
  drawCheckbox(doc, 58, y, "Var", true);
  drawCheckbox(doc, 78, y, "Yok", false);

  // Signature box
  const boxX = pageWidth - 80;
  const boxY = y + 4;
  doc.setDrawColor(120);
  doc.rect(boxX, boxY, 66, 34);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Rezervasyonu Alan / İmza", boxX + 33, boxY + 8, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.text(staffName, boxX + 33, boxY + 17, { align: "center" });
  doc.setDrawColor(180);
  doc.line(boxX + 8, boxY + 25, boxX + 58, boxY + 25);

  // Footer policy
  const footerY = 278;
  doc.setFillColor(198, 40, 40);
  doc.rect(10, footerY - 8, pageWidth - 20, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(
    "İptal/İade Politikası: Konaklamaya 30 günden az kala yapılan iptallerde ön ödeme iade edilmez.",
    pageWidth / 2,
    footerY,
    { align: "center", maxWidth: pageWidth - 28 },
  );
  doc.setTextColor(0, 0, 0);

  const filename = `rezervasyon_${reservationNo}_${sanitizeFilename(guestName)}.pdf`;
  doc.save(filename);
}
