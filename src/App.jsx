import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell,
} from "recharts";
import { useAuth } from "./contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./components/ProtectedRoute";
import StaffManagementPage from "./pages/StaffManagementPage";
import AuditLogsPage from "./pages/AuditLogsPage";

const menuItems = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Villalar", to: "/villas" },
  { label: "Rezervasyonlar", to: "/reservations" },
  { label: "Görevler", to: "/tasks" },
  { label: "Aktivite Yönetimi", to: "/activities" },
  { label: "Finans & Hakediş", to: "/finance", requiredRole: "admin" },
  { label: "📊 İstatistikler", to: "/statistics", requiredRole: "admin" },
  { label: "👥 Personel Yönetimi", to: "/staff", requiredRole: "admin" },
  { label: "🔍 Sistem Günlükleri", to: "/audit-logs", requiredRole: "admin" },
];

const villaStatuses = ["Onay Bekliyor", "Görüşülüyor", "Beklemede", "Onaylandı"];
const taskColumns = ["Yapılacak", "Yapılıyor", "Tamamlandı"];
const weekDays = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const ACTIVITY_GUIDE_LINK = "https://www.goturkiye.com/tr/homepage";
const ACTIVITY_GUIDE_PDF =
  "https://cdn.sanity.io/files/5qg0txzv/production/cf4ac57d64cf2b2ce5f64c25899653c8f79f4f4a.pdf";

const importTargets = [
  { key: "name", label: "Villa Adı", recommended: true },
  { key: "owner", label: "Sahibi", recommended: true },
  { key: "location", label: "Konum", recommended: false },
  { key: "phone", label: "Telefon", recommended: false },
  { key: "status", label: "Durum", recommended: false },
  { key: "log", label: "İletişim Geçmişi", recommended: false },
];

const initialVillas = [
  {
    id: 1,
    name: "Ege Esintisi Villası",
    owner: "Leyla Demir",
    location: "Muğla / Bodrum",
    phone: "+90 532 111 22 33",
    status: "Onaylandı",
    logs: [
      {
        id: "log-1",
        villaName: "Ege Esintisi Villası",
        author: "Ayşe",
        createdAt: "2026-02-21T09:30:00.000Z",
        result: "Sahibiyle görüşüldü, onay bekliyor.",
        message: "Sahibiyle görüşüldü, onay bekliyor.",
      },
    ],
    operational: {
      keyInfo: "Anahtar ofiste mevcut.",
      cleaningInfo: "Temizlik haftada 2 gün planlandı.",
      ownerSpecialRequests: "Havuz bakım raporu her cuma paylaşılacak.",
      criticalNotes: [
        {
          id: "critical-1",
          createdAt: "2026-02-22T08:00:00.000Z",
          author: "Ayşe",
          note: "Anahtar teslimi sadece yetkili personele yapılmalı.",
        },
      ],
    },
  },
  {
    id: 2,
    name: "Çamlık Konak",
    owner: "Murat Yılmaz",
    location: "Antalya / Kaş",
    phone: "+90 533 222 33 44",
    status: "Görüşülüyor",
    logs: [],
    operational: {
      keyInfo: "",
      cleaningInfo: "",
      ownerSpecialRequests: "",
      criticalNotes: [],
    },
  },
];

const initialReservations = [
  {
    id: 1,
    villaId: 1,
    guestName: "Seda K.",
    guestEmail: "seda@example.com",
    guestPhone: "+90 555 123 45 67",
    nationality: "Türkiye",
    idNumber: "11111111111",
    adults: 2,
    children: 1,
    channel: "Web Sitesi",
    specialRequests: "Çocuk yatağı talebi var.",
    notes: "Erken giriş talep edildi.",
    startDate: "2026-03-05",
    endDate: "2026-03-09",
    // ── Ödeme bilgileri (yeni model) ─────────────────────────────────────────
    toplamTutar: 12000,
    bizimKomisyon: 2400,      // sabit %20
    alinanOnOdeme: 2400,      // müşteriden alınan ön ödeme
    kapidaOdenecek: 9600,     // toplam - alinanOnOdeme
    ajansBorc: 0,             // alinanOnOdeme == bizimKomisyon → borç yok
    onOdemeDurumu: "Ödendi",
    kapidaOdemeDurumu: "Ödendi",
    status: "Aktif",
    createdBy: "Ahmet Y.",
    createdAt: "2026-02-28T09:00:00.000Z",
  },
  {
    id: 2,
    villaId: 2,
    guestName: "Deniz T.",
    guestEmail: "deniz@example.com",
    guestPhone: "+90 544 987 65 43",
    nationality: "Almanya",
    idNumber: "XK123456",
    adults: 2,
    children: 0,
    channel: "Villa Scout Pro",
    specialRequests: "Havalimanı transferi istiyor.",
    notes: "Akşam geç check-in.",
    startDate: "2026-03-10",
    endDate: "2026-03-14",
    // ── Ödeme bilgileri ─────────────────────────────────────────────────────
    toplamTutar: 9500,
    bizimKomisyon: 1900,
    alinanOnOdeme: 3800,      // müşteri %40 ödedi — biz %20'den fazla aldık
    kapidaOdenecek: 5700,     // 9500 - 3800
    ajansBorc: 1900,          // 3800 - 1900 → ev sahibine ödenmesi gereken borç
    onOdemeDurumu: "Ödendi",
    kapidaOdemeDurumu: "Beklemede",
    status: "Aktif",
    createdBy: "Selin K.",
    createdAt: "2026-02-28T10:00:00.000Z",
  },
];

const initialTasks = [
  { id: 1, title: "Villa fotoğraflarını yükle", status: "Yapılacak", assignedToId: null, assignedToName: null, dueDate: null },
  { id: 2, title: "Sahip sözleşmesini kontrol et", status: "Yapılıyor", assignedToId: null, assignedToName: null, dueDate: null },
  { id: 3, title: "Yeni villa kaydını onayla", status: "Tamamlandı", assignedToId: null, assignedToName: null, dueDate: null },
];

// Yardımcı: Gelir transaction hesaplama
// bizimKomisyon = sabit %20 (her zaman)
// alinanOnOdeme = gerçekte müşteriden alınan ön ödeme (varsayılan: tam komisyon = %20)
// kapidaOdenecek = toplam - alinanOnOdeme (misafir check-in'de öder)
// ajansBorc = max(0, alinanOnOdeme - bizimKomisyon)
//   → müşteri %20'den fazla ödediyse fazlalık ev sahibine borçlanılır
function buildGelirTx(base, alinanOnOdemeAmount = null) {
  const bizimKomisyon  = Math.round(base.miktar * 20 / 100);
  const alinanOnOdeme  = alinanOnOdemeAmount ?? bizimKomisyon;
  const kapidaOdenecek = base.miktar - alinanOnOdeme;
  const ajansBorc      = Math.max(0, alinanOnOdeme - bizimKomisyon);
  return { ...base, bizimKomisyon, alinanOnOdeme, kapidaOdenecek, ajansBorc };
}

const initialTransactions = [
  // ─── Gelir kayıtları (%20 bizim, %80 ev sahibine kapıda) ───────────────────
  buildGelirTx({
    id: 1,
    villaId: 1,
    rezervasyonId: 1,
    islemTipi: "Gelir",
    miktar: 12000,             // toplam rezervasyon bedeli
    islemTarihi: "2026-03-05",
    aciklama: "Rezervasyon — Ayşe K. (5–9 Mar)",
    durum: "Ödendi",           // bizim %20'yi tahsil ettik
    kapidaOdemeDurumu: "Ödendi", // ev sahibi %80'i kapıda aldı
    createdBy: "Operasyon Kullanıcısı",
    createdAt: "2026-03-05T09:00:00.000Z",
  }),
  buildGelirTx({
    id: 4,
    villaId: 2,
    rezervasyonId: 2,
    islemTipi: "Gelir",
    miktar: 9500,
    islemTarihi: "2026-03-10",
    aciklama: "Rezervasyon — Deniz T. (10–14 Mar)",
    durum: "Beklemede",        // bizim %20'yi henüz tahsil etmedik
    kapidaOdemeDurumu: "Beklemede",
    createdBy: "Operasyon Kullanıcısı",
    createdAt: "2026-03-10T09:00:00.000Z",
  }),
  buildGelirTx({
    id: 6,
    villaId: 1,
    rezervasyonId: null,
    islemTipi: "Gelir",
    miktar: 3500,
    islemTarihi: "2026-02-20",
    aciklama: "Kısa dönem rezervasyon — Şubat sonu",
    durum: "Ödendi",
    kapidaOdemeDurumu: "Ödendi",
    createdBy: "Operasyon Kullanıcısı",
    createdAt: "2026-02-20T10:00:00.000Z",
  }),

  // ─── Ajans Borcu örneği: müşteri %40 ödedi, bizim payımız %20 → 2.400₺ ev sahibine borç ───
  buildGelirTx({
    id: 10,
    villaId: 1,
    rezervasyonId: 3,
    islemTipi: "Gelir",
    miktar: 6000,
    islemTarihi: "2026-03-15",
    aciklama: "Rezervasyon — Mert S. (15–18 Mar) — Müşteri %40 ön ödeme yaptı",
    durum: "Ödendi",
    kapidaOdemeDurumu: "Beklemede",
    createdBy: "Operasyon Kullanıcısı",
    createdAt: "2026-03-01T10:00:00.000Z",
  }, 2400), // alinanOnOdeme=2400 (> bizimKomisyon=1200) → ajansBorc=1200

  // ─── Gider kayıtları ─────────────────────────────────────────────────────────
  {
    id: 2, villaId: 1, rezervasyonId: 1, islemTipi: "Gider",
    miktar: 850, bizimKomisyon: null, alinanOnOdeme: null, kapidaOdenecek: null,
    kapidaOdemeDurumu: null, ajansBorc: null,
    islemTarihi: "2026-03-05", aciklama: "Temizlik hizmeti — Ayşe K. girişi",
    durum: "Ödendi", createdBy: "Operasyon Kullanıcısı",
    createdAt: "2026-03-05T10:00:00.000Z",
  },
  {
    id: 3, villaId: 1, rezervasyonId: null, islemTipi: "Gider",
    miktar: 2200, bizimKomisyon: null, alinanOnOdeme: null, kapidaOdenecek: null,
    kapidaOdemeDurumu: null, ajansBorc: null,
    islemTarihi: "2026-02-15", aciklama: "Klima bakım & tamir",
    durum: "Ödendi", createdBy: "Operasyon Kullanıcısı",
    createdAt: "2026-02-15T14:00:00.000Z",
  },
  {
    id: 5, villaId: 2, rezervasyonId: null, islemTipi: "Gider",
    miktar: 450, bizimKomisyon: null, alinanOnOdeme: null, kapidaOdenecek: null,
    kapidaOdemeDurumu: null, ajansBorc: null,
    islemTarihi: "2026-03-01", aciklama: "Havuz bakım hizmeti",
    durum: "Ödendi", createdBy: "Operasyon Kullanıcısı",
    createdAt: "2026-03-01T11:00:00.000Z",
  },
  {
    id: 7, villaId: 2, rezervasyonId: null, islemTipi: "Gider",
    miktar: 1100, bizimKomisyon: null, alinanOnOdeme: null, kapidaOdenecek: null,
    kapidaOdemeDurumu: null, ajansBorc: null,
    islemTarihi: "2026-03-12", aciklama: "Çamaşır & tekstil yenileme",
    durum: "Beklemede", createdBy: "Operasyon Kullanıcısı",
    createdAt: "2026-03-12T16:00:00.000Z",
  },

  // ─── Aktivite satışları ───────────────────────────────────────────────────────
  {
    id: 8, villaId: 1, rezervasyonId: 1, islemTipi: "Aktivite",
    miktar: 1400, bizimKomisyon: null, alinanOnOdeme: null,
    kapidaOdenecek: null, kapidaOdemeDurumu: null, ajansBorc: null,
    islemTarihi: "2026-03-06",
    aciklama: "Aktivite satışı — Gün Batımı Tekne Turu (2 kişi)",
    durum: "Ödendi", createdBy: "Operasyon Kullanıcısı",
    createdAt: "2026-03-06T11:00:00.000Z",
  },
  {
    id: 9, villaId: 2, rezervasyonId: 2, islemTipi: "Aktivite",
    miktar: 750, bizimKomisyon: null, alinanOnOdeme: null,
    kapidaOdenecek: null, kapidaOdemeDurumu: null, ajansBorc: null,
    islemTarihi: "2026-03-11",
    aciklama: "Aktivite satışı — Jeep Safari (1 kişi)",
    durum: "Beklemede", createdBy: "Operasyon Kullanıcısı",
    createdAt: "2026-03-11T14:00:00.000Z",
  },
];

const initialActivities = [
  {
    id: "act-1",
    title: "Gün Batımı Tekne Turu",
    category: "Tekne Turu",
    city: "Muğla",
    regions: ["Bodrum", "Marmaris", "Fethiye"],
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    priceTry: 3500,
    durationValue: 3,
    durationUnit: "Saat",
    description: "Akşam yemeği dahil özel tekne turu. Ege'nin eşsiz manzarası eşliğinde gün batımını izleyin.",
    photos: [],
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    variations: [
      { id: "var-1a", name: "Gün Batımı (3 Saat)", priceTry: 3500, durationValue: 3, durationUnit: "Saat" },
      { id: "var-1b", name: "Tam Gün (8 Saat)", priceTry: 6200, durationValue: 8, durationUnit: "Saat" },
    ],
  },
  {
    id: "act-2",
    title: "Tüplü Dalış Deneyimi",
    category: "Dalış",
    city: "Antalya",
    regions: [],
    startDate: "2026-03-05",
    endDate: "2026-04-20",
    priceTry: 4200,
    durationValue: 4,
    durationUnit: "Saat",
    description: "Lisanslı eğitmen eşliğinde yarım gün dalış. Tüm ekipman dahildir.",
    photos: [],
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    variations: [
      { id: "var-2a", name: "Yarım Gün", priceTry: 4200, durationValue: 4, durationUnit: "Saat" },
      { id: "var-2b", name: "Tam Gün (2 Dalış)", priceTry: 7500, durationValue: 8, durationUnit: "Saat" },
    ],
  },
  {
    id: "act-3",
    title: "Bağ Rotası ve Tadım Turu",
    category: "Gastronomi",
    city: "İzmir",
    regions: ["Urla", "Çeşme"],
    startDate: "2026-03-01",
    endDate: "2026-05-30",
    priceTry: 2900,
    durationValue: 1,
    durationUnit: "Gün",
    description: "Urla bölgesinde butik bağ gezisi. Yerel tatlar ve şarap tadımı dahildir.",
    photos: [],
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    variations: [],
  },
  {
    id: "act-4",
    title: "Doğa Yürüyüşü ve Jeep Safari",
    category: "Jeep Safari",
    city: "Antalya",
    regions: ["Kaş", "Kalkan"],
    startDate: "2026-03-10",
    endDate: "2026-06-15",
    priceTry: 2600,
    durationValue: 1,
    durationUnit: "Gün",
    description: "Transfer dahil tam gün safari turu. Toros dağlarında nefes kesici bir macera.",
    photos: [],
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    variations: [
      { id: "var-4a", name: "Yarım Gün Jeep", priceTry: 1800, durationValue: 4, durationUnit: "Saat" },
      { id: "var-4b", name: "Tam Gün + Trekking", priceTry: 2600, durationValue: 1, durationUnit: "Gün" },
      { id: "var-4c", name: "VIP Özel Grup", priceTry: 4500, durationValue: 1, durationUnit: "Gün" },
    ],
  },
  {
    id: "act-5",
    title: "Tandem Yamaç Paraşütü",
    category: "Yamaç Paraşütü",
    city: "Muğla",
    regions: ["Ölüdeniz", "Fethiye"],
    startDate: "2026-04-01",
    endDate: "2026-10-31",
    priceTry: 5500,
    durationValue: 2,
    durationUnit: "Saat",
    description: "Profesyonel pilot eşliğinde tandem uçuş. Tüm ekipman ve transfer dahil.",
    photos: [],
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    variations: [
      { id: "var-5a", name: "Standart Uçuş", priceTry: 5500, durationValue: 25, durationUnit: "Dakika" },
      { id: "var-5b", name: "Uzun Uçuş + Video", priceTry: 7500, durationValue: 45, durationUnit: "Dakika" },
    ],
  },
  {
    id: "act-6",
    title: "ATV Motor Turu",
    category: "Motor Turu",
    city: "Antalya",
    regions: [],
    startDate: "2026-03-01",
    endDate: "2026-11-30",
    priceTry: 1800,
    durationValue: 2,
    durationUnit: "Saat",
    description: "Engebeli arazi üzerinde ATV sürüşü. Güneş batımı turları da mevcuttur.",
    photos: [],
    isActive: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    variations: [
      { id: "var-6a", name: "2 Saatlik Tur", priceTry: 1800, durationValue: 2, durationUnit: "Saat" },
      { id: "var-6b", name: "Gün Batımı Turu", priceTry: 2400, durationValue: 3, durationUnit: "Saat" },
    ],
  },
];

const statusBadgeMap = {
  Onaylandı: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "Onay Bekliyor": "bg-amber-100 text-amber-700 ring-amber-200",
  Görüşülüyor: "bg-blue-100 text-blue-700 ring-blue-200",
  Beklemede: "bg-slate-100 text-slate-700 ring-slate-200",
};

const activityCategories = [
  "Tekne Turu",
  "Su Sporları",
  "Yamaç Paraşütü",
  "Jeep Safari",
  "Trekking",
  "Dalış",
  "Motor Turu",
  "Gastronomi",
  "Diğer",
];

const categoryBadgeMap = {
  "Tekne Turu":     "bg-cyan-100 text-cyan-700",
  "Su Sporları":    "bg-blue-100 text-blue-700",
  "Yamaç Paraşütü": "bg-sky-100 text-sky-700",
  "Jeep Safari":    "bg-amber-100 text-amber-700",
  "Trekking":       "bg-green-100 text-green-700",
  "Dalış":          "bg-indigo-100 text-indigo-700",
  "Motor Turu":     "bg-orange-100 text-orange-700",
  "Gastronomi":     "bg-rose-100 text-rose-700",
  "Diğer":          "bg-slate-100 text-slate-700",
};

const ACTIVITIES_BUCKET = "activity-photos";

function nowIso() {
  return new Date().toISOString();
}

function formatDateTime(isoString) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoString));
}

function normalizeStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized.includes("onaylandı")) return "Onaylandı";
  if (normalized.includes("onay bek")) return "Onay Bekliyor";
  if (normalized.includes("görüş")) return "Görüşülüyor";
  if (normalized.includes("bek")) return "Beklemede";
  return "Onay Bekliyor";
}

function makeLog(author, message) {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author,
    createdAt: nowIso(),
    message,
  };
}

function defaultOperational() {
  return {
    keyInfo: "",
    cleaningInfo: "",
    ownerSpecialRequests: "",
    criticalNotes: [],
  };
}

function parseCsvRows(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((value) => value.trim());
    return headers.reduce((acc, header, index) => {
      acc[header] = values[index] || "";
      return acc;
    }, {});
  });
}

function parseXlsxRows(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(worksheet, { defval: "" });
}

function parseVillaScoutFile(fileName, text, arrayBuffer) {
  const lower = fileName.toLowerCase();
  const isJson = lower.endsWith(".json");
  const isCsv = lower.endsWith(".csv");
  const isXlsx = lower.endsWith(".xlsx");
  const isXls = lower.endsWith(".xls");

  if (!isJson && !isCsv && !isXlsx && !isXls) {
    throw new Error("Yalnızca JSON, CSV, XLSX veya XLS dosyası yükleyebilirsiniz.");
  }

  let records = [];
  if (isJson) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) records = parsed;
    else if (Array.isArray(parsed.villas)) records = parsed.villas;
    else throw new Error("JSON formatı desteklenmiyor.");
  } else if (isCsv) {
    records = parseCsvRows(text);
  } else {
    records = parseXlsxRows(arrayBuffer);
  }

  if (records.length === 0) {
    throw new Error("Dosyada içeri aktarılacak kayıt bulunamadı.");
  }

  const normalizedRecords = records.map((record) =>
    record && typeof record === "object" ? record : {},
  );
  const headers = Array.from(
    new Set(
      normalizedRecords.flatMap((record) =>
        Object.keys(record).map((header) => header.trim()),
      ),
    ),
  );

  if (headers.length === 0) {
    throw new Error("Dosyada eşleştirilecek sütun bulunamadı.");
  }

  return { records: normalizedRecords, headers };
}

function findHeader(headers, aliases) {
  const lowerMap = headers.reduce((acc, header) => {
    acc[header.toLowerCase()] = header;
    return acc;
  }, {});

  for (const alias of aliases) {
    const matched = lowerMap[alias.toLowerCase()];
    if (matched) return matched;
  }
  return "";
}

function createDefaultMapping(headers) {
  return {
    name: findHeader(headers, ["villa_name", "villa", "name", "villa adı"]),
    owner: findHeader(headers, ["owner", "owner_name", "sahibi", "sahip"]),
    location: findHeader(headers, ["location", "konum", "city", "il_ilce"]),
    phone: findHeader(headers, ["phone", "telefon", "owner_phone"]),
    status: findHeader(headers, ["status", "durum"]),
    log: findHeader(headers, [
      "log",
      "contact_log",
      "iletisim_gecmisi",
      "communication_history",
    ]),
  };
}

function buildVillaFromMappedRecord(record, mapping, index) {
  const getValue = (target) =>
    mapping[target] ? String(record[mapping[target]] || "").trim() : "";

  const name = getValue("name") || `İsimsiz Villa #${index + 1}`;
  const owner = getValue("owner") || "Belirtilmedi";
  const location = getValue("location");
  const phone = getValue("phone");
  const status = normalizeStatus(getValue("status"));
  const logText = getValue("log");

  return {
    id: Date.now() + index,
    name,
    owner,
    location,
    phone,
    status,
    logs: logText
      ? [
          {
            id: `import-log-${Date.now()}-${index}`,
            author: "Villa Scout Pro",
            createdAt: nowIso(),
            result: logText,
            message: logText,
          },
        ]
      : [],
    operational: defaultOperational(),
  };
}

function getDaysInMonth(monthValue) {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const firstWeekday = (first.getDay() + 6) % 7;
  const totalDays = last.getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, monthIndex, day);
    cells.push(date.toISOString().slice(0, 10));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isReservationOnDate(reservation, dateString) {
  return reservation.startDate <= dateString && reservation.endDate >= dateString;
}

function dateRangesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA;
}

function getVillaRegion(villa) {
  if (!villa?.location) return "";
  return villa.location.split("/")[0].trim();
}

function normalizeWhatsappNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("90")) return digits;
  if (digits.startsWith("0")) return `90${digits.slice(1)}`;
  return digits;
}

// ── Image resize utility (Canvas API — no extra dep) ────────────────────────
function resizeImage(file, maxPx = 1200, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(
        (blob) =>
          resolve(
            new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
              type: "image/jpeg",
            }),
          ),
        "image/jpeg",
        quality,
      );
    };
    img.src = objectUrl;
  });
}

// ── ActivityCard ────────────────────────────────────────────────────────────
const categoryEmoji = {
  "Tekne Turu": "⛵", "Yamaç Paraşütü": "🪂", "Jeep Safari": "🚙",
  "Dalış": "🤿", "Gastronomi": "🍷", "Motor Turu": "🏍️",
  "Trekking": "🥾", "Su Sporları": "🏄", "Diğer": "🌄",
};

function ActivityCard({ activity, onEdit, onDelete, onToggle }) {
  const badgeClass = categoryBadgeMap[activity.category] || categoryBadgeMap["Diğer"];
  const coverPhoto = activity.photos?.[0] || null;
  const vars = activity.variations || [];
  const hasVariations = vars.length > 0;

  const priceDisplay = useMemo(() => {
    if (!hasVariations) return `${(activity.priceTry || 0).toLocaleString("tr-TR")} ₺`;
    const prices = vars.map((v) => v.priceTry);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max
      ? `${min.toLocaleString("tr-TR")} ₺`
      : `${min.toLocaleString("tr-TR")} – ${max.toLocaleString("tr-TR")} ₺`;
  }, [activity.priceTry, vars, hasVariations]);

  const regions = activity.regions || [];

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      {/* Cover photo */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-slate-200 to-slate-300">
        {coverPhoto ? (
          <img
            src={coverPhoto}
            alt={activity.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center select-none text-5xl opacity-20">
            {categoryEmoji[activity.category] || "🌄"}
          </div>
        )}

        {/* Top-left: category */}
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ${badgeClass}`}>
          {activity.category}
        </span>

        {/* Top-right: active status */}
        <span className={`absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ${
          activity.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
        }`}>
          {activity.isActive ? "Aktif" : "Pasif"}
        </span>

        {/* Bottom-left: variation count badge */}
        {hasVariations && (
          <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-slate-900/70 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/>
            </svg>
            {vars.length} varyasyon
          </span>
        )}

        {/* Bottom-right: photo count */}
        {activity.photos?.length > 0 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-slate-900/70 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
            🖼 {activity.photos.length}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold leading-snug text-slate-900">{activity.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{activity.description}</p>

        {/* Price + duration */}
        <div className="mt-3 flex items-center gap-2.5 text-sm">
          <span className="font-bold text-blue-600">{priceDisplay}</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">
            {activity.durationValue} {activity.durationUnit}
          </span>
        </div>

        {/* Location row */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400">📍 {activity.city}</span>
          {regions.length > 0 && (
            <>
              <span className="text-slate-300 text-xs">·</span>
              {regions.slice(0, 3).map((r) => (
                <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {r}
                </span>
              ))}
              {regions.length > 3 && (
                <span className="text-xs text-slate-400">+{regions.length - 3}</span>
              )}
            </>
          )}
        </div>

        {/* Variation quick list (max 2) */}
        {hasVariations && (
          <div className="mt-3 space-y-1">
            {vars.slice(0, 2).map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                <span className="font-medium text-slate-700">{v.name}</span>
                <span className="font-semibold text-blue-600">
                  {(v.priceTry || 0).toLocaleString("tr-TR")} ₺
                </span>
              </div>
            ))}
            {vars.length > 2 && (
              <p className="text-center text-xs text-slate-400">+{vars.length - 2} varyasyon daha</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onToggle}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              activity.isActive
                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {activity.isActive ? "Pasife Al" : "Aktife Al"}
          </button>
          <button
            onClick={onEdit}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Düzenle
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100"
          >
            Sil
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ActivityFormModal ────────────────────────────────────────────────────────
function ActivityFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    title: initial?.title || "",
    category: initial?.category || activityCategories[0],
    city: initial?.city || "",
    description: initial?.description || "",
    priceTry: initial?.priceTry || "",
    durationValue: initial?.durationValue || "",
    durationUnit: initial?.durationUnit || "Saat",
    startDate: initial?.startDate || "",
    endDate: initial?.endDate || "",
    isActive: initial?.isActive ?? true,
  });

  // ── Variations state ──────────────────────────────────────────────────────
  const [variations, setVariations] = useState(
    (initial?.variations || []).map((v) => ({ ...v })),
  );
  const [newVar, setNewVar] = useState({
    name: "", priceTry: "", durationValue: "", durationUnit: "Saat",
  });

  function updateNewVar(e) {
    const { name, value } = e.target;
    setNewVar((prev) => ({ ...prev, [name]: value }));
  }

  function addVariation() {
    if (!newVar.name.trim()) return;
    setVariations((prev) => [
      ...prev,
      {
        id: `var-${Date.now()}`,
        name: newVar.name.trim(),
        priceTry: Number(newVar.priceTry) || 0,
        durationValue: Number(newVar.durationValue) || 1,
        durationUnit: newVar.durationUnit,
      },
    ]);
    setNewVar({ name: "", priceTry: "", durationValue: "", durationUnit: "Saat" });
  }

  function removeVariation(id) {
    setVariations((prev) => prev.filter((v) => v.id !== id));
  }

  function updateVariation(id, field, value) {
    setVariations((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );
  }

  // ── Regions state ─────────────────────────────────────────────────────────
  const [regions, setRegions] = useState(initial?.regions || []);
  const [regionInput, setRegionInput] = useState("");

  function addRegion() {
    const trimmed = regionInput.trim();
    if (!trimmed || regions.includes(trimmed)) return;
    setRegions((prev) => [...prev, trimmed]);
    setRegionInput("");
  }

  function removeRegion(r) {
    setRegions((prev) => prev.filter((x) => x !== r));
  }

  // ── Photo state ───────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState(
    (initial?.photos || []).map((url) => ({
      id: url, url, preview: url, uploading: false, error: false, originalKb: null, optimizedKb: null,
    })),
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  function updateField(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  async function handleFiles(fileList) {
    const imageFiles = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    for (const file of imageFiles) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const originalKb = Math.round(file.size / 1024);

      // Optimise first via Canvas
      const resized = await resizeImage(file);
      const optimizedKb = Math.round(resized.size / 1024);
      const preview = URL.createObjectURL(resized);

      setPhotos((prev) => [
        ...prev,
        { id, preview, url: preview, uploading: !!supabase, error: false, originalKb, optimizedKb },
      ]);

      if (supabase) {
        try {
          const path = `${id}-${resized.name.replace(/\s+/g, "_")}`;
          const { error: uploadError } = await supabase.storage
            .from(ACTIVITIES_BUCKET)
            .upload(path, resized, { upsert: false });
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage
            .from(ACTIVITIES_BUCKET)
            .getPublicUrl(path);
          setPhotos((prev) =>
            prev.map((p) => (p.id === id ? { ...p, url: publicUrl, uploading: false } : p)),
          );
        } catch {
          setPhotos((prev) =>
            prev.map((p) => (p.id === id ? { ...p, uploading: false, error: true } : p)),
          );
        }
      }
    }
  }

  function removePhoto(id) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      ...form,
      priceTry: Number(form.priceTry) || 0,
      durationValue: Number(form.durationValue) || 1,
      photos: photos.map((p) => p.url),
      variations,
      regions,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-8 py-5">
          <h2 className="text-lg font-bold text-slate-900">
            {initial ? "Aktiviteyi Düzenle" : "Yeni Aktivite Ekle"}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8">
          {/* ── Row 1: two-column grid ── */}
          <div className="grid gap-8 lg:grid-cols-2">
            {/* ── Left – Base Fields ── */}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Aktivite Adı <span className="text-red-500">*</span>
                </label>
                <input
                  name="title"
                  value={form.title}
                  onChange={updateField}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                  placeholder="ör. Yamaç Paraşütü"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Kategori</label>
                  <select
                    name="category"
                    value={form.category}
                    onChange={updateField}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                  >
                    {activityCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Şehir</label>
                  <input
                    name="city"
                    value={form.city}
                    onChange={updateField}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                    placeholder="ör. Muğla"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Açıklama</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={updateField}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                  placeholder="Aktivite hakkında kısa bir açıklama..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Temel Fiyat (₺)
                    {variations.length > 0 && (
                      <span className="ml-1 text-xs font-normal text-slate-400">(varyasyon yoksa)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    name="priceTry"
                    value={form.priceTry}
                    onChange={updateField}
                    min={0}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Süre</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      name="durationValue"
                      value={form.durationValue}
                      onChange={updateField}
                      min={1}
                      className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                      placeholder="2"
                    />
                    <select
                      name="durationUnit"
                      value={form.durationUnit}
                      onChange={updateField}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                    >
                      <option value="Dakika">Dakika</option>
                      <option value="Saat">Saat</option>
                      <option value="Gün">Gün</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Başlangıç</label>
                  <input type="date" name="startDate" value={form.startDate} onChange={updateField}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Bitiş</label>
                  <input type="date" name="endDate" value={form.endDate} onChange={updateField}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
                </div>
              </div>

              {/* ── Region Tags ── */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Bölge Kısıtlaması
                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                    (boş = her bölge)
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    value={regionInput}
                    onChange={(e) => setRegionInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRegion(); } }}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                    placeholder="ör. Kalkan, Ölüdeniz"
                  />
                  <button
                    type="button"
                    onClick={addRegion}
                    className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    Ekle
                  </button>
                </div>
                {regions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {regions.map((r) => (
                      <span
                        key={r}
                        className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-0.5 text-xs font-medium text-blue-700"
                      >
                        {r}
                        <button type="button" onClick={() => removeRegion(r)}
                          className="ml-0.5 rounded-full text-blue-400 hover:text-blue-700">
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isActive"
                  name="isActive"
                  checked={form.isActive}
                  onChange={updateField}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-slate-700">
                  Aktivite Aktif
                </label>
              </div>
            </div>

            {/* ── Right – Photo Upload ── */}
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
                Fotoğraflar
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  ✓ Otomatik optimize edilir
                </span>
                {!supabase && (
                  <span className="text-xs font-normal text-amber-500">
                    (Supabase bağlı değil)
                  </span>
                )}
              </label>

              {/* Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex min-h-[130px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition ${
                  isDragOver
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-9 w-9 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm font-medium text-slate-600">Sürükle &amp; bırak</p>
                <p className="text-xs text-slate-400">veya tıkla · maks. 1200 px · JPEG %82</p>
              </div>

              {/* Photo Previews */}
              {photos.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {photos.map((photo) => (
                    <div key={photo.id}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                      <img src={photo.preview} alt="" className="h-full w-full object-cover" />

                      {/* Optimize info overlay */}
                      {photo.originalKb && photo.optimizedKb && !photo.uploading && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 text-center text-[10px] text-white">
                          {photo.originalKb}KB → {photo.optimizedKb}KB
                        </div>
                      )}

                      {photo.uploading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/80">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                          <span className="text-[10px] text-slate-500">Yükleniyor…</span>
                        </div>
                      )}
                      {photo.error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-red-50/80">
                          <span className="text-xs font-medium text-red-600">Hata</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removePhoto(photo.id); }}
                        className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow group-hover:flex"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Row 2: Variations (full width) ── */}
          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Tur Varyasyonları</h3>
                <p className="text-xs text-slate-500">
                  Farklı süre ve fiyat seçenekleri ekle (ör: Gün Batımı, Tam Gün, VIP)
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-0.5 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
                {variations.length} varyasyon
              </span>
            </div>

            {/* Existing variations */}
            {variations.length > 0 && (
              <div className="mb-4 space-y-2">
                {variations.map((v, idx) => (
                  <div key={v.id}
                    className="grid grid-cols-[1fr_100px_80px_80px_32px] items-center gap-2 rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
                    <input
                      value={v.name}
                      onChange={(e) => updateVariation(v.id, "name", e.target.value)}
                      className="rounded border border-slate-200 px-2 py-1 text-sm outline-none ring-blue-500 transition focus:ring-2"
                      placeholder={`Varyasyon ${idx + 1}`}
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={v.priceTry}
                        onChange={(e) => updateVariation(v.id, "priceTry", Number(e.target.value))}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm outline-none ring-blue-500 transition focus:ring-2"
                        placeholder="₺"
                        min={0}
                      />
                    </div>
                    <input
                      type="number"
                      value={v.durationValue}
                      onChange={(e) => updateVariation(v.id, "durationValue", Number(e.target.value))}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm outline-none ring-blue-500 transition focus:ring-2"
                      placeholder="Süre"
                      min={1}
                    />
                    <select
                      value={v.durationUnit}
                      onChange={(e) => updateVariation(v.id, "durationUnit", e.target.value)}
                      className="w-full rounded border border-slate-200 px-1 py-1 text-xs outline-none ring-blue-500 transition focus:ring-2"
                    >
                      <option value="Dakika">Dak.</option>
                      <option value="Saat">Saat</option>
                      <option value="Gün">Gün</option>
                    </select>
                    <button type="button" onClick={() => removeVariation(v.id)}
                      className="flex h-7 w-7 items-center justify-center rounded text-red-400 transition hover:bg-red-50 hover:text-red-600">
                      ✕
                    </button>
                  </div>
                ))}
                {/* Column headers hint */}
                <div className="grid grid-cols-[1fr_100px_80px_80px_32px] gap-2 px-2.5">
                  <span className="text-[10px] text-slate-400">Ad</span>
                  <span className="text-[10px] text-slate-400">Fiyat (₺)</span>
                  <span className="text-[10px] text-slate-400">Süre</span>
                  <span className="text-[10px] text-slate-400">Birim</span>
                  <span />
                </div>
              </div>
            )}

            {/* Add new variation row */}
            <div className="grid grid-cols-[1fr_100px_80px_80px_auto] items-end gap-2">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Ad</label>
                <input
                  name="name"
                  value={newVar.name}
                  onChange={updateNewVar}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVariation(); } }}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none ring-blue-500 transition focus:ring-2"
                  placeholder="ör. Tam Gün"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Fiyat (₺)</label>
                <input
                  type="number"
                  name="priceTry"
                  value={newVar.priceTry}
                  onChange={updateNewVar}
                  min={0}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none ring-blue-500 transition focus:ring-2"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Süre</label>
                <input
                  type="number"
                  name="durationValue"
                  value={newVar.durationValue}
                  onChange={updateNewVar}
                  min={1}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none ring-blue-500 transition focus:ring-2"
                  placeholder="2"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Birim</label>
                <select
                  name="durationUnit"
                  value={newVar.durationUnit}
                  onChange={updateNewVar}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none ring-blue-500 transition focus:ring-2"
                >
                  <option value="Dakika">Dak.</option>
                  <option value="Saat">Saat</option>
                  <option value="Gün">Gün</option>
                </select>
              </div>
              <button
                type="button"
                onClick={addVariation}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                + Ekle
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              İptal
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.98]"
            >
              {initial ? "Güncelle" : "Aktivite Ekle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── ActivitiesPage ────────────────────────────────────────────────────────────
function ActivitiesPage({
  activities,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
  onToggleActivity,
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("Tümü");
  const [regionFilter, setRegionFilter] = useState("Tüm Bölgeler");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // All unique regions from all activities
  const allRegions = useMemo(() => {
    const set = new Set();
    activities.forEach((a) => (a.regions || []).forEach((r) => set.add(r)));
    return ["Tüm Bölgeler", ...Array.from(set).sort()];
  }, [activities]);

  const filteredActivities = useMemo(() => {
    return activities.filter((a) => {
      const catOk = categoryFilter === "Tümü" || a.category === categoryFilter;
      const regionOk =
        regionFilter === "Tüm Bölgeler" ||
        (a.regions || []).length === 0 ||
        (a.regions || []).includes(regionFilter);
      return catOk && regionOk;
    });
  }, [activities, categoryFilter, regionFilter]);

  const allFilterLabels = ["Tümü", ...activityCategories];

  function handleEdit(activity) {
    setEditingActivity(activity);
    setShowModal(true);
  }

  function handleModalClose() {
    setShowModal(false);
    setEditingActivity(null);
  }

  function handleSave(data) {
    if (editingActivity) {
      onUpdateActivity(editingActivity.id, data);
    } else {
      onAddActivity(data);
    }
    handleModalClose();
  }

  return (
    <>
      {/* Header */}
      <header className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">İçerik Yönetimi</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Aktivite Yönetimi</h2>
          </div>
          <button
            onClick={() => {
              setEditingActivity(null);
              setShowModal(true);
            }}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]"
          >
            + Yeni Aktivite Ekle
          </button>
        </div>

        {/* Stats row */}
        <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900">{activities.length}</p>
            <p className="text-xs text-slate-500">Toplam</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">
              {activities.filter((a) => a.isActive).length}
            </p>
            <p className="text-xs text-slate-500">Aktif</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-500">
              {activities.filter((a) => !a.isActive).length}
            </p>
            <p className="text-xs text-slate-500">Pasif</p>
          </div>
        </div>
      </header>

      {/* Filter bar */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {allFilterLabels.map((cat) => {
            const count =
              cat === "Tümü"
                ? activities.length
                : activities.filter((a) => a.category === cat).length;
            if (count === 0 && cat !== "Tümü") return null;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  categoryFilter === cat
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                {cat}
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                  categoryFilter === cat ? "bg-blue-500 text-blue-100" : "bg-slate-100 text-slate-500"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Region Filter Row */}
        {allRegions.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-medium text-slate-500">Bölge:</span>
            {allRegions.map((r) => (
              <button
                key={r}
                onClick={() => setRegionFilter(r)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  regionFilter === r
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                }`}
              >
                {r === "Tüm Bölgeler" ? "🌍 Tüm Bölgeler" : `📍 ${r}`}
              </button>
            ))}
            {regionFilter !== "Tüm Bölgeler" && (
              <span className="text-xs text-slate-400">
                → {filteredActivities.length} sonuç
              </span>
            )}
          </div>
        )}
      </div>

      {/* Cards Grid */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredActivities.length === 0 ? (
          <div className="col-span-full rounded-xl border-2 border-dashed border-slate-200 py-16 text-center text-slate-400">
            Bu kategoride aktivite bulunamadı.
          </div>
        ) : (
          filteredActivities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              onEdit={() => handleEdit(activity)}
              onDelete={() => setDeleteConfirmId(activity.id)}
              onToggle={() => onToggleActivity(activity.id)}
            />
          ))
        )}
      </div>

      {/* Delete Confirm */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Aktiviteyi Sil</h3>
            <p className="mt-2 text-sm text-slate-600">
              Bu aktiviteyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  onDeleteActivity(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <ActivityFormModal
          initial={editingActivity}
          onSave={handleSave}
          onClose={handleModalClose}
        />
      )}
    </>
  );
}

// ── Finance helpers ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  const styles = {
    emerald: { card: "bg-emerald-50 border-emerald-100", value: "text-emerald-700", sub: "text-emerald-500" },
    red:     { card: "bg-red-50 border-red-100",         value: "text-red-700",     sub: "text-red-400"    },
    blue:    { card: "bg-blue-50 border-blue-100",       value: "text-blue-700",    sub: "text-blue-500"   },
    amber:   { card: "bg-amber-50 border-amber-100",     value: "text-amber-700",   sub: "text-amber-500"  },
    slate:   { card: "bg-slate-50 border-slate-200",     value: "text-slate-800",   sub: "text-slate-400"  },
  };
  const s = styles[color] || styles.slate;
  return (
    <div className={`rounded-xl border p-4 ${s.card}`}>
      <p className={`text-xl font-bold leading-tight ${s.value}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500">{label}</p>
      {sub && <p className={`mt-1 text-xs ${s.sub}`}>{sub}</p>}
    </div>
  );
}

function HakedisRow({ label, value, color }) {
  const colorMap = { emerald: "text-emerald-600", red: "text-red-600", amber: "text-amber-600", slate: "text-slate-700" };
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${colorMap[color] || colorMap.slate}`}>
        {value >= 0 ? "+" : "–"}{Math.abs(value).toLocaleString("tr-TR")} ₺
      </span>
    </div>
  );
}

// ── TransactionFormModal ──────────────────────────────────────────────────────
function TransactionFormModal({ initial, villas, currentUser, onSave, onClose }) {
  const [form, setForm] = useState({
    villaId: String(initial?.villaId || villas[0]?.id || ""),
    rezervasyonId: initial?.rezervasyonId || "",
    islemTipi: initial?.islemTipi || "Gelir",
    miktar: initial?.miktar || "",
    alinanOnOdeme: initial?.alinanOnOdeme ?? "",   // gerçekte tahsil edilen ön ödeme
    islemTarihi: initial?.islemTarihi || nowIso().slice(0, 10),
    aciklama: initial?.aciklama || "",
    durum: initial?.durum || "Beklemede",
    kapidaOdemeDurumu: initial?.kapidaOdemeDurumu || "Beklemede",
    ajansOdemeDurumu: initial?.ajansOdemeDurumu || "Beklemede",
  });

  // Anlık hesaplama (yeni model)
  const miktar         = Number(form.miktar) || 0;
  const alinanOnOdeme  = Number(form.alinanOnOdeme) || 0;
  const bizimKomisyon  = Math.round(miktar * 20 / 100);   // sabit %20
  const kapidaOdenecek = miktar - alinanOnOdeme;
  const ajansBorc      = Math.max(0, alinanOnOdeme - bizimKomisyon);
  const isGelir    = form.islemTipi === "Gelir";
  const isAktivite = form.islemTipi === "Aktivite";

  function updateField(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      ...form,
      villaId: Number(form.villaId),
      rezervasyonId: form.rezervasyonId ? Number(form.rezervasyonId) : null,
      miktar,
      ...(isGelir ? {
        bizimKomisyon,
        alinanOnOdeme,
        kapidaOdenecek,
        ajansBorc,
        ajansOdemeDurumu: ajansBorc > 0 ? form.ajansOdemeDurumu : null,
      } : {}),
      ...(isAktivite ? {
        bizimKomisyon: null, alinanOnOdeme: null, kapidaOdenecek: null,
        ajansBorc: null, kapidaOdemeDurumu: null, ajansOdemeDurumu: null,
      } : {}),
      createdBy: initial?.createdBy || currentUser,
    };
    onSave(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">
            {initial ? "İşlemi Düzenle" : "Yeni Finansal İşlem"}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* İşlem tipi toggle — 3 seçenek */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { tip: "Gelir",    icon: "↑", label: "Rezervasyon",    active: "border-emerald-500 bg-emerald-50 text-emerald-700" },
              { tip: "Aktivite", icon: "🎯", label: "Aktivite Satışı", active: "border-purple-500 bg-purple-50 text-purple-700" },
              { tip: "Gider",    icon: "↓", label: "Gider / Masraf",  active: "border-red-500 bg-red-50 text-red-700" },
            ].map(({ tip, icon, label, active }) => (
              <label key={tip}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 py-2.5 text-xs font-semibold transition ${
                  form.islemTipi === tip ? active : "border-slate-200 text-slate-400 hover:border-slate-300"
                }`}>
                <input type="radio" name="islemTipi" value={tip} checked={form.islemTipi === tip}
                  onChange={updateField} className="hidden" />
                <span className="text-base">{icon}</span>
                {label}
              </label>
            ))}
          </div>

          {/* Aktivite bilgi bandı */}
          {isAktivite && (
            <div className="rounded-lg border border-purple-100 bg-purple-50 px-3 py-2 text-xs text-purple-700">
              🎯 Aktivite satışında tüm tutar <strong>doğrudan bizim kârımız</strong>. %20/80 bölünme uygulanmaz.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Villa <span className="text-red-500">*</span>
              </label>
              <select name="villaId" value={form.villaId} onChange={updateField} required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2">
                {villas.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {isGelir ? "Toplam Rezervasyon Bedeli (₺)" : isAktivite ? "Aktivite Satış Tutarı (₺)" : "Gider Tutarı (₺)"}
                <span className="text-red-500"> *</span>
              </label>
              <input type="number" name="miktar" value={form.miktar} onChange={updateField}
                required min={0}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                placeholder="0" />
            </div>
          </div>

          {/* Gelir: alınan ön ödeme girişi + hesap paneli */}
          {isGelir && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Alınan Ön Ödeme (₺)
                <span className="ml-2 text-xs font-normal text-blue-500">
                  Bizim sabit komisyonumuz: {bizimKomisyon.toLocaleString("tr-TR")} ₺ (%20)
                </span>
              </label>
              <input type="number" name="alinanOnOdeme" value={form.alinanOnOdeme}
                onChange={updateField} min={0} placeholder="0"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
            </div>
          )}

          {isGelir && miktar > 0 && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Hesaplama Özeti
              </p>
              <div className={`grid gap-3 ${ajansBorc > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
                <div className="rounded-lg bg-white p-3 text-center ring-1 ring-blue-200">
                  <p className="text-[11px] font-semibold uppercase text-blue-600">Bizim Komisyon</p>
                  <p className="text-[10px] text-slate-400">Sabit %20</p>
                  <p className="mt-1 text-lg font-bold text-blue-700">
                    {bizimKomisyon.toLocaleString("tr-TR")} ₺
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 text-center ring-1 ring-emerald-200">
                  <p className="text-[11px] font-semibold uppercase text-emerald-600">🏠 Kapıda Ödenecek</p>
                  <p className="text-[10px] text-slate-400">Toplam − Alınan</p>
                  <p className="mt-1 text-lg font-bold text-emerald-700">
                    {kapidaOdenecek >= 0 ? kapidaOdenecek.toLocaleString("tr-TR") : "—"} ₺
                  </p>
                </div>
                {ajansBorc > 0 && (<>
                  <div className="rounded-lg bg-white p-3 text-center ring-1 ring-orange-300">
                    <p className="text-[11px] font-semibold uppercase text-orange-600">⚠️ Ajans Borcu</p>
                    <p className="text-[10px] text-slate-400">Ev sahibine ödenecek</p>
                    <p className="mt-1 text-lg font-bold text-orange-700">
                      {ajansBorc.toLocaleString("tr-TR")} ₺
                    </p>
                  </div>
                  <div className="rounded-lg bg-white p-3 text-center ring-1 ring-orange-200">
                    <p className="text-[11px] font-semibold uppercase text-orange-600">Ajans Borç Durumu</p>
                    <select name="ajansOdemeDurumu" value={form.ajansOdemeDurumu} onChange={updateField}
                      className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none">
                      <option>Beklemede</option><option>Ödendi</option>
                    </select>
                  </div>
                </>)}
              </div>
              <p className="mt-2 text-center text-[10px] text-blue-500">
                Alınan: {alinanOnOdeme.toLocaleString("tr-TR")} ₺ + Kapıda: {Math.max(0, kapidaOdenecek).toLocaleString("tr-TR")} ₺ = <strong>{miktar.toLocaleString("tr-TR")} ₺</strong>
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                İşlem Tarihi <span className="text-red-500">*</span>
              </label>
              <input type="date" name="islemTarihi" value={form.islemTarihi} onChange={updateField}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {isGelir ? "Ön Ödeme Durumu (Bizim Tahsilat)" : "Durum"}
              </label>
              <select name="durum" value={form.durum} onChange={updateField}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2">
                <option>Beklemede</option>
                <option>Ödendi</option>
                <option>İptal</option>
              </select>
            </div>
          </div>

          {/* Kapıda ödeme durumu — sadece Gelir için */}
          {isGelir && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Kapıda Ödeme Durumu
                <span className="ml-1 text-xs font-normal text-slate-400">
                  (Ev sahibi kapıda ödemeyi aldı mı?)
                </span>
              </label>
              <select name="kapidaOdemeDurumu" value={form.kapidaOdemeDurumu} onChange={updateField}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2">
                <option>Beklemede</option>
                <option>Ödendi</option>
                <option>İptal</option>
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Açıklama</label>
            <textarea name="aciklama" value={form.aciklama} onChange={updateField} rows={2}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
              placeholder="ör. Ayşe K. rezervasyonu, Temizlik ücreti, Bakım masrafı…" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Rezervasyon ID
              <span className="ml-1 text-xs font-normal text-slate-400">(isteğe bağlı)</span>
            </label>
            <input type="number" name="rezervasyonId" value={form.rezervasyonId}
              onChange={updateField}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
              placeholder="Bağlı rezervasyon varsa ID girin" />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              İptal
            </button>
            <button type="submit"
              className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] ${
                isGelir ? "bg-emerald-600 hover:bg-emerald-700"
                : isAktivite ? "bg-purple-600 hover:bg-purple-700"
                : "bg-red-600 hover:bg-red-700"
              }`}>
              {initial ? "Güncelle" : isGelir ? "↑ Gelir Kaydet" : isAktivite ? "🎯 Aktivite Kaydet" : "↓ Gider Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── TransactionsTab ───────────────────────────────────────────────────────────
function TransactionsTab({
  transactions,
  villas,
  filterVilla, setFilterVilla,
  filterTip, setFilterTip,
  filterDurum, setFilterDurum,
  filterDateFrom, setFilterDateFrom,
  filterDateTo, setFilterDateTo,
  onEdit, onDelete, onMarkPaid, onMarkKapidaOdendi,
}) {
  function villaName(id) {
    return villas.find((v) => v.id === id)?.name || `Villa #${id}`;
  }

  const totalOnOdeme = transactions
    .filter((t) => t.islemTipi === "Gelir" && t.durum === "Ödendi")
    .reduce((s, t) => s + (t.bizimKomisyon || 0), 0);
  const totalAktivite = transactions
    .filter((t) => t.islemTipi === "Aktivite" && t.durum === "Ödendi")
    .reduce((s, t) => s + t.miktar, 0);
  const totalGider = transactions
    .filter((t) => t.islemTipi === "Gider" && t.durum !== "İptal")
    .reduce((s, t) => s + t.miktar, 0);
  const totalKapida = transactions
    .filter((t) => t.islemTipi === "Gelir")
    .reduce((s, t) => s + (t.kapidaOdenecek || 0), 0);

  function durumBadge(durum) {
    const map = {
      Ödendi:    "bg-emerald-100 text-emerald-700",
      Beklemede: "bg-amber-100 text-amber-700",
      İptal:     "bg-slate-100 text-slate-500 line-through",
    };
    return map[durum] || map.Beklemede;
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Filter bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Villa</label>
            <select value={filterVilla} onChange={(e) => setFilterVilla(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none ring-blue-500 transition focus:ring-2">
              <option value="all">Tüm Villalar</option>
              {villas.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">İşlem Tipi</label>
            <select value={filterTip} onChange={(e) => setFilterTip(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none ring-blue-500 transition focus:ring-2">
              <option>Tümü</option>
              <option>Gelir</option>
              <option>Aktivite</option>
              <option>Gider</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Ön Ödeme Durumu</label>
            <select value={filterDurum} onChange={(e) => setFilterDurum(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none ring-blue-500 transition focus:ring-2">
              <option>Tümü</option>
              <option>Ödendi</option>
              <option>Beklemede</option>
              <option>İptal</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Başlangıç</label>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none ring-blue-500 transition focus:ring-2" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Bitiş</label>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none ring-blue-500 transition focus:ring-2" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Tarih</th>
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Villa</th>
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Açıklama</th>
                <th className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Toplam</th>
                <th className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-blue-400">Bizim Komisyonumuz</th>
                <th className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-emerald-500">Ev Sahibi Alacağı</th>
                <th className="whitespace-nowrap px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">Ön Öd. Durumu</th>
                <th className="whitespace-nowrap px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">Kapı Öd. Durumu</th>
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-sm text-slate-400">
                    Filtreyle eşleşen kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className={`transition hover:bg-slate-50/60 ${
                    tx.islemTipi === "Gider" ? "bg-red-50/20"
                    : tx.islemTipi === "Aktivite" ? "bg-purple-50/30"
                    : ""
                  }`}>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{tx.islemTarihi}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${
                          tx.islemTipi === "Gelir" ? "bg-emerald-500"
                          : tx.islemTipi === "Aktivite" ? "bg-purple-500"
                          : "bg-red-400"
                        }`} />
                        {villaName(tx.villaId)}
                      </div>
                    </td>
                    <td className="max-w-[200px] px-3 py-3 text-slate-600" title={tx.aciklama}>
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1 truncate">
                          {tx.islemTipi === "Aktivite" && <span className="text-purple-500">🎯</span>}
                          {tx.aciklama || "—"}
                        </span>
                        {tx.autoCreated && (
                          <span className="inline-flex w-fit items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">
                            🔗 Rezervasyondan
                          </span>
                        )}
                        {tx.rezervasyonId && (
                          <span className="text-[10px] text-slate-400">
                            Rez. #{tx.rezervasyonId}
                          </span>
                        )}
                      </span>
                    </td>
                    {/* Toplam */}
                    <td className={`whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums ${
                      tx.islemTipi === "Gider" ? "text-red-700"
                      : tx.islemTipi === "Aktivite" ? "text-purple-700"
                      : "text-slate-800"
                    }`}>
                      {tx.islemTipi === "Gider" && "–"}{tx.miktar.toLocaleString("tr-TR")} ₺
                    </td>
                    {/* Bizim Komisyonumuz */}
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                      {tx.islemTipi === "Gelir" ? (
                        <span className="font-semibold text-blue-700">
                          {(tx.bizimKomisyon || 0).toLocaleString("tr-TR")} ₺
                          <span className="ml-1 text-[10px] text-blue-400">%20</span>
                        </span>
                      ) : tx.islemTipi === "Aktivite" ? (
                        <span className="font-semibold text-purple-700">
                          {tx.miktar.toLocaleString("tr-TR")} ₺
                          <span className="ml-1 text-[10px] text-purple-400">tamamı</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {/* Ev Sahibi Alacağı */}
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                      {tx.islemTipi === "Gelir" ? (
                        <span className="font-semibold text-emerald-700">
                          {(tx.kapidaOdenecek || 0).toLocaleString("tr-TR")} ₺
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {/* Ön Ödeme Durumu */}
                    <td className="whitespace-nowrap px-3 py-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${durumBadge(tx.durum)}`}>
                        {tx.durum}
                      </span>
                    </td>
                    {/* Kapı Ödeme Durumu */}
                    <td className="whitespace-nowrap px-3 py-3 text-center">
                      {tx.islemTipi === "Gelir" ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${durumBadge(tx.kapidaOdemeDurumu)}`}>
                          {tx.kapidaOdemeDurumu || "Beklemede"}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    {/* Aksiyon butonları */}
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="flex items-center gap-1">
                        {tx.durum === "Beklemede" && (
                          <button onClick={() => onMarkPaid(tx.id)}
                            className="rounded px-1.5 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                            title="Ön ödememizi tahsil ettik">
                            ✓ Öne Öde
                          </button>
                        )}
                        {tx.islemTipi === "Gelir" && tx.kapidaOdemeDurumu === "Beklemede" && (
                          <button onClick={() => onMarkKapidaOdendi(tx.id)}
                            className="rounded px-1.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                            title="Ev sahibi kapıda ödemeyi aldı">
                            🏠 Kapıda Ödendi
                          </button>
                        )}
                        <button onClick={() => onEdit(tx)}
                          className="rounded px-1.5 py-1 text-xs text-slate-500 transition hover:bg-slate-100">
                          Düzelt
                        </button>
                        <button onClick={() => onDelete(tx.id)}
                          className="rounded px-1.5 py-1 text-xs text-red-500 transition hover:bg-red-50">
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {transactions.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            <span>{transactions.length} kayıt</span>
            <span className="flex flex-wrap gap-3">
              <span>Komisyon: <strong className="text-blue-600">{totalOnOdeme.toLocaleString("tr-TR")} ₺</strong></span>
              <span>Aktivite: <strong className="text-purple-600">{totalAktivite.toLocaleString("tr-TR")} ₺</strong></span>
              <span>Gider: <strong className="text-red-600">{totalGider.toLocaleString("tr-TR")} ₺</strong></span>
              <span>Ev sahibi alacağı: <strong className="text-emerald-600">{totalKapida.toLocaleString("tr-TR")} ₺</strong></span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AjansBorcTab ─────────────────────────────────────────────────────────────
// Müşteriden %20'den fazla tahsil ettiğimiz durumlarda ev sahibine ödenmesi gereken borçlar
function AjansBorcTab({ transactions, villas, onMarkAjansOdendi }) {
  const debtTx = transactions
    .filter((t) => t.islemTipi === "Gelir" && (t.ajansBorc || 0) > 0 && t.durum !== "İptal")
    .sort((a, b) => b.islemTarihi.localeCompare(a.islemTarihi));

  const totalBorc      = debtTx.reduce((s, t) => s + (t.ajansBorc || 0), 0);
  const odenmemisBorc  = debtTx.filter((t) => t.ajansOdemeDurumu !== "Ödendi").reduce((s, t) => s + (t.ajansBorc || 0), 0);
  const odenmisBorc    = debtTx.filter((t) => t.ajansOdemeDurumu === "Ödendi").reduce((s, t) => s + (t.ajansBorc || 0), 0);

  return (
    <div className="mt-4 space-y-4">
      {/* Özet */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Toplam Ajans Borcu", value: totalBorc, color: "orange", icon: "⚠️" },
          { label: "Ödenmemiş Borç", value: odenmemisBorc, color: "red", icon: "🔴" },
          { label: "Ödenmiş Borç", value: odenmisBorc, color: "emerald", icon: "✅" },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className={`rounded-xl border p-4 bg-${color}-50 border-${color}-100`}>
            <p className="text-xs font-medium text-slate-500">{icon} {label}</p>
            <p className={`mt-1 text-2xl font-bold text-${color}-700`}>
              {value.toLocaleString("tr-TR")} ₺
            </p>
          </div>
        ))}
      </div>

      {/* Açıklama */}
      <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm text-orange-800">
        <p className="font-semibold">⚠️ Bu tabloda neler listelenir?</p>
        <p className="mt-1 text-orange-700">
          Müşteriden sabit %20 komisyonumuzu aşan tutarda ön ödeme aldığımız rezervasyonlar listelenir.
          Fazladan tahsil ettiğimiz tutar ev sahibine aktarılmalıdır.
        </p>
      </div>

      {debtTx.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-3 font-semibold text-slate-700">Ev sahibine borcunuz yok</p>
          <p className="mt-1 text-sm text-slate-400">
            Tüm rezervasyonlarda yalnızca sabit %20 komisyon tahsil edilmiş.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                {["Tarih", "Villa", "Açıklama", "Toplam Tutar", "Bizim Komisyon (%20)", "Alınan Ön Ödeme", "Ev Sahibine Borç", "Durum", "İşlem"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {debtTx.map((tx) => {
                const villa = villas.find((v) => v.id === tx.villaId);
                const isPaid = tx.ajansOdemeDurumu === "Ödendi";
                return (
                  <tr key={tx.id} className={`transition hover:bg-orange-50 ${isPaid ? "opacity-60" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                      {new Date(tx.islemTarihi).toLocaleDateString("tr-TR")}
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-800">
                      {villa?.name || `#${tx.villaId}`}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-3 text-slate-600">
                      {tx.aciklama}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">
                      {(tx.miktar || 0).toLocaleString("tr-TR")} ₺
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-blue-700">
                      {(tx.bizimKomisyon || 0).toLocaleString("tr-TR")} ₺
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {(tx.alinanOnOdeme || 0).toLocaleString("tr-TR")} ₺
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-bold text-orange-700">
                      {(tx.ajansBorc || 0).toLocaleString("tr-TR")} ₺
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isPaid ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
                      }`}>
                        {isPaid ? "✅ Ödendi" : "⏳ Beklemede"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {!isPaid && (
                        <button
                          onClick={() => onMarkAjansOdendi(tx.id)}
                          className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 active:scale-95"
                        >
                          ✓ Ev Sahibine Ödendi
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-orange-100 bg-orange-50">
              <tr>
                <td colSpan={6} className="px-3 py-3 text-right text-xs font-semibold text-orange-700">
                  Toplam Borç:
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-bold text-orange-800">
                  {totalBorc.toLocaleString("tr-TR")} ₺
                  {odenmemisBorc > 0 && (
                    <span className="ml-2 text-xs font-normal text-red-500">
                      ({odenmemisBorc.toLocaleString("tr-TR")} ₺ ödenmedi)
                    </span>
                  )}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── HakedisTab ────────────────────────────────────────────────────────────────
function HakedisTab({ hakedisData }) {
  const totalOnOdeme = hakedisData.reduce((s, d) => s + d.bizimKomisyon, 0);
  const totalGider   = hakedisData.reduce((s, d) => s + d.gider, 0);
  const totalNetKar  = hakedisData.reduce((s, d) => s + d.netKar, 0);
  const totalKapida  = hakedisData.reduce((s, d) => s + d.kapidaOdenecek, 0);
  const totalKapidaBekleyen = hakedisData.reduce((s, d) => s + d.kapidaBekleyen, 0);

  return (
    <div className="mt-4 space-y-4">
      {/* Model açıklaması */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-3">
        <p className="text-sm font-semibold text-blue-800">20 / 80 Ödeme Modeli</p>
        <p className="mt-0.5 text-xs text-blue-600">
          Rezervasyon anında <strong>%20 ön ödeme</strong> bizim net kazancımız.
          Kalan <strong>%80</strong> misafir tarafından villa girişinde ev sahibine ödenir.
          Giderler bizim payımızdan düşülür.
        </p>
      </div>

      {/* Özet istatistikler */}
      {hakedisData.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Toplam Ön Ödeme (Net Kazancımız)"
            value={`${totalOnOdeme.toLocaleString("tr-TR")} ₺`}
            sub="Bizim %20 payımız"
            color="blue"
          />
          <StatCard
            label="Toplam Operasyon Gideri"
            value={`${totalGider.toLocaleString("tr-TR")} ₺`}
            sub="Bizim masraflarımız"
            color="red"
          />
          <StatCard
            label="Net Kârımız"
            value={`${totalNetKar.toLocaleString("tr-TR")} ₺`}
            sub="Ön Ödeme – Gider"
            color={totalNetKar >= 0 ? "emerald" : "amber"}
          />
          <StatCard
            label="Ev Sahiplerine Ödenecek"
            value={`${totalKapida.toLocaleString("tr-TR")} ₺`}
            sub={totalKapidaBekleyen > 0 ? `${totalKapidaBekleyen.toLocaleString("tr-TR")} ₺ beklemede` : "Tamamı ödendi"}
            color={totalKapidaBekleyen > 0 ? "amber" : "emerald"}
          />
        </div>
      )}

      {/* Villa bazlı kart listesi */}
      {hakedisData.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center text-slate-400">
          Hakediş hesaplamak için finansal işlem kaydı giriniz.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {hakedisData.map(({
            villa,
            bizimKomisyon, onOdemeBekleyen,
            kapidaOdenecek, kapidaBekleyen,
            ajansBorc, ajansOdenmemis,
            gider, aktiviteKazanci, netKar,
          }) => (
            <div key={villa.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              {/* Başlık */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{villa.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    👤 {villa.owner || "Sahip bilgisi yok"} · 📍 {villa.location || "—"}
                  </p>
                </div>
                <span className={`mt-0.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  netKar > 0 ? "bg-emerald-100 text-emerald-700"
                  : netKar === 0 ? "bg-slate-100 text-slate-600"
                  : "bg-red-100 text-red-600"
                }`}>
                  {netKar > 0 ? "Kâr" : netKar === 0 ? "Sıfır" : "Zarar"}
                </span>
              </div>

              {/* 20% Bizim taraf */}
              <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-700">
                  Bizim Taraf (%20)
                </p>
                <div className="divide-y divide-blue-100">
                  <HakedisRow label="Sabit Komisyon (%20)" value={bizimKomisyon} color="emerald" />
                  {aktiviteKazanci > 0 && (
                    <HakedisRow label="🎯 Aktivite Satış Kazancı" value={aktiviteKazanci} color="emerald" />
                  )}
                  {onOdemeBekleyen > 0 && (
                    <HakedisRow label="⏳ Bekleyen Komisyon" value={onOdemeBekleyen} color="amber" />
                  )}
                  {gider > 0 && <HakedisRow label="Operasyon Giderleri" value={-gider} color="red" />}
                  {ajansOdenmemis > 0 && (
                    <HakedisRow label="⚠️ Ev Sahibine Borcumuz (Ödenmedi)" value={-ajansOdenmemis} color="red" />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-700 px-3 py-2">
                  <span className="text-xs font-medium text-blue-200">Net Kârımız</span>
                  <span className={`font-bold ${netKar >= 0 ? "text-white" : "text-red-300"}`}>
                    {netKar.toLocaleString("tr-TR")} ₺
                  </span>
                </div>
              </div>

              {/* 80% Ev sahibi taraf */}
              <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
                  Ev Sahibi Taraf (%80 — Kapıda)
                </p>
                <div className="divide-y divide-emerald-100">
                  <HakedisRow label="Toplam Kapı Ödemesi" value={kapidaOdenecek} color="emerald" />
                  {kapidaBekleyen > 0 && (
                    <HakedisRow label="⏳ Henüz Ödenmedi" value={-kapidaBekleyen} color="amber" />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-700 px-3 py-2">
                  <span className="text-xs font-medium text-emerald-200">Ev Sahibi Toplam</span>
                  <span className="font-bold text-white">{kapidaOdenecek.toLocaleString("tr-TR")} ₺</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FinancialPage ─────────────────────────────────────────────────────────────
// ── Yardımcılar ──────────────────────────────────────────────────────────────
const STAT_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"];

function nightsBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000));
}

function getStatDateRange(type, customFrom, customTo) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fmt = (d) => d.toISOString().slice(0, 10);
  if (type === "this-month") {
    return {
      from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
      to:   fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }
  if (type === "last-3-months") {
    return {
      from: fmt(new Date(today.getFullYear(), today.getMonth() - 2, 1)),
      to:   fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }
  if (type === "last-12-months") {
    return {
      from: fmt(new Date(today.getFullYear(), today.getMonth() - 11, 1)),
      to:   fmt(today),
    };
  }
  return {
    from: customFrom || "2020-01-01",
    to:   customTo   || fmt(today),
  };
}

function SortTh({ label, col, sort, onSort }) {
  const active = sort.col === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 transition hover:text-slate-700"
    >
      {label}
      <span className={`ml-1 transition ${active ? "opacity-100" : "opacity-0"}`}>
        {sort.dir === "desc" ? "↓" : "↑"}
      </span>
    </th>
  );
}

// ── StatisticsPage ─────────────────────────────────────────────────────────────
function StatisticsPage({ villas, reservations, transactions }) {
  const [filterType, setFilterType] = useState("this-month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [villaSort,  setVillaSort]  = useState({ col: "nights", dir: "desc" });
  const [staffSort,  setStaffSort]  = useState({ col: "count",  dir: "desc" });

  const { from, to } = useMemo(
    () => getStatDateRange(filterType, customFrom, customTo),
    [filterType, customFrom, customTo],
  );

  // Aktif, tarih aralığında olan rezervasyonlar
  const filtered = useMemo(
    () =>
      reservations.filter(
        (r) =>
          r.status !== "İptal Edildi" &&
          r.startDate >= from &&
          r.startDate <= to,
      ),
    [reservations, from, to],
  );

  // ── Özet istatistikler ──────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalRez     = filtered.length;
    const totalNights  = filtered.reduce((s, r) => s + nightsBetween(r.startDate, r.endDate), 0);
    const totalKomisyon = filtered.reduce((s, r) => s + (r.bizimKomisyon || 0), 0);

    const byVilla = {};
    filtered.forEach((r) => {
      byVilla[r.villaId] = (byVilla[r.villaId] || 0) + 1;
    });
    const bestVillaId  = Object.entries(byVilla).sort((a, b) => b[1] - a[1])[0]?.[0];
    const bestVilla    = villas.find((v) => String(v.id) === String(bestVillaId));

    return { totalRez, totalNights, totalKomisyon, bestVilla };
  }, [filtered, villas]);

  // ── Villa analiz tablosu ────────────────────────────────────────────────────
  const villaStats = useMemo(() => {
    const periodDays = Math.max(1, nightsBetween(from, to) + 1);
    const rows = villas.map((villa) => {
      const rezs    = filtered.filter((r) => r.villaId === villa.id);
      const nights  = rezs.reduce((s, r) => s + nightsBetween(r.startDate, r.endDate), 0);
      const revenue = rezs.reduce((s, r) => s + (r.toplamTutar  || 0), 0);
      const komisyon = rezs.reduce((s, r) => s + (r.bizimKomisyon || 0), 0);
      const occ     = Math.min(100, Math.round((nights / periodDays) * 100));
      return { villa, count: rezs.length, nights, revenue, komisyon, occ };
    });
    const sorted = [...rows].sort((a, b) => {
      const v = villaSort.dir === "desc" ? -1 : 1;
      return (a[villaSort.col] < b[villaSort.col] ? -1 : 1) * v;
    });
    return sorted;
  }, [filtered, villas, villaSort, from, to]);

  // ── Personel satış performansı ──────────────────────────────────────────────
  const staffSales = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const name = r.createdBy || "Bilinmeyen";
      if (!map[name]) map[name] = { name, count: 0, kaparo: 0 };
      map[name].count++;
      map[name].kaparo += r.alinanOnOdeme || 0;
    });
    const rows = Object.values(map);
    return [...rows].sort((a, b) => {
      const v = staffSort.dir === "desc" ? -1 : 1;
      return (a[staffSort.col] < b[staffSort.col] ? -1 : 1) * v;
    });
  }, [filtered, staffSort]);

  // ── Personel portföy katkısı ────────────────────────────────────────────────
  const portfolioStats = useMemo(() => {
    const map = {};
    villas
      .filter((v) => v.status === "Onaylandı")
      .forEach((v) => {
        const name = v.createdBy || "Bilinmeyen";
        if (!map[name]) map[name] = { name, count: 0, villas: [] };
        map[name].count++;
        map[name].villas.push(v.name);
      });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [villas]);

  // ── Aylık gece grafiği (son 12 ay sabit) ───────────────────────────────────
  const monthlyChart = useMemo(() => {
    const months = [];
    const today  = new Date();
    for (let i = 11; i >= 0; i--) {
      const d   = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      const lbl = d.toLocaleDateString("tr-TR", { month: "short", year: "2-digit" });
      months.push({ key, lbl, nights: 0, rezCount: 0 });
    }
    reservations
      .filter((r) => r.status !== "İptal Edildi")
      .forEach((r) => {
        const key = r.startDate?.slice(0, 7);
        const m   = months.find((x) => x.key === key);
        if (m) {
          m.nights   += nightsBetween(r.startDate, r.endDate);
          m.rezCount += 1;
        }
      });
    return months;
  }, [reservations]);

  // ── Portföy pasta grafiği ───────────────────────────────────────────────────
  const pieData = portfolioStats.map((p) => ({ name: p.name, value: p.count }));

  function toggleSort(setter, col) {
    setter((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { col, dir: "desc" },
    );
  }

  const filterBtns = [
    { id: "this-month",    label: "Bu Ay" },
    { id: "last-3-months", label: "Son 3 Ay" },
    { id: "last-12-months",label: "Son 12 Ay" },
    { id: "custom",        label: "Özel Aralık" },
  ];

  return (
    <>
      {/* Başlık */}
      <header className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
        <p className="text-sm text-slate-500">Analiz & Performans</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">📊 İstatistikler</h2>
      </header>

      {/* ── Filtre Çubuğu ─────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <span className="text-sm font-medium text-slate-600">Dönem:</span>
        <div className="flex flex-wrap gap-1">
          {filterBtns.map((btn) => (
            <button
              key={btn.id}
              onClick={() => setFilterType(btn.id)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                filterType === btn.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
        {filterType === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none ring-blue-500 focus:ring-2" />
            <span className="text-slate-400">→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none ring-blue-500 focus:ring-2" />
          </div>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {from} → {to}
        </span>
      </div>

      {/* ── Özet Kartlar ───────────────────────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: "🗓️",
            label: "Toplam Rezervasyon",
            value: summary.totalRez,
            unit: "adet",
            color: "blue",
          },
          {
            icon: "🌙",
            label: "Toplam Satılan Gece",
            value: summary.totalNights,
            unit: "gece",
            color: "purple",
          },
          {
            icon: "💰",
            label: "Net Komisyon Kazancı",
            value: summary.totalKomisyon.toLocaleString("tr-TR") + " ₺",
            unit: null,
            color: "emerald",
          },
          {
            icon: "🏆",
            label: "En Çok Satan Villa",
            value: summary.bestVilla?.name || "—",
            unit: null,
            color: "amber",
          },
        ].map(({ icon, label, value, unit, color }) => (
          <div key={label}
            className={`rounded-xl border border-${color}-100 bg-${color}-50 p-5`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{icon}</span>
              <p className={`text-xs font-semibold uppercase tracking-wide text-${color}-600`}>{label}</p>
            </div>
            <p className={`mt-3 text-3xl font-bold text-${color}-800 leading-tight`}>{value}</p>
            {unit && <p className={`mt-0.5 text-xs text-${color}-500`}>{unit}</p>}
          </div>
        ))}
      </div>

      {/* ── Villa Analiz Tablosu ────────────────────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="font-semibold text-slate-900">🏠 Villa Analiz Tablosu</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Başlık başlıklarına tıklayarak sıralayabilirsiniz.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Villa
                </th>
                <SortTh label="Rezervasyon" col="count"    sort={villaSort} onSort={(c) => toggleSort(setVillaSort, c)} />
                <SortTh label="Gece"         col="nights"   sort={villaSort} onSort={(c) => toggleSort(setVillaSort, c)} />
                <SortTh label="Doluluk %"    col="occ"      sort={villaSort} onSort={(c) => toggleSort(setVillaSort, c)} />
                <SortTh label="Toplam Gelir" col="revenue"  sort={villaSort} onSort={(c) => toggleSort(setVillaSort, c)} />
                <SortTh label="Komisyon"     col="komisyon" sort={villaSort} onSort={(c) => toggleSort(setVillaSort, c)} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {villaStats.map(({ villa, count, nights, revenue, komisyon, occ }) => (
                <tr key={villa.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${
                        villa.status === "Onaylandı" ? "bg-emerald-500" : "bg-amber-400"
                      }`} />
                      {villa.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{count}</td>
                  <td className="px-4 py-3 text-slate-700">{nights}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all ${
                            occ >= 70 ? "bg-emerald-500" : occ >= 40 ? "bg-amber-400" : "bg-red-400"
                          }`}
                          style={{ width: `${occ}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-slate-600">%{occ}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {revenue > 0 ? revenue.toLocaleString("tr-TR") + " ₺" : "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-blue-700">
                    {komisyon > 0 ? komisyon.toLocaleString("tr-TR") + " ₺" : "—"}
                  </td>
                </tr>
              ))}
              {villaStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                    Seçilen dönemde rezervasyon bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
            {villaStats.length > 0 && (
              <tfoot className="border-t-2 border-slate-100 bg-slate-50 text-xs font-semibold">
                <tr>
                  <td className="px-4 py-3 text-slate-500">TOPLAM</td>
                  <td className="px-4 py-3 text-slate-700">{villaStats.reduce((s, d) => s + d.count, 0)}</td>
                  <td className="px-4 py-3 text-slate-700">{villaStats.reduce((s, d) => s + d.nights, 0)}</td>
                  <td className="px-4 py-3 text-slate-500">—</td>
                  <td className="px-4 py-3 text-slate-700">{villaStats.reduce((s, d) => s + d.revenue, 0).toLocaleString("tr-TR")} ₺</td>
                  <td className="px-4 py-3 text-blue-700">{villaStats.reduce((s, d) => s + d.komisyon, 0).toLocaleString("tr-TR")} ₺</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* ── Personel Tabloları ──────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Satış Performansı */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="font-semibold text-slate-900">👤 Personel Satış Performansı</h3>
            <p className="mt-0.5 text-xs text-slate-400">Dönem içi rezervasyon girişleri</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Personel</th>
                  <SortTh label="Rezervasyon" col="count"  sort={staffSort} onSort={(c) => toggleSort(setStaffSort, c)} />
                  <SortTh label="Kaparo Toplamı" col="kaparo" sort={staffSort} onSort={(c) => toggleSort(setStaffSort, c)} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {staffSales.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-slate-400">Veri yok</td></tr>
                ) : staffSales.map((s, i) => (
                  <tr key={s.name} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ background: STAT_COLORS[i % STAT_COLORS.length] }}>
                          {i + 1}
                        </span>
                        <span className="font-medium text-slate-800">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700">{s.count}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-blue-400"
                            style={{ width: `${Math.round(s.count / Math.max(1, staffSales[0]?.count) * 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">
                      {s.kaparo.toLocaleString("tr-TR")} ₺
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Portföy Katkısı */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="font-semibold text-slate-900">🏡 Personel Portföy Katkısı</h3>
            <p className="mt-0.5 text-xs text-slate-400">Sisteme kazandırılan "Onaylandı" villalar</p>
          </div>
          {portfolioStats.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-400">Onaylı villa kaydı bulunamadı.</p>
          ) : (
            <div className="space-y-3 p-5">
              {portfolioStats.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: STAT_COLORS[i % STAT_COLORS.length] }}>
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">{p.name}</span>
                      <span className="text-sm font-bold text-slate-700">{p.count} villa</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.round(p.count / Math.max(1, portfolioStats[0]?.count) * 100)}%`,
                          background: STAT_COLORS[i % STAT_COLORS.length],
                        }} />
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">
                      {p.villas.slice(0, 3).join(", ")}
                      {p.villas.length > 3 && ` +${p.villas.length - 3} daha`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Grafikler ──────────────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Aylık Gece Bar Grafiği */}
        <section className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900">📈 Aylık Satılan Gece (Son 12 Ay)</h3>
          <p className="mt-0.5 text-xs text-slate-400">Tüm rezervasyonların check-in ayına göre dağılımı</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="lbl" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                  formatter={(val, name) => [val, name === "nights" ? "Gece" : "Rezervasyon"]}
                />
                <Legend formatter={(val) => val === "nights" ? "Gece" : "Rezervasyon"} />
                <Bar dataKey="nights"   name="nights"    fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="rezCount" name="rezCount"  fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Portföy Katkısı Pasta Grafiği */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900">🥧 Portföy Dağılımı</h3>
          <p className="mt-0.5 text-xs text-slate-400">Onaylı villalar personel bazında</p>
          {pieData.length === 0 ? (
            <div className="mt-8 text-center text-sm text-slate-400">Veri yok</div>
          ) : (
            <>
              <div className="mt-2 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={70}
                      dataKey="value" label={({ name, percent }) =>
                        `${name.split(" ")[0]} %${Math.round(percent * 100)}`
                      }
                      labelLine={false}
                      fontSize={10}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={STAT_COLORS[i % STAT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} villa`, "Portföy"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1">
                {pieData.map((d, i) => (
                  <li key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ background: STAT_COLORS[i % STAT_COLORS.length] }} />
                      <span className="text-slate-700">{d.name}</span>
                    </span>
                    <span className="font-semibold text-slate-600">{d.value} villa</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}

function FinancialPage({
  villas,
  transactions,
  currentUser,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onMarkPaid,
  onMarkKapidaOdendi,
  onMarkAjansOdendi,
}) {
  const [activeTab, setActiveTab] = useState("islemler");
  const [filterVilla, setFilterVilla] = useState("all");
  const [filterTip, setFilterTip] = useState("Tümü");
  const [filterDurum, setFilterDurum] = useState("Tümü");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // ── Özet istatistikler ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);
    const todayStr  = today.toISOString().slice(0, 10);
    const limitStr  = in30Days.toISOString().slice(0, 10);

    // 1) Toplam Kazanılan Komisyon — sabit %20 komisyonlarımız (Ödendi)
    const kazanilanKomisyon = transactions
      .filter((t) => t.islemTipi === "Gelir" && t.durum === "Ödendi")
      .reduce((s, t) => s + (t.bizimKomisyon || 0), 0);

    // 2) Beklenen Giriş Ödemeleri — önümüzdeki 30 gün içinde ev sahiplerine
    //    kapıda ödenecek tutar (kapidaOdemeDurumu = Beklemede, tarih bu aralıkta)
    const bekleyenGirisOdeme = transactions
      .filter((t) =>
        t.islemTipi === "Gelir" &&
        (t.kapidaOdemeDurumu === "Beklemede" || !t.kapidaOdemeDurumu) &&
        t.islemTarihi >= todayStr &&
        t.islemTarihi <= limitStr
      )
      .reduce((s, t) => s + (t.kapidaOdenecek || 0), 0);

    // 3) Aktivite Kazançları — aktivite satışlarından gelen net kâr (Ödendi)
    const aktiviteKazanci = transactions
      .filter((t) => t.islemTipi === "Aktivite" && t.durum === "Ödendi")
      .reduce((s, t) => s + t.miktar, 0);

    // 4) Giderler
    const paidGider = transactions
      .filter((t) => t.islemTipi === "Gider" && t.durum === "Ödendi")
      .reduce((s, t) => s + t.miktar, 0);

    // Net toplam kârımız
    const netKar = kazanilanKomisyon + aktiviteKazanci - paidGider;

    // Ev sahibine ödenmesi gereken ajans borcu — iptal edilmiş işlemler hariç
    const toplamAjansBorc = transactions
      .filter((t) => t.islemTipi === "Gelir" && (t.ajansBorc || 0) > 0 && t.durum !== "İptal")
      .reduce((s, t) => s + (t.ajansBorc || 0), 0);
    const odenmemisAjansBorc = transactions
      .filter((t) => t.islemTipi === "Gelir" && (t.ajansBorc || 0) > 0 && t.durum !== "İptal" && t.ajansOdemeDurumu !== "Ödendi")
      .reduce((s, t) => s + (t.ajansBorc || 0), 0);

    // Ek yardımcılar
    const bekleyenOnOdeme = transactions
      .filter((t) => t.islemTipi === "Gelir" && t.durum === "Beklemede")
      .reduce((s, t) => s + (t.bizimKomisyon || 0), 0);
    const aktiviteBekleyen = transactions
      .filter((t) => t.islemTipi === "Aktivite" && t.durum === "Beklemede")
      .reduce((s, t) => s + t.miktar, 0);

    return {
      kazanilanKomisyon, bekleyenGirisOdeme, aktiviteKazanci,
      paidGider, netKar, bekleyenOnOdeme, aktiviteBekleyen,
      toplamAjansBorc, odenmemisAjansBorc,
    };
  }, [transactions]);

  // ── Filtrelenmiş işlem listesi ──────────────────────────────────────────────
  const filteredTx = useMemo(() => {
    return transactions
      .filter((t) => filterVilla === "all" || t.villaId === Number(filterVilla))
      .filter((t) => filterTip === "Tümü" || t.islemTipi === filterTip)
      .filter((t) => filterDurum === "Tümü" || t.durum === filterDurum)
      .filter((t) => !filterDateFrom || t.islemTarihi >= filterDateFrom)
      .filter((t) => !filterDateTo || t.islemTarihi <= filterDateTo)
      .sort((a, b) => b.islemTarihi.localeCompare(a.islemTarihi));
  }, [transactions, filterVilla, filterTip, filterDurum, filterDateFrom, filterDateTo]);

  // ── Hakediş verisi (20/80 modeli) ───────────────────────────────────────────
  const hakedisData = useMemo(() => {
    return villas
      .map((villa) => {
        const vt = transactions.filter((t) => t.villaId === villa.id);

        // Bizim sabit komisyonumuz (%20): tahsil edildi
        const bizimKomisyon = vt
          .filter((t) => t.islemTipi === "Gelir" && t.durum === "Ödendi")
          .reduce((s, t) => s + (t.bizimKomisyon || 0), 0);

        // Bekleyen komisyon
        const onOdemeBekleyen = vt
          .filter((t) => t.islemTipi === "Gelir" && t.durum === "Beklemede")
          .reduce((s, t) => s + (t.bizimKomisyon || 0), 0);

        // Ajans borcu — iptal edilmiş işlemler hariç
        const ajansBorc = vt
          .filter((t) => t.islemTipi === "Gelir" && t.durum !== "İptal")
          .reduce((s, t) => s + (t.ajansBorc || 0), 0);
        const ajansOdenmemis = vt
          .filter((t) => t.islemTipi === "Gelir" && (t.ajansBorc || 0) > 0 && t.durum !== "İptal" && t.ajansOdemeDurumu !== "Ödendi")
          .reduce((s, t) => s + (t.ajansBorc || 0), 0);

        // Ev sahibi payı (%80): toplam
        const kapidaOdenecek = vt
          .filter((t) => t.islemTipi === "Gelir")
          .reduce((s, t) => s + (t.kapidaOdenecek || 0), 0);

        // Ev sahibi kapıda henüz almadığı
        const kapidaBekleyen = vt
          .filter((t) => t.islemTipi === "Gelir" && (t.kapidaOdemeDurumu === "Beklemede" || !t.kapidaOdemeDurumu))
          .reduce((s, t) => s + (t.kapidaOdenecek || 0), 0);

        // Operasyon giderleri (bizim masraflarımız)
        const gider = vt
          .filter((t) => t.islemTipi === "Gider" && t.durum !== "İptal")
          .reduce((s, t) => s + t.miktar, 0);

        // Aktivite satışları (villa bazlı)
        const aktiviteKazanci = vt
          .filter((t) => t.islemTipi === "Aktivite" && t.durum === "Ödendi")
          .reduce((s, t) => s + t.miktar, 0);

        const netKar = bizimKomisyon + aktiviteKazanci - gider - ajansOdenmemis;

        return {
          villa,
          bizimKomisyon, onOdemeBekleyen,
          kapidaOdenecek, kapidaBekleyen,
          ajansBorc, ajansOdenmemis,
          gider, aktiviteKazanci, netKar,
          txCount: vt.length,
        };
      })
      .filter((d) => d.txCount > 0);
  }, [villas, transactions]);

  function handleEdit(tx) {
    setEditingTx(tx);
    setShowModal(true);
  }

  function handleModalClose() {
    setShowModal(false);
    setEditingTx(null);
  }

  function handleSave(data) {
    if (editingTx) {
      onUpdateTransaction(editingTx.id, data);
    } else {
      onAddTransaction(data);
    }
    handleModalClose();
  }

  return (
    <>
      {/* Page header */}
      <header className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Finansal Yönetim</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Finans & Hakediş</h2>
          </div>
          {activeTab === "islemler" && (
            <button
              onClick={() => { setEditingTx(null); setShowModal(true); }}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]"
            >
              + Yeni İşlem Ekle
            </button>
          )}
        </div>

        {/* Stats row */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-5">
          {/* Kart 1: Toplam Kazanılan Komisyon */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
              Toplam Kazanılan Komisyon
            </p>
            <p className="mt-1 text-2xl font-bold text-blue-800">
              {stats.kazanilanKomisyon.toLocaleString("tr-TR")} ₺
            </p>
            <p className="mt-0.5 text-xs text-blue-500">
              %20 ön ödeme — tahsil edildi
              {stats.bekleyenOnOdeme > 0 && (
                <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-amber-700">
                  +{stats.bekleyenOnOdeme.toLocaleString("tr-TR")} ₺ bekliyor
                </span>
              )}
            </p>
          </div>

          {/* Kart 2: Beklenen Giriş Ödemeleri */}
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Beklenen Giriş Ödemeleri
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-800">
              {stats.bekleyenGirisOdeme.toLocaleString("tr-TR")} ₺
            </p>
            <p className="mt-0.5 text-xs text-amber-600">
              Önümüzdeki 30 gün — ev sahiplerine kapıda
            </p>
          </div>

          {/* Kart 3: Aktivite Kazançları */}
          <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-600">
              Aktivite Kazançları
            </p>
            <p className="mt-1 text-2xl font-bold text-purple-800">
              {stats.aktiviteKazanci.toLocaleString("tr-TR")} ₺
            </p>
            <p className="mt-0.5 text-xs text-purple-500">
              Aktivite satışı — net kâr
              {stats.aktiviteBekleyen > 0 && (
                <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-amber-700">
                  +{stats.aktiviteBekleyen.toLocaleString("tr-TR")} ₺ bekliyor
                </span>
              )}
            </p>
          </div>

          {/* Kart 4: Net Kârımız */}
          <div className={`rounded-xl border p-4 ${
            stats.netKar >= 0 ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50"
          }`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${
              stats.netKar >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              Net Kârımız
            </p>
            <p className={`mt-1 text-2xl font-bold ${
              stats.netKar >= 0 ? "text-emerald-800" : "text-red-800"}`}>
              {stats.netKar.toLocaleString("tr-TR")} ₺
            </p>
            <p className={`mt-0.5 text-xs ${stats.netKar >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              Komisyon + Aktivite − Gider
            </p>
          </div>

          {/* Kart 5: Ajans Borcu */}
          <div className={`rounded-xl border p-4 ${
            stats.odenmemisAjansBorc > 0 ? "border-orange-200 bg-orange-50" : "border-slate-100 bg-slate-50"
          }`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${
              stats.odenmemisAjansBorc > 0 ? "text-orange-600" : "text-slate-400"}`}>
              {stats.odenmemisAjansBorc > 0 ? "⚠️" : "✅"} Ev Sahibine Borç
            </p>
            <p className={`mt-1 text-2xl font-bold ${
              stats.odenmemisAjansBorc > 0 ? "text-orange-800" : "text-slate-400"}`}>
              {stats.odenmemisAjansBorc.toLocaleString("tr-TR")} ₺
            </p>
            <p className={`mt-0.5 text-xs ${stats.odenmemisAjansBorc > 0 ? "text-orange-500" : "text-slate-400"}`}>
              {stats.odenmemisAjansBorc > 0 ? "Fazla tahsilat, aktarılmadı" : "Tüm borçlar ödendi"}
            </p>
          </div>
        </div>
      </header>

      {/* Tab switcher */}
      <div className="mt-4 flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {[
          { id: "islemler", label: "📋 İşlemler" },
          { id: "hakedis",  label: "💰 Hakediş Raporu" },
          { id: "ajansborc", label: "⚠️ Ev Sahibine Borçlar" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "islemler" ? (
        <TransactionsTab
          transactions={filteredTx}
          villas={villas}
          filterVilla={filterVilla} setFilterVilla={setFilterVilla}
          filterTip={filterTip} setFilterTip={setFilterTip}
          filterDurum={filterDurum} setFilterDurum={setFilterDurum}
          filterDateFrom={filterDateFrom} setFilterDateFrom={setFilterDateFrom}
          filterDateTo={filterDateTo} setFilterDateTo={setFilterDateTo}
          onEdit={handleEdit}
          onDelete={(id) => setDeleteConfirmId(id)}
          onMarkPaid={onMarkPaid}
          onMarkKapidaOdendi={onMarkKapidaOdendi}
        />
      ) : activeTab === "ajansborc" ? (
        <AjansBorcTab
          transactions={transactions}
          villas={villas}
          onMarkAjansOdendi={onMarkAjansOdendi}
        />
      ) : (
        <HakedisTab hakedisData={hakedisData} />
      )}

      {/* Delete confirm */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">İşlemi Sil</h3>
            <p className="mt-2 text-sm text-slate-600">
              Bu finansal kaydı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                İptal
              </button>
              <button
                onClick={() => { onDeleteTransaction(deleteConfirmId); setDeleteConfirmId(null); }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {showModal && (
        <TransactionFormModal
          initial={editingTx}
          villas={villas}
          currentUser={currentUser}
          onSave={handleSave}
          onClose={handleModalClose}
        />
      )}
    </>
  );
}

// ── Şifre Değiştir Modalı ─────────────────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) { setError("Yeni şifreler eşleşmiyor."); return; }
    if (newPassword.length < 6) { setError("Şifre en az 6 karakter olmalıdır."); return; }
    setLoading(true);

    if (!supabase) {
      setSuccess(true);
      setLoading(false);
      return;
    }

    // Mevcut şifreyi doğrula
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: user?.email,
      password: currentPassword,
    });
    if (verifyErr) {
      setError("Mevcut şifre yanlış.");
      setLoading(false);
      return;
    }

    // Şifreyi güncelle
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  function EyeToggle({ show, onToggle }) {
    return (
      <button type="button" onClick={onToggle} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
        {show ? (
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
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900">Şifre Değiştir</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-slate-900 mb-2">Şifre Güncellendi</h4>
            <p className="text-slate-500 text-sm mb-5">Şifreniz başarıyla değiştirildi.</p>
            <button
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-6 py-2.5 text-sm font-medium transition"
            >
              Tamam
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Mevcut Şifre</label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-slate-300 rounded-xl px-4 pr-10 py-2.5 text-sm outline-none focus:ring-2 ring-blue-500"
                />
                <EyeToggle show={showCurrent} onToggle={() => setShowCurrent((p) => !p)} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Yeni Şifre</label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="En az 6 karakter"
                  className="w-full border border-slate-300 rounded-xl px-4 pr-10 py-2.5 text-sm outline-none focus:ring-2 ring-blue-500"
                />
                <EyeToggle show={showNew} onToggle={() => setShowNew((p) => !p)} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Yeni Şifre (Tekrar)</label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Şifreyi tekrar girin"
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-blue-500 ${
                    confirmPassword && newPassword !== confirmPassword
                      ? "border-red-300 bg-red-50"
                      : "border-slate-300"
                  }`}
                />
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">Şifreler eşleşmiyor</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
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
                {loading ? "Güncelleniyor..." : "Şifreyi Değiştir"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function Layout() {
  const { role, displayName, signOut } = useAuth();
  const navigate = useNavigate();
  const [showPwModal, setShowPwModal] = useState(false);
  const visibleItems = menuItems.filter(
    (item) => !item.requiredRole || role === item.requiredRole
  );

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-slate-200 bg-slate-900 text-slate-100 flex flex-col">
        <div className="border-b border-slate-700 px-6 py-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Villa Yönetim
          </p>
          <h1 className="mt-2 text-xl font-semibold">Dashboard</h1>
        </div>

        <nav className="px-4 py-6 flex-1 overflow-y-auto">
          <ul className="space-y-1">
            {visibleItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `block w-full rounded-lg px-4 py-3 text-left text-sm font-medium transition ${
                      isActive
                        ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User info + actions */}
        <div className="border-t border-slate-700 px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {displayName[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-100 truncate">{displayName}</p>
              <p className="text-xs text-slate-400">
                {role === "admin" ? "Yönetici" : role === "staff" ? "Personel" : "—"}
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <button
              onClick={() => setShowPwModal(true)}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Şifre Değiştir
            </button>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Çıkış Yap
            </button>
          </div>
        </div>
      </aside>

      <main className="ml-64 p-8">
        <Outlet />
      </main>

      {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}
    </div>
  );
}

function DashboardPage({ villas, tasks, reservations, activityLogs, onMoveTask }) {
  const { role, user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const approvedCount = villas.filter((villa) => villa.status === "Onaylandı").length;
  const activeTaskCount = tasks.filter((task) => task.status !== "Tamamlandı").length;

  const todayTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.dueDate === today &&
          t.assignedToId === user?.id &&
          t.status !== "Tamamlandı",
      ),
    [tasks, today, user?.id],
  );

  return (
    <>
      <header className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
        <p className="text-sm text-slate-500">Genel Bakış</p>
        <h2 className="mt-1 text-3xl font-semibold text-slate-900">Dashboard</h2>
      </header>

      {/* ── Bugünün Görevleri — sadece staff rolü görür ─────────────────────── */}
      {role === "staff" && (
        <section className="mt-6 rounded-xl border border-blue-100 bg-blue-50/60 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900">Bugünün Görevleri</h3>
            {todayTasks.length > 0 && (
              <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-semibold">
                {todayTasks.length}
              </span>
            )}
          </div>

          {todayTasks.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {todayTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                    <p className="text-xs text-blue-500 mt-0.5">Bugün bitiş tarihi</p>
                  </div>
                  <button
                    onClick={() => onMoveTask(task.id, 2)}
                    className="flex-shrink-0 inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg px-2.5 py-1.5 transition"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Tamamlandı
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-blue-200 bg-white/60 px-5 py-4">
              <svg className="w-5 h-5 text-blue-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-slate-500">Bugün için atanmış göreviniz bulunmuyor.</p>
            </div>
          )}
        </section>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Toplam Villa</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{villas.length}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Onaylanan Villa</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-700">{approvedCount}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Aktif Görev</p>
          <p className="mt-2 text-3xl font-semibold text-blue-700">{activeTaskCount}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Toplam Rezervasyon</p>
          <p className="mt-2 text-3xl font-semibold text-violet-700">
            {reservations.length}
          </p>
        </article>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Sistem Değişiklik Logları</h3>
        <div className="mt-4 space-y-2">
          {activityLogs.length > 0 ? (
            activityLogs.slice(0, 12).map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{log.author}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(log.createdAt)}
                  </p>
                </div>
                <p className="mt-1 text-sm text-slate-700">{log.message}</p>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
              Henüz sistem değişiklik kaydı yok.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

function VillasPage({
  villas,
  currentUser,
  onAddVilla,
  onImportVillas,
  onAddLog,
  onUpdateOperationalNotes,
  onUpdateVilla,
  onDeleteVilla,
  onUpdateStatus,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVillaId, setEditingVillaId] = useState(null);
  const [selectedVillaId, setSelectedVillaId] = useState(null);

  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [importPreview, setImportPreview] = useState(null);
  const [fieldMapping, setFieldMapping] = useState({});

  const [logForm, setLogForm] = useState({
    contactBy: "",
    contactAt: "",
    result: "",
  });
  const [operationalForm, setOperationalForm] = useState(defaultOperational());
  const [criticalNoteInput, setCriticalNoteInput] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    owner: "",
    location: "",
    phone: "",
    status: "Onay Bekliyor",
  });

  const selectedVilla = villas.find((villa) => villa.id === selectedVillaId) || null;
  const selectedLogs = selectedVilla
    ? [...(selectedVilla.logs || [])].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      )
    : [];

  const previewRows = importPreview?.records?.slice(0, 5) || [];

  function updateField(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function updateLogField(event) {
    const { name, value } = event.target;
    setLogForm((prev) => ({ ...prev, [name]: value }));
  }

  function updateOperationalField(event) {
    const { name, value } = event.target;
    setOperationalForm((prev) => ({ ...prev, [name]: value }));
  }

  function updateMapping(target, sourceHeader) {
    setFieldMapping((prev) => ({ ...prev, [target]: sourceHeader }));
  }

  function openCreateModal() {
    setEditingVillaId(null);
    setFormData({
      name: "",
      owner: "",
      location: "",
      phone: "",
      status: "Onay Bekliyor",
    });
    setIsModalOpen(true);
  }

  function openEditModal(villa) {
    setEditingVillaId(villa.id);
    setFormData({
      name: villa.name || "",
      owner: villa.owner || "",
      location: villa.location || "",
      phone: villa.phone || "",
      status: villa.status || "Onay Bekliyor",
    });
    setIsModalOpen(true);
  }

  function openVillaLogPanel(villa) {
    setSelectedVillaId(villa.id);
    setOperationalForm({
      ...defaultOperational(),
      ...(villa.operational || {}),
      criticalNotes: villa.operational?.criticalNotes || [],
    });
    setCriticalNoteInput("");
  }

  function handleSubmit(event) {
    event.preventDefault();
    const payload = {
      name: formData.name.trim(),
      owner: formData.owner.trim(),
      location: formData.location.trim(),
      phone: formData.phone.trim(),
      status: formData.status,
    };
    if (!payload.name || !payload.owner || !payload.location) return;

    if (editingVillaId) {
      onUpdateVilla(editingVillaId, payload, currentUser);
    } else {
      onAddVilla({ id: Date.now(), ...payload, logs: [] }, currentUser);
    }

    setIsModalOpen(false);
    setEditingVillaId(null);
  }

  async function handleImportFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError("");
    setImportMessage("");

    try {
      const text = await file.text();
      const arrayBuffer = await file.arrayBuffer();
      const parsed = parseVillaScoutFile(file.name, text, arrayBuffer);
      setImportPreview({ ...parsed, fileName: file.name });
      setFieldMapping(createDefaultMapping(parsed.headers));
      setImportMessage(
        `${file.name} dosyası yüklendi. Lütfen sütun eşleştirmesini kontrol edip içe aktarın.`,
      );
    } catch (error) {
      setImportPreview(null);
      setFieldMapping({});
      setImportError(error.message || "Dosya okunamadı.");
    } finally {
      event.target.value = "";
    }
  }

  function applyImport() {
    if (!importPreview) return;
    const imported = [];
    const skippedRows = [];

    importPreview.records.forEach((record, index) => {
      const rowHasAnyData = Object.values(record).some((value) =>
        String(value || "").trim(),
      );
      if (!rowHasAnyData) {
        skippedRows.push(index + 1);
        return;
      }
      imported.push(buildVillaFromMappedRecord(record, fieldMapping, index));
    });

    if (imported.length === 0) {
      setImportError("İçe aktarılabilir dolu satır bulunamadı.");
      return;
    }

    onImportVillas(imported, currentUser);
    setImportPreview(null);
    setFieldMapping({});
    setImportError("");
    setImportMessage(
      skippedRows.length > 0
        ? `${imported.length} kayıt aktarıldı. Atlanan satırlar: ${skippedRows.join(
            ", ",
          )}`
        : `${imported.length} kayıt başarıyla aktarıldı.`,
    );
  }

  function cancelImport() {
    setImportPreview(null);
    setFieldMapping({});
    setImportMessage("İçe aktarma iptal edildi.");
    setImportError("");
  }

  function handleAddLog(event) {
    event.preventDefault();
    if (!selectedVillaId) return;
    const contactBy = logForm.contactBy.trim() || currentUser || "Bilinmeyen Kullanıcı";
    const result = logForm.result.trim();
    const contactAt = logForm.contactAt
      ? new Date(logForm.contactAt).toISOString()
      : nowIso();
    if (!result) return;
    onAddLog(
      selectedVillaId,
      {
        id: `contact-log-${Date.now()}`,
        villaName: selectedVilla?.name || "",
        author: contactBy,
        createdAt: contactAt,
        result,
        message: result,
      },
      currentUser,
    );
    setLogForm({ contactBy: "", contactAt: "", result: "" });
  }

  function handleSaveOperationalNotes(event) {
    event.preventDefault();
    if (!selectedVillaId) return;

    const newCriticalNote = criticalNoteInput.trim()
      ? {
          id: `critical-${Date.now()}`,
          createdAt: nowIso(),
          author: currentUser || "Bilinmeyen Kullanıcı",
          note: criticalNoteInput.trim(),
        }
      : null;

    onUpdateOperationalNotes(selectedVillaId, operationalForm, newCriticalNote, currentUser);
    setCriticalNoteInput("");
  }

  function handleDelete(villa) {
    const confirmed = window.confirm(
      `${villa.name} villasını silmek istediğinize emin misiniz?`,
    );
    if (!confirmed) return;
    onDeleteVilla(villa.id, currentUser);
    if (selectedVillaId === villa.id) setSelectedVillaId(null);
  }

  return (
    <>
      <header className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Villa Listesi</p>
            <h2 className="mt-1 text-3xl font-semibold text-slate-900">Villalar</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Import (Villa Scout Pro)
              <input
                type="file"
                accept=".json,.csv,.xlsx,.xls"
                onChange={handleImportFileSelect}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Yeni Villa Ekle
            </button>
          </div>
        </div>

        {importMessage && (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {importMessage}
          </p>
        )}
        {importError && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {importError}
          </p>
        )}
      </header>

      {importPreview && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-900">
              Import Eşleştirme - {importPreview.fileName}
            </h3>
            <span className="text-xs text-slate-500">
              {importPreview.records.length} satır bulundu
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {importTargets.map((target) => (
              <label
                key={target.key}
                className="flex flex-col gap-1 text-sm font-medium text-slate-700"
              >
                {target.label}
                {target.recommended && (
                  <span className="text-xs font-normal text-slate-500">
                    Önerilen
                  </span>
                )}
                <select
                  value={fieldMapping[target.key] || ""}
                  onChange={(event) => updateMapping(target.key, event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                >
                  <option value="">Atama yok</option>
                  {importPreview.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-slate-700">
              Önizleme (ilk 5 satır)
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {importPreview.headers.map((header) => (
                      <th key={header} className="border-b border-slate-200 px-3 py-2">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rowIndex) => (
                    <tr key={`preview-row-${rowIndex}`} className="text-xs text-slate-700">
                      {importPreview.headers.map((header) => (
                        <td
                          key={`${header}-${rowIndex}`}
                          className="border-b border-slate-100 px-3 py-2"
                        >
                          {String(row[header] || "-")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelImport}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={applyImport}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Eşleştirme ile İçe Aktar
            </button>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-sm font-semibold text-slate-600">
                <th className="border-b border-slate-200 px-4 py-3">Villa Adı</th>
                <th className="border-b border-slate-200 px-4 py-3">Sahibi</th>
                <th className="border-b border-slate-200 px-4 py-3">Konum</th>
                <th className="border-b border-slate-200 px-4 py-3">Telefon</th>
                <th className="border-b border-slate-200 px-4 py-3">Durum</th>
                <th className="border-b border-slate-200 px-4 py-3">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {villas.map((villa) => (
                <tr key={villa.id} className="text-sm text-slate-700">
                  <td className="border-b border-slate-100 px-4 py-4 font-medium text-slate-900">
                    {villa.name}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4">{villa.owner}</td>
                  <td className="border-b border-slate-100 px-4 py-4">{villa.location || "-"}</td>
                  <td className="border-b border-slate-100 px-4 py-4">{villa.phone || "-"}</td>
                  <td className="border-b border-slate-100 px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                          statusBadgeMap[villa.status] ||
                          "bg-slate-100 text-slate-700 ring-slate-200"
                        }`}
                      >
                        {villa.status}
                      </span>
                      <select
                        value={villa.status}
                        onChange={(event) =>
                          onUpdateStatus(villa.id, event.target.value, currentUser)
                        }
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 outline-none ring-blue-500 focus:ring-2"
                      >
                        {villaStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(villa)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        onClick={() => openVillaLogPanel(villa)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Loglar ({villa.logs?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(villa)}
                        className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>


      {selectedVilla && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">
              {selectedVilla.name} - İletişim Geçmişi
            </h3>
            <button
              type="button"
              onClick={() => setSelectedVillaId(null)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Kapat
            </button>
          </div>

          <div className="space-y-3">
            {selectedLogs.length > 0 ? (
              selectedLogs.map((log) => (
                <article
                  key={log.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      Kim görüştü: {log.author}
                    </p>
                    <p className="text-xs text-slate-500">
                      Ne zaman: {formatDateTime(log.createdAt)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-600">
                    Villa: {log.villaName || selectedVilla.name}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    Sonuç: {log.result || log.message}
                  </p>
                </article>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                Bu villa için henüz log kaydı yok.
              </p>
            )}
          </div>

          <form onSubmit={handleAddLog} className="mt-5 grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Kim görüştü
              <input
                type="text"
                name="contactBy"
                value={logForm.contactBy}
                onChange={updateLogField}
                placeholder={currentUser || "Kullanıcı adı"}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Ne zaman
              <input
                type="datetime-local"
                name="contactAt"
                value={logForm.contactAt}
                onChange={updateLogField}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
              />
            </label>
            <label className="md:col-span-3 flex flex-col gap-1 text-sm font-medium text-slate-700">
              Sonuç
              <textarea
                name="result"
                rows="2"
                value={logForm.result}
                onChange={updateLogField}
                placeholder="Örn: Sahibiyle görüşüldü, onay bekliyor."
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
              />
            </label>
            <div className="md:col-span-3 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                İletişim Logu Ekle
              </button>
            </div>
          </form>

          <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h4 className="text-sm font-semibold text-amber-900">
              Kritik Operasyon Paneli
            </h4>
            <form onSubmit={handleSaveOperationalNotes} className="mt-3 grid gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Anahtar Durumu
                <input
                  type="text"
                  name="keyInfo"
                  value={operationalForm.keyInfo || ""}
                  onChange={updateOperationalField}
                  placeholder="Örn: Anahtar resepsiyonda / sahibinde"
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500 transition focus:ring-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Temizlik Operasyonu
                <input
                  type="text"
                  name="cleaningInfo"
                  value={operationalForm.cleaningInfo || ""}
                  onChange={updateOperationalField}
                  placeholder="Örn: Her çıkış sonrası profesyonel temizlik"
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500 transition focus:ring-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Sahibin Özel İstekleri
                <textarea
                  rows="2"
                  name="ownerSpecialRequests"
                  value={operationalForm.ownerSpecialRequests || ""}
                  onChange={updateOperationalField}
                  placeholder="Örn: Sessizlik saatleri 23:00 sonrası"
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500 transition focus:ring-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Kritik Not Ekle (öne çıkarılır)
                <input
                  type="text"
                  value={criticalNoteInput}
                  onChange={(event) => setCriticalNoteInput(event.target.value)}
                  placeholder="Örn: Anahtar kasası kodu sadece vardiya sorumlusunda"
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500 transition focus:ring-2"
                />
              </label>

              {selectedVilla.operational?.criticalNotes?.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Öne Çıkan Kritik Notlar
                  </p>
                  <div className="mt-2 space-y-2">
                    {selectedVilla.operational.criticalNotes.map((note) => (
                      <div key={note.id} className="rounded border border-amber-200 px-3 py-2">
                        <p className="text-xs text-amber-700">
                          {note.author} - {formatDateTime(note.createdAt)}
                        </p>
                        <p className="text-sm text-slate-700">{note.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  Operasyon Notlarını Kaydet
                </button>
              </div>
            </form>
          </section>
        </section>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">
                {editingVillaId ? "Villa Bilgilerini Düzenle" : "Yeni Villa Ekle"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                Kapat
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 md:col-span-2">
                Villa Adı
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={updateField}
                  required
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Sahibi
                <input
                  type="text"
                  name="owner"
                  value={formData.owner}
                  onChange={updateField}
                  required
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Konum
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={updateField}
                  required
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Telefon Numarası
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={updateField}
                  placeholder="+90 5XX XXX XX XX"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Durum
                <select
                  name="status"
                  value={formData.status}
                  onChange={updateField}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
                >
                  {villaStatuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>

              <div className="mt-2 flex justify-end gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {editingVillaId ? "Güncelle" : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── CancelConfirmModal ────────────────────────────────────────────────────────
function CancelConfirmModal({ reservation, onConfirm, onClose }) {
  const [iadeEdildi, setIadeEdildi] = useState(false);
  const alinan = reservation.alinanOnOdeme || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600">✕</span>
            <h2 className="text-base font-bold text-slate-900">Rezervasyonu İptal Et</h2>
          </div>
          <button onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100">✕</button>
        </div>

        <div className="space-y-4 p-6">
          {/* Rezervasyon özeti */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">{reservation.guestName}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {reservation.startDate} → {reservation.endDate}
              {reservation.toplamTutar > 0 && (
                <span className="ml-2 font-medium text-slate-700">
                  · {reservation.toplamTutar.toLocaleString("tr-TR")} ₺
                </span>
              )}
            </p>
          </div>

          {/* İade toggle */}
          {alinan > 0 && (
            <div className={`rounded-xl border p-4 transition ${iadeEdildi ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setIadeEdildi((v) => !v)}
                  className={`mt-0.5 flex h-6 w-11 flex-shrink-0 items-center rounded-full border-2 transition-all ${
                    iadeEdildi ? "border-amber-500 bg-amber-400" : "border-slate-300 bg-slate-200"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    iadeEdildi ? "translate-x-5" : "translate-x-0.5"
                  }`} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Ön ödeme iade edildi mi?
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Alınan ön ödeme: <strong>{alinan.toLocaleString("tr-TR")} ₺</strong>
                  </p>
                </div>
              </div>

              {iadeEdildi ? (
                <div className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800">
                  ⚠️ <strong>{alinan.toLocaleString("tr-TR")} ₺</strong> finansal kayıtlardan düşülecek.
                  Bağlı işlem "İptal" olarak işaretlenecek.
                </div>
              ) : (
                <div className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                  ✅ Ön ödeme kazancımızda kalacak. Rezervasyon "İptal Edildi" olarak işaretlenecek,
                  villa takvimi o tarihler için boşalacak.
                </div>
              )}
            </div>
          )}

          {/* Aksiyon butonları */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={() => onConfirm(iadeEdildi)}
              className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 active:scale-[0.98]"
            >
              {iadeEdildi ? "İptal Et & İade Yap" : "İptal Et"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EditReservationModal ───────────────────────────────────────────────────────
function EditReservationModal({ reservation, villas, onSave, onClose }) {
  const [form, setForm] = useState({
    villaId:        String(reservation.villaId || ""),
    guestName:      reservation.guestName || "",
    guestEmail:     reservation.guestEmail || "",
    guestPhone:     reservation.guestPhone || "",
    nationality:    reservation.nationality || "",
    idNumber:       reservation.idNumber || "",
    adults:         String(reservation.adults ?? ""),
    children:       String(reservation.children ?? ""),
    channel:        reservation.channel || "Web Sitesi",
    specialRequests: reservation.specialRequests || "",
    notes:          reservation.notes || "",
    startDate:      reservation.startDate || "",
    endDate:        reservation.endDate || "",
    toplamTutar:    String(reservation.toplamTutar || ""),
    alinanOnOdeme:  String(reservation.alinanOnOdeme || ""),
    onOdemeDurumu:  reservation.onOdemeDurumu || "Beklemede",
    kapidaOdemeDurumu: reservation.kapidaOdemeDurumu || "Beklemede",
  });

  function updateField(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  const rfToplam         = Number(form.toplamTutar) || 0;
  const rfBizimKomisyon  = Math.round(rfToplam * 20 / 100);
  const rfAlinanOnOdeme  = Number(form.alinanOnOdeme) || 0;
  const rfKapidaOdenecek = rfToplam > 0 ? rfToplam - rfAlinanOnOdeme : 0;
  const rfAjansBorc      = Math.max(0, rfAlinanOnOdeme - rfBizimKomisyon);

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      villaId:        Number(form.villaId),
      guestName:      form.guestName.trim(),
      guestEmail:     form.guestEmail.trim(),
      guestPhone:     form.guestPhone.trim(),
      nationality:    form.nationality.trim(),
      idNumber:       form.idNumber.trim(),
      adults:         Number(form.adults || 0),
      children:       Number(form.children || 0),
      channel:        form.channel,
      specialRequests: form.specialRequests.trim(),
      notes:          form.notes.trim(),
      startDate:      form.startDate,
      endDate:        form.endDate,
      toplamTutar:    rfToplam,
      alinanOnOdeme:  rfAlinanOnOdeme,
      onOdemeDurumu:  form.onOdemeDurumu,
      kapidaOdemeDurumu: form.kapidaOdemeDurumu,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Rezervasyonu Düzenle</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {reservation.guestName} · {reservation.startDate} → {reservation.endDate}
            </p>
          </div>
          <button onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* Satır 1: Villa + Misafir */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Villa <span className="font-normal text-xs text-slate-400">(Yalnızca Onaylandı)</span>
              <VillaCombobox
                villas={villas}
                value={form.villaId}
                onChange={(id) => setForm((prev) => ({ ...prev, villaId: id }))}
              />
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Misafir Adı Soyadı <span className="text-red-500">*</span>
              <input type="text" name="guestName" value={form.guestName} onChange={updateField} required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
            </label>
          </div>

          {/* İletişim */}
          <div className="grid gap-4 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Telefon
              <input type="tel" name="guestPhone" value={form.guestPhone} onChange={updateField}
                placeholder="+90 5XX XXX XX XX"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              E-posta
              <input type="email" name="guestEmail" value={form.guestEmail} onChange={updateField}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Uyruk
              <input type="text" name="nationality" value={form.nationality} onChange={updateField}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Kimlik / Pasaport
              <input type="text" name="idNumber" value={form.idNumber} onChange={updateField}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
            </label>
          </div>

          {/* Tarihler + Kişiler + Kanal */}
          <div className="grid gap-4 sm:grid-cols-5">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Giriş <span className="text-red-500">*</span>
              <input type="date" name="startDate" value={form.startDate} onChange={updateField} required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Çıkış <span className="text-red-500">*</span>
              <input type="date" name="endDate" value={form.endDate} onChange={updateField} required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Yetişkin
              <input type="number" min="0" name="adults" value={form.adults} onChange={updateField}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Çocuk
              <input type="number" min="0" name="children" value={form.children} onChange={updateField}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Kanal
              <select name="channel" value={form.channel} onChange={updateField}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2">
                {["Web Sitesi","Villa Scout Pro","Telefon","WhatsApp","Acente","Diğer"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Ödeme bilgileri */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-700">
              💳 Ödeme Bilgileri
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Toplam Rezervasyon Bedeli (₺)
                <input type="number" name="toplamTutar" value={form.toplamTutar} onChange={updateField} min={0}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Alınan Ön Ödeme (₺)
                <input type="number" name="alinanOnOdeme" value={form.alinanOnOdeme} onChange={updateField} min={0}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
                <span className="text-[10px] text-slate-400">
                  Sabit komisyonumuz: {rfBizimKomisyon.toLocaleString("tr-TR")} ₺ (%20)
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Ön Ödeme Durumu
                <select name="onOdemeDurumu" value={form.onOdemeDurumu} onChange={updateField}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2">
                  <option>Beklemede</option><option>Ödendi</option><option>İptal</option>
                </select>
              </label>
            </div>
            {rfToplam > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Komisyon (%20)", value: rfBizimKomisyon, cls: "ring-blue-200 text-blue-700" },
                  { label: "Alınan Ön Öd.", value: rfAlinanOnOdeme, cls: "ring-blue-200 text-blue-800" },
                  { label: "Kapıda Ödenecek", value: rfKapidaOdenecek, cls: "ring-emerald-200 text-emerald-700" },
                  { label: rfAjansBorc > 0 ? "⚠️ Ev Sahibine Borç" : "Ajans Borcu", value: rfAjansBorc, cls: rfAjansBorc > 0 ? "ring-orange-300 text-orange-700" : "ring-slate-200 text-slate-300" },
                ].map(({ label, value, cls }) => (
                  <div key={label} className={`rounded-lg bg-white p-2.5 text-center ring-1 ${cls}`}>
                    <p className="text-[10px] font-semibold uppercase opacity-70">{label}</p>
                    <p className="mt-1 text-base font-bold">{value.toLocaleString("tr-TR")} ₺</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CRM Notları */}
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            CRM Notları
            <textarea name="notes" rows="2" value={form.notes} onChange={updateField}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
          </label>

          {/* Aksiyon */}
          <div className="flex gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              İptal
            </button>
            <button type="submit"
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]">
              Değişiklikleri Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── VillaCombobox ─────────────────────────────────────────────────────────────
// Arama yapılabilen villa seçici; yalnızca "Onaylandı" statüsündeki villaları gösterir.
function VillaCombobox({ villas, value, onChange }) {
  const [open, setOpen]           = useState(false);
  const [query, setQuery]         = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef(null);
  const inputRef     = useRef(null);

  const approved = useMemo(
    () => villas.filter((v) => v.status === "Onaylandı"),
    [villas],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return approved;
    const q = query.toLowerCase();
    return approved.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.owner || "").toLowerCase().includes(q) ||
        (v.location || "").toLowerCase().includes(q),
    );
  }, [approved, query]);

  const selected = approved.find((v) => String(v.id) === String(value)) || null;

  // Dışarı tıklandığında kapat
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function openDropdown() {
    setOpen(true);
    setHighlighted(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function selectVilla(villa) {
    onChange(String(villa.id));
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) selectVilla(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={openDropdown}
        className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm transition hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-medium">{selected.name}</span>
              {selected.location && (
                <span className="text-xs text-slate-400">— {selected.location}</span>
              )}
            </span>
          ) : (
            "Villa seçin…"
          )}
        </span>
        <svg
          className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5">
          {/* Arama alanı */}
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200 focus-within:ring-blue-400">
              <svg className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlighted(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Villa adı, sahibi veya konum…"
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="flex-shrink-0 text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Liste */}
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-400 italic text-center">
                "{query}" ile eşleşen onaylı villa bulunamadı.
              </li>
            ) : (
              filtered.map((villa, idx) => (
                <li
                  key={villa.id}
                  role="option"
                  aria-selected={String(villa.id) === String(value)}
                  onMouseDown={() => selectVilla(villa)}
                  onMouseEnter={() => setHighlighted(idx)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition ${
                    idx === highlighted ? "bg-blue-50" : "hover:bg-slate-50"
                  } ${String(villa.id) === String(value) ? "font-semibold text-blue-700" : "text-slate-700"}`}
                >
                  <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                  <span className="flex-1 truncate">{villa.name}</span>
                  <span className="flex-shrink-0 truncate text-xs text-slate-400">
                    {villa.owner ? `${villa.owner}` : ""}
                    {villa.location ? ` · ${villa.location}` : ""}
                  </span>
                  {String(villa.id) === String(value) && (
                    <svg className="h-4 w-4 flex-shrink-0 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  )}
                </li>
              ))
            )}
          </ul>

          {/* Alt bilgi */}
          {approved.length > 0 && (
            <div className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400">
              {filtered.length} / {approved.length} onaylı villa
              {query && ` · "${query}" için filtrelendi`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReservationsPage({
  villas,
  reservations,
  activities,
  currentUser,
  onAddReservation,
  onUpdateReservation,
  onCancelReservation,
  onSendActivityGuide,
  onSendActivityWhatsapp,
}) {
  const [calendarMonth, setCalendarMonth] = useState(nowIso().slice(0, 7));
  const [calendarVillaFilter, setCalendarVillaFilter] = useState("all");
  const [selectedReservationId, setSelectedReservationId] = useState(null);
  const [editingReservation, setEditingReservation]   = useState(null);
  const [cancelingReservation, setCancelingReservation] = useState(null);
  const [reservationForm, setReservationForm] = useState({
    villaId: String(villas[0]?.id || ""),
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    nationality: "",
    idNumber: "",
    adults: "2",
    children: "0",
    channel: "Web Sitesi",
    specialRequests: "",
    notes: "",
    startDate: "",
    endDate: "",
    // ── Ödeme alanları ────────────────────────────────────────────────────────
    toplamTutar: "",
    alinanOnOdeme: "",        // müşteriden alınan ön ödeme (kullanıcı girer)
    onOdemeDurumu: "Beklemede",
    kapidaOdemeDurumu: "Beklemede",
    ajansOdemeDurumu: "Beklemede", // ajans borcunu ev sahibine ödeme durumu
  });

  // Anlık hesaplamalar (form state'ten türetilir)
  const rfToplam          = Number(reservationForm.toplamTutar) || 0;
  const rfBizimKomisyon   = Math.round(rfToplam * 20 / 100);
  const rfAlinanOnOdeme   = Number(reservationForm.alinanOnOdeme) || 0;
  const rfKapidaOdenecek  = rfToplam > 0 ? rfToplam - rfAlinanOnOdeme : 0;
  const rfAjansBorc       = Math.max(0, rfAlinanOnOdeme - rfBizimKomisyon);

  const reservationsWithVilla = useMemo(() => {
    return reservations
      .map((reservation) => ({
        ...reservation,
        villa: villas.find((villa) => villa.id === reservation.villaId) || null,
      }))
      .filter((row) => row.villa);
  }, [reservations, villas]);

  const selectedReservation =
    reservationsWithVilla.find((row) => row.id === selectedReservationId) || null;

  const availableActivities = useMemo(() => {
    if (!selectedReservation) return [];
    const city = getVillaRegion(selectedReservation.villa);
    return (activities || []).filter(
      (activity) =>
        activity.isActive !== false &&
        activity.city === city &&
        dateRangesOverlap(
          selectedReservation.startDate,
          selectedReservation.endDate,
          activity.startDate,
          activity.endDate,
        ),
    );
  }, [selectedReservation]);

  const monthCells = useMemo(() => getDaysInMonth(calendarMonth), [calendarMonth]);

  function updateReservationField(event) {
    const { name, value } = event.target;
    setReservationForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleReservationSubmit(event) {
    event.preventDefault();
    const payload = {
      id: Date.now(),
      villaId: Number(reservationForm.villaId),
      guestName: reservationForm.guestName.trim(),
      guestEmail: reservationForm.guestEmail.trim(),
      guestPhone: reservationForm.guestPhone.trim(),
      nationality: reservationForm.nationality.trim(),
      idNumber: reservationForm.idNumber.trim(),
      adults: Number(reservationForm.adults || 0),
      children: Number(reservationForm.children || 0),
      channel: reservationForm.channel.trim(),
      specialRequests: reservationForm.specialRequests.trim(),
      notes: reservationForm.notes.trim(),
      startDate: reservationForm.startDate,
      endDate: reservationForm.endDate,
      // ── Ödeme bilgileri ────────────────────────────────────────────────────
      toplamTutar: rfToplam,
      bizimKomisyon: rfBizimKomisyon,
      alinanOnOdeme: rfAlinanOnOdeme,
      kapidaOdenecek: rfKapidaOdenecek,
      ajansBorc: rfAjansBorc,
      onOdemeDurumu: reservationForm.onOdemeDurumu,
      kapidaOdemeDurumu: reservationForm.kapidaOdemeDurumu,
      ajansOdemeDurumu: rfAjansBorc > 0 ? reservationForm.ajansOdemeDurumu : null,
      createdBy: currentUser,
      createdAt: nowIso(),
    };

    if (
      !payload.villaId ||
      !payload.guestName ||
      !payload.guestPhone ||
      !payload.startDate ||
      !payload.endDate ||
      payload.endDate < payload.startDate
    ) {
      return;
    }

    onAddReservation(payload, currentUser);
    setReservationForm((prev) => ({
      ...prev,
      guestName: "",
      guestEmail: "",
      guestPhone: "",
      nationality: "",
      idNumber: "",
      adults: "2",
      children: "0",
      specialRequests: "",
      notes: "",
      startDate: "",
      endDate: "",
      toplamTutar: "",
      alinanOnOdeme: "",
      onOdemeDurumu: "Beklemede",
      kapidaOdemeDurumu: "Beklemede",
      ajansOdemeDurumu: "Beklemede",
    }));
  }

  function dayReservations(dateString) {
    return reservationsWithVilla.filter((reservation) => {
      if (calendarVillaFilter !== "all") {
        if (String(reservation.villaId) !== calendarVillaFilter) return false;
      }
      return isReservationOnDate(reservation, dateString);
    });
  }

  return (
    <>
      <header className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
        <p className="text-sm text-slate-500">Rezervasyon & CRM</p>
        <h2 className="mt-1 text-3xl font-semibold text-slate-900">Rezervasyonlar</h2>
      </header>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Rezervasyon Girişi</h3>
        <form onSubmit={handleReservationSubmit} className="mt-4 grid gap-3 md:grid-cols-4">

          {/* ── Satır 1: Villa + Misafir Adı ─────────────────────────────────── */}
          <div className="flex flex-col gap-1 text-sm font-medium text-slate-700 md:col-span-2">
            Villa <span className="font-normal text-slate-400 text-xs">(Yalnızca Onaylandı)</span>
            <VillaCombobox
              villas={villas}
              value={reservationForm.villaId}
              onChange={(id) =>
                setReservationForm((prev) => ({ ...prev, villaId: id }))
              }
            />
          </div>
          <label className="md:col-span-2 flex flex-col gap-1 text-sm font-medium text-slate-700">
            Misafir Adı Soyadı
            <input
              type="text"
              name="guestName"
              value={reservationForm.guestName}
              onChange={updateReservationField}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>

          {/* ── Satır 2: İletişim bilgileri ──────────────────────────────────── */}
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Telefon
            <input
              type="tel"
              name="guestPhone"
              value={reservationForm.guestPhone}
              onChange={updateReservationField}
              placeholder="+90 5XX XXX XX XX"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            E-posta
            <input
              type="email"
              name="guestEmail"
              value={reservationForm.guestEmail}
              onChange={updateReservationField}
              placeholder="misafir@mail.com"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Uyruk
            <input
              type="text"
              name="nationality"
              value={reservationForm.nationality}
              onChange={updateReservationField}
              placeholder="Örn. Türkiye"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Kimlik / Pasaport No
            <input
              type="text"
              name="idNumber"
              value={reservationForm.idNumber}
              onChange={updateReservationField}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>

          {/* ── Satır 3: Konaklama detayları ─────────────────────────────────── */}
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Giriş Tarihi
            <input
              type="date"
              name="startDate"
              value={reservationForm.startDate}
              onChange={updateReservationField}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Çıkış Tarihi
            <input
              type="date"
              name="endDate"
              value={reservationForm.endDate}
              onChange={updateReservationField}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Yetişkin Sayısı
            <input
              type="number"
              min="0"
              name="adults"
              value={reservationForm.adults}
              onChange={updateReservationField}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Çocuk Sayısı
            <input
              type="number"
              min="0"
              name="children"
              value={reservationForm.children}
              onChange={updateReservationField}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>

          {/* ── Satır 4: Kanal + Notlar ───────────────────────────────────────── */}
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Rezervasyon Kanalı
            <select
              name="channel"
              value={reservationForm.channel}
              onChange={updateReservationField}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            >
              <option>Web Sitesi</option>
              <option>Villa Scout Pro</option>
              <option>Telefon</option>
              <option>WhatsApp</option>
              <option>Acente</option>
              <option>Diğer</option>
            </select>
          </label>
          <label className="md:col-span-3 flex flex-col gap-1 text-sm font-medium text-slate-700">
            Özel Talepler
            <input
              type="text"
              name="specialRequests"
              value={reservationForm.specialRequests}
              onChange={updateReservationField}
              placeholder="Havalimanı transferi, bebek karyolası…"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>

          {/* ── Satır 5: CRM Notları ─────────────────────────────────────────── */}
          <label className="md:col-span-4 flex flex-col gap-1 text-sm font-medium text-slate-700">
            CRM Notları
            <textarea
              name="notes"
              rows="2"
              value={reservationForm.notes}
              onChange={updateReservationField}
              placeholder="Misafirle ilgili özel notlar, tercihler, geçmiş konaklamalar…"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>

          {/* ── Ödeme Bilgileri Paneli ──────────────────────────────────────── */}
          <div className="md:col-span-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-blue-600">💳</span>
              <h4 className="text-sm font-bold text-blue-800">Ödeme Bilgileri</h4>
              <span className="ml-auto text-xs text-blue-500">
                Finans &amp; Hakediş'e otomatik aktarılır
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Toplam tutar */}
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Toplam Rezervasyon Bedeli (₺)
                <input type="number" name="toplamTutar" value={reservationForm.toplamTutar}
                  onChange={updateReservationField} min={0} placeholder="0"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
              </label>

              {/* Alınan ön ödeme */}
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Alınan Ön Ödeme (₺)
                <input type="number" name="alinanOnOdeme" value={reservationForm.alinanOnOdeme}
                  onChange={updateReservationField} min={0} placeholder="0"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2" />
                <span className="text-[10px] text-slate-400">
                  Bizim sabit komisyonumuz: {rfBizimKomisyon.toLocaleString("tr-TR")} ₺ (%20)
                </span>
              </label>

              {/* Ön ödeme durumu */}
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Ön Ödeme Durumu
                <select name="onOdemeDurumu" value={reservationForm.onOdemeDurumu}
                  onChange={updateReservationField}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2">
                  <option>Beklemede</option><option>Ödendi</option><option>İptal</option>
                </select>
              </label>
            </div>

            {/* Canlı hesap gösterimi */}
            {rfToplam > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {/* Bizim komisyon */}
                <div className="rounded-lg bg-white p-3 text-center ring-1 ring-blue-200">
                  <p className="text-[11px] font-semibold uppercase text-blue-600">Bizim Komisyon</p>
                  <p className="text-[10px] text-slate-400">Sabit %20</p>
                  <p className="mt-1 text-lg font-bold text-blue-700">
                    {rfBizimKomisyon.toLocaleString("tr-TR")} ₺
                  </p>
                </div>
                {/* Alınan ön ödeme */}
                <div className="rounded-lg bg-white p-3 text-center ring-1 ring-blue-200">
                  <p className="text-[11px] font-semibold uppercase text-blue-600">Alınan Ön Ödeme</p>
                  <p className="text-[10px] text-slate-400">Müşteriden tahsil</p>
                  <p className="mt-1 text-lg font-bold text-blue-800">
                    {rfAlinanOnOdeme.toLocaleString("tr-TR")} ₺
                  </p>
                  <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    reservationForm.onOdemeDurumu === "Ödendi" ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"}`}>
                    {reservationForm.onOdemeDurumu}
                  </span>
                </div>
                {/* Kapıda ödenecek */}
                <div className="rounded-lg bg-white p-3 text-center ring-1 ring-emerald-200">
                  <p className="text-[11px] font-semibold uppercase text-emerald-600">Kapıda Ödenecek</p>
                  <p className="text-[10px] text-slate-400">Toplam − Ön Ödeme</p>
                  <p className="mt-1 text-lg font-bold text-emerald-700">
                    {rfKapidaOdenecek.toLocaleString("tr-TR")} ₺
                  </p>
                </div>
                {/* Ajans borcu */}
                <div className={`rounded-lg p-3 text-center ring-1 ${
                  rfAjansBorc > 0 ? "bg-orange-50 ring-orange-300" : "bg-slate-50 ring-slate-200"}`}>
                  <p className={`text-[11px] font-semibold uppercase ${rfAjansBorc > 0 ? "text-orange-600" : "text-slate-400"}`}>
                    {rfAjansBorc > 0 ? "⚠️ Ev Sahibine Borcumuz" : "Ajans Borcu"}
                  </p>
                  <p className="text-[10px] text-slate-400">Fazla tahsilat</p>
                  <p className={`mt-1 text-lg font-bold ${rfAjansBorc > 0 ? "text-orange-700" : "text-slate-300"}`}>
                    {rfAjansBorc.toLocaleString("tr-TR")} ₺
                  </p>
                  {rfAjansBorc > 0 && (
                    <p className="mt-0.5 text-[10px] text-orange-500">
                      Finans&apos;a otomatik eklenir
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-4 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Rezervasyon Ekle
            </button>
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">
          Rezervasyonlar ve Aktivite Gönderimi
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-sm font-semibold text-slate-600">
                <th className="border-b border-slate-200 px-4 py-3">Durum</th>
                <th className="border-b border-slate-200 px-4 py-3">Villa</th>
                <th className="border-b border-slate-200 px-4 py-3">Misafir CRM</th>
                <th className="border-b border-slate-200 px-4 py-3">Konaklama</th>
                <th className="border-b border-slate-200 px-4 py-3 text-blue-600">💳 Ödeme Durumu</th>
                <th className="border-b border-slate-200 px-4 py-3">Aktivite</th>
                <th className="border-b border-slate-200 px-4 py-3">Aksiyonlar</th>
              </tr>
            </thead>
            <tbody>
              {reservationsWithVilla.map((reservation) => {
                const isCancelled = reservation.status === "İptal Edildi";
                return (
                <tr key={reservation.id}
                  className={`text-sm transition ${isCancelled ? "bg-slate-50 opacity-60" : "text-slate-700 hover:bg-slate-50/40"}`}>
                  {/* Durum */}
                  <td className="border-b border-slate-100 px-4 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                      isCancelled
                        ? "bg-red-100 text-red-600"
                        : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {isCancelled ? "✕ İptal Edildi" : "✓ Aktif"}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4">
                    <span className={isCancelled ? "line-through text-slate-400" : ""}>
                      {reservation.villa.name}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4">
                    <p className="font-medium text-slate-900">{reservation.guestName}</p>
                    <p className="text-xs text-slate-500">
                      {reservation.guestPhone || "-"} | {reservation.guestEmail || "-"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {reservation.nationality || "-"} | {reservation.idNumber || "-"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Yetişkin: {reservation.adults ?? 0}, Çocuk: {reservation.children ?? 0}
                    </p>
                    <p className="text-xs text-slate-500">Kanal: {reservation.channel || "-"}</p>
                    {reservation.specialRequests && (
                      <p className="mt-1 text-xs text-slate-600">
                        Talep: {reservation.specialRequests}
                      </p>
                    )}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4">
                    {reservation.startDate} → {reservation.endDate}
                  </td>
                  {/* ── Ödeme Durumu Hücresi ────────────────────────────── */}
                  <td className="border-b border-slate-100 px-4 py-4">
                    {reservation.toplamTutar > 0 ? (
                      <div className="space-y-1.5 min-w-[180px]">
                        <div className="text-xs font-bold text-slate-700">
                          {reservation.toplamTutar.toLocaleString("tr-TR")} ₺ toplam
                        </div>
                        {/* Alınan ön ödeme */}
                        <div className="flex items-center justify-between gap-2 rounded-md bg-blue-50 px-2 py-1">
                          <span className="text-[11px] text-blue-700">Alınan Ön Öd.</span>
                          <span className="text-[11px] font-bold text-blue-800">
                            {(reservation.alinanOnOdeme || 0).toLocaleString("tr-TR")} ₺
                          </span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            reservation.onOdemeDurumu === "Ödendi"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {reservation.onOdemeDurumu || "—"}
                          </span>
                        </div>
                        {/* Kapıda ödenecek */}
                        <div className="flex items-center justify-between gap-2 rounded-md bg-emerald-50 px-2 py-1">
                          <span className="text-[11px] text-emerald-700">Kapıda</span>
                          <span className="text-[11px] font-bold text-emerald-800">
                            {(reservation.kapidaOdenecek || 0).toLocaleString("tr-TR")} ₺
                          </span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            reservation.kapidaOdemeDurumu === "Ödendi"
                              ? "bg-emerald-100 text-emerald-700"
                              : reservation.kapidaOdemeDurumu === "İptal"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {reservation.kapidaOdemeDurumu || "—"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Ödeme bilgisi girilmedi</span>
                    )}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onSendActivityGuide(reservation, "link", currentUser)
                        }
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Link
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onSendActivityGuide(reservation, "pdf", currentUser)
                        }
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        PDF
                      </button>
                    </div>
                  </td>
                  {/* Aksiyonlar */}
                  <td className="border-b border-slate-100 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button"
                        onClick={() => setSelectedReservationId(reservation.id)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100">
                        Detay
                      </button>
                      {!isCancelled && (
                        <>
                          <button type="button"
                            onClick={() => setEditingReservation(reservation)}
                            className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100">
                            ✏️ Düzenle
                          </button>
                          <button type="button"
                            onClick={() => setCancelingReservation(reservation)}
                            className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100">
                            ✕ İptal Et
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selectedReservation && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">
              Rezervasyon Detayı - {selectedReservation.guestName}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedReservationId(null)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Kapat
            </button>
          </div>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {/* Sol: CRM bilgileri */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p><span className="font-semibold">Villa:</span> {selectedReservation.villa.name}</p>
              <p><span className="font-semibold">Konaklama:</span> {selectedReservation.startDate} → {selectedReservation.endDate}</p>
              <p><span className="font-semibold">Misafir:</span> {selectedReservation.guestName}</p>
              <p><span className="font-semibold">Telefon:</span> {selectedReservation.guestPhone || "—"}</p>
              <p><span className="font-semibold">E-posta:</span> {selectedReservation.guestEmail || "—"}</p>
              <p><span className="font-semibold">Kanal:</span> {selectedReservation.channel || "—"}</p>
            </div>

            {/* Sağ: Ödeme özeti */}
            {selectedReservation.toplamTutar > 0 ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-blue-700">
                  💳 Ödeme Özeti
                </p>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-slate-600">Toplam Rezervasyon</span>
                  <span className="font-bold text-slate-900">
                    {selectedReservation.toplamTutar.toLocaleString("tr-TR")} ₺
                  </span>
                </div>
                <div className="rounded-lg bg-white p-3 space-y-2 ring-1 ring-blue-100">
                  {/* Bizim komisyon */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-blue-700">Bizim Komisyon (%20)</p>
                      <p className="text-[10px] text-slate-400">Sabit komisyonumuz</p>
                    </div>
                    <p className="font-bold text-blue-700">
                      {(selectedReservation.bizimKomisyon || 0).toLocaleString("tr-TR")} ₺
                    </p>
                  </div>
                  {/* Alınan ön ödeme */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <div>
                      <p className="text-xs font-semibold text-blue-700">Alınan Ön Ödeme</p>
                      <p className="text-[10px] text-slate-400">Müşteriden tahsil edilen</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-blue-700">
                        {(selectedReservation.alinanOnOdeme || 0).toLocaleString("tr-TR")} ₺
                      </p>
                      <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        selectedReservation.onOdemeDurumu === "Ödendi" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {selectedReservation.onOdemeDurumu || "Beklemede"}
                      </span>
                    </div>
                  </div>
                  {/* Kapıda ödenecek */}
                  <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-emerald-700">Kapıda Ödenecek</p>
                      <p className="text-[10px] text-slate-400">Misafir check-in'de ev sahibine öder</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-700">
                        {(selectedReservation.kapidaOdenecek || 0).toLocaleString("tr-TR")} ₺
                      </p>
                      <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        selectedReservation.kapidaOdemeDurumu === "Ödendi" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {selectedReservation.kapidaOdemeDurumu || "Beklemede"}
                      </span>
                    </div>
                  </div>
                  {/* Ajans borcu (varsa) */}
                  {(selectedReservation.ajansBorc || 0) > 0 && (
                    <div className="border-t border-orange-100 pt-2 flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-xs font-semibold text-orange-700">⚠️ Ev Sahibine Borcumuz</p>
                        <p className="text-[10px] text-orange-500">Fazla tahsilat — aktarılacak</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-orange-700">
                          {selectedReservation.ajansBorc.toLocaleString("tr-TR")} ₺
                        </p>
                        <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          selectedReservation.ajansOdemeDurumu === "Ödendi" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
                        }`}>
                          {selectedReservation.ajansOdemeDurumu || "Beklemede"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 flex items-center justify-center text-sm text-slate-400 italic">
                Ödeme bilgisi henüz girilmemiş.
              </div>
            )}
          </div>

          <section className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h4 className="text-sm font-semibold text-blue-900">
              Aktivite Satış Widget&apos;ı
            </h4>
            <p className="mt-1 text-xs text-blue-800">
              Misafirin konaklama tarihleri ve villa bölgesine uygun etkinlikler.
            </p>

            {availableActivities.length > 0 ? (
              <div className="mt-3 space-y-2">
                {availableActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-lg border border-blue-200 bg-white p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {activity.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {activity.startDate} - {activity.endDate} |{" "}
                          {activity.priceTry.toLocaleString("tr-TR")} TL
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          {activity.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onSendActivityWhatsapp(
                            selectedReservation,
                            activity,
                            currentUser,
                          )
                        }
                        className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                      >
                        WhatsApp Teklif Gönder
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      onSendActivityWhatsapp(selectedReservation, null, currentUser)
                    }
                    className="rounded-md border border-green-600 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50"
                  >
                    Tüm Etkinlikleri WhatsApp ile Gönder
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded border border-dashed border-blue-300 bg-white p-3 text-xs text-blue-800">
                Bu tarihlerde ve bölgede önerilecek etkinlik bulunamadı.
              </p>
            )}
          </section>
        </section>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">
            Doluluk Takvimi (Calendar)
          </h3>
          <div className="flex flex-wrap gap-2">
            <input
              type="month"
              value={calendarMonth}
              onChange={(event) => setCalendarMonth(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
            <select
              value={calendarVillaFilter}
              onChange={(event) => setCalendarVillaFilter(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            >
              <option value="all">Tüm Villalar</option>
              {villas.map((villa) => (
                <option key={villa.id} value={String(villa.id)}>
                  {villa.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-500">
          {weekDays.map((day) => (
            <div key={day} className="rounded-md bg-slate-100 px-2 py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {monthCells.map((dateString, index) => {
            if (!dateString) {
              return <div key={`empty-${index}`} className="min-h-24 rounded-md bg-slate-50" />;
            }
            const dayItems = dayReservations(dateString);
            return (
              <div
                key={dateString}
                className={`min-h-24 rounded-md border p-2 ${
                  dayItems.length > 0
                    ? "border-amber-300 bg-amber-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <p className="text-xs font-semibold text-slate-700">
                  {Number(dateString.slice(-2))}
                </p>
                <div className="mt-1 space-y-1">
                  {dayItems.slice(0, 2).map((item) => (
                    <p
                      key={`${dateString}-${item.id}`}
                      className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800"
                    >
                      {item.villa.name}
                    </p>
                  ))}
                  {dayItems.length > 2 && (
                    <p className="text-[10px] text-slate-500">+{dayItems.length - 2} daha</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Düzenle Modalı ─────────────────────────────────────────────────── */}
      {editingReservation && (
        <EditReservationModal
          reservation={editingReservation}
          villas={villas}
          onSave={(updatedData) => {
            onUpdateReservation(editingReservation.id, updatedData, currentUser);
            setEditingReservation(null);
          }}
          onClose={() => setEditingReservation(null)}
        />
      )}

      {/* ── İptal Onay Modalı ──────────────────────────────────────────────── */}
      {cancelingReservation && (
        <CancelConfirmModal
          reservation={cancelingReservation}
          onConfirm={(iadeEdildi) => {
            onCancelReservation(cancelingReservation.id, iadeEdildi, currentUser);
            setCancelingReservation(null);
            if (selectedReservationId === cancelingReservation.id) {
              setSelectedReservationId(null);
            }
          }}
          onClose={() => setCancelingReservation(null)}
        />
      )}
    </>
  );
}

// ── Due date badge: red = overdue, yellow = today, gray = future ──────────────
function DueDateBadge({ dueDate }) {
  if (!dueDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = dueDate < today;
  const isToday = dueDate === today;
  const colorCls = isOverdue
    ? "bg-red-50 text-red-600 border-red-200"
    : isToday
      ? "bg-amber-50 text-amber-600 border-amber-200"
      : "bg-slate-100 text-slate-500 border-slate-200";
  const label = new Date(dueDate + "T00:00:00").toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
  });
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs border flex-shrink-0 ${colorCls}`}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      {label}
    </span>
  );
}

function TasksPage({ tasks, onAddTask, onMoveTask }) {
  const [title, setTitle] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [assignedToName, setAssignedToName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [profileSearch, setProfileSearch] = useState("");
  const [showProfileDrop, setShowProfileDrop] = useState(false);

  useEffect(() => {
    async function loadProfiles() {
      if (!supabase) {
        setProfiles([{ id: "dev", full_name: "Geliştirici", email: "dev@local.dev" }]);
        return;
      }
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      if (data) setProfiles(data);
    }
    loadProfiles();
  }, []);

  const filteredProfiles = profileSearch
    ? profiles.filter((p) =>
        (p.full_name || p.email || "").toLowerCase().includes(profileSearch.toLowerCase()),
      )
    : profiles;

  function selectProfile(p) {
    setAssignedToId(p.id);
    setAssignedToName(p.full_name || p.email);
    setProfileSearch(p.full_name || p.email);
    setShowProfileDrop(false);
  }

  function clearProfile() {
    setAssignedToId("");
    setAssignedToName("");
    setProfileSearch("");
  }

  const groupedTasks = useMemo(() => {
    return taskColumns.reduce((acc, column) => {
      acc[column] = tasks.filter((task) => task.status === column);
      return acc;
    }, {});
  }, [tasks]);

  function addTask(event) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAddTask({
      id: Date.now(),
      title: trimmed,
      status: "Yapılacak",
      assignedToId: assignedToId || null,
      assignedToName: assignedToName || null,
      dueDate: dueDate || null,
    });
    setTitle("");
    setAssignedToId("");
    setAssignedToName("");
    setDueDate("");
    setProfileSearch("");
  }

  return (
    <>
      <header className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
        <p className="text-sm text-slate-500">Trello Benzeri Board</p>
        <h2 className="mt-1 text-3xl font-semibold text-slate-900">Görevler</h2>
      </header>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={addTask} className="flex flex-wrap items-end gap-3">
          {/* Görev başlığı */}
          <label className="flex-1 min-w-[180px] text-sm font-medium text-slate-700">
            Yeni Görev
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Görev başlığı yazın..."
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>

          {/* Kişi Ata — searchable dropdown */}
          <div className="min-w-[180px] text-sm font-medium text-slate-700">
            <p className="mb-2">
              Kişi Ata{" "}
              <span className="text-xs font-normal text-slate-400">(opsiyonel)</span>
            </p>
            <div className="relative">
              <input
                type="text"
                value={profileSearch}
                onChange={(e) => {
                  setProfileSearch(e.target.value);
                  if (assignedToId) {
                    setAssignedToId("");
                    setAssignedToName("");
                  }
                  setShowProfileDrop(true);
                }}
                onFocus={() => setShowProfileDrop(true)}
                onBlur={() => setTimeout(() => setShowProfileDrop(false), 180)}
                placeholder="İsim ara..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
              />
              {assignedToId && (
                <button
                  type="button"
                  onClick={clearProfile}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-base leading-none"
                  title="Seçimi temizle"
                >
                  ×
                </button>
              )}
              {showProfileDrop && filteredProfiles.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {filteredProfiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={() => selectProfile(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                    >
                      <span className="inline-flex w-6 h-6 rounded-full bg-blue-100 items-center justify-center text-blue-700 text-xs font-semibold flex-shrink-0">
                        {(p.full_name || p.email || "?")[0].toUpperCase()}
                      </span>
                      {p.full_name || p.email}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tarih */}
          <label className="text-sm font-medium text-slate-700">
            Tarih{" "}
            <span className="text-xs font-normal text-slate-400">(opsiyonel)</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 transition focus:ring-2"
            />
          </label>

          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Görev Ekle
          </button>
        </form>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        {taskColumns.map((column) => (
          <article
            key={column}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
              {column}
            </h3>

            <div className="space-y-3">
              {groupedTasks[column].length > 0 ? (
                groupedTasks[column].map((task) => {
                  const currentIndex = taskColumns.indexOf(task.status);
                  return (
                    <div
                      key={task.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800">{task.title}</p>
                        <DueDateBadge dueDate={task.dueDate} />
                      </div>
                      {task.assignedToName && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="inline-flex w-5 h-5 rounded-full bg-blue-100 items-center justify-center text-blue-700 text-xs font-semibold flex-shrink-0">
                            {task.assignedToName[0].toUpperCase()}
                          </span>
                          <span className="text-xs text-slate-500">{task.assignedToName}</span>
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => onMoveTask(task.id, currentIndex - 1)}
                          disabled={currentIndex === 0}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Geri
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveTask(task.id, currentIndex + 1)}
                          disabled={currentIndex === taskColumns.length - 1}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          İleri
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                  Bu sütunda görev yok.
                </p>
              )}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

export default function App() {
  const { displayName: currentUser, user } = useAuth();
  const [villas, setVillas] = useState(initialVillas);
  const [reservations, setReservations] = useState(initialReservations);
  const [tasks, setTasks] = useState(initialTasks);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activities, setActivities] = useState(initialActivities);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [auditEntries, setAuditEntries] = useState([]); // dev-mode fallback

  // ── Audit logger (fire-and-forget) ────────────────────────────────────────
  function auditLog({ action, tableName, recordId, oldData, newData, description }) {
    const entry = {
      id: crypto.randomUUID(),
      user_id: user?.id || null,
      user_name: currentUser,
      action,
      table_name: tableName,
      record_id: recordId != null ? String(recordId) : null,
      old_data: oldData || null,
      new_data: newData || null,
      description: description || null,
      created_at: new Date().toISOString(),
    };

    if (!supabase || user?.id === "dev") {
      setAuditEntries((prev) => [entry, ...prev].slice(0, 500));
      return;
    }

    supabase
      .from("audit_logs")
      .insert({
        ...entry,
        old_data: oldData ? JSON.stringify(oldData) : null,
        new_data: newData ? JSON.stringify(newData) : null,
      })
      .then(({ error }) => {
        if (error) console.warn("Audit log yazılamadı:", error.message);
      });
  }

  // ── Otomatik durum güncellemesi: check-in günü kapıda ödeme → Ödendi ─────────
  // Uygulama yüklendiğinde bugün giriş tarihi olan rezervasyonların
  // kapidaOdemeDurumu'nu "Ödendi" olarak işaretle (misafir ödedi varsayımı).
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);

    setReservations((prev) =>
      prev.map((r) =>
        r.startDate === today && r.kapidaOdemeDurumu !== "Ödendi"
          ? { ...r, kapidaOdemeDurumu: "Ödendi" }
          : r,
      ),
    );

    setTransactions((prev) =>
      prev.map((tx) =>
        tx.islemTipi === "Gelir" &&
        tx.islemTarihi === today &&
        tx.kapidaOdemeDurumu !== "Ödendi"
          ? { ...tx, kapidaOdemeDurumu: "Ödendi" }
          : tx,
      ),
    );
  }, []);

  function appendActivity(author, message) {
    setActivityLogs((prev) => [makeLog(author, message), ...prev]);
  }

  function addVilla(villa, author) {
    const log = makeLog(author || "Bilinmeyen Kullanıcı", "Villa kaydı oluşturuldu.");
    setVillas((prev) => [
      {
        ...villa,
        operational: villa.operational || defaultOperational(),
        logs: [...(villa.logs || []), log],
      },
      ...prev,
    ]);
    appendActivity(author, `${villa.name} villası eklendi.`);
    auditLog({
      action: "CREATE",
      tableName: "villas",
      recordId: villa.id,
      newData: { name: villa.name, owner: villa.owner, location: villa.location, status: villa.status },
      description: `Villa oluşturuldu: ${villa.name}`,
    });
  }

  function importVillas(importedVillas, author) {
    const prepared = importedVillas.map((villa) => ({
      ...villa,
      operational: villa.operational || defaultOperational(),
      logs: [
        ...(villa.logs || []),
        makeLog(author || "Bilinmeyen Kullanıcı", "Villa içe aktarma ile eklendi."),
      ],
    }));
    setVillas((prev) => [...prepared, ...prev]);
    appendActivity(author, `${prepared.length} villa içe aktarıldı.`);
  }

  function updateVilla(villaId, updates, author) {
    const oldVilla = villas.find((v) => v.id === villaId);
    setVillas((prev) =>
      prev.map((villa) => {
        if (villa.id !== villaId) return villa;
        const changed = [];
        if (villa.name !== updates.name) changed.push("villa adı");
        if (villa.owner !== updates.owner) changed.push("sahip");
        if (villa.location !== updates.location) changed.push("konum");
        if (villa.phone !== updates.phone) changed.push("telefon");
        if (villa.status !== updates.status) changed.push("durum");
        const changeText =
          changed.length > 0 ? changed.join(", ") : "değişiklik yok (tekrar kayıt)";
        const log = makeLog(
          author || "Bilinmeyen Kullanıcı",
          `Villa bilgileri güncellendi: ${changeText}.`,
        );
        return {
          ...villa,
          ...updates,
          operational: villa.operational || defaultOperational(),
          logs: [...(villa.logs || []), log],
        };
      }),
    );
    appendActivity(author, `Villa bilgileri düzenlendi (ID: ${villaId}).`);
    auditLog({
      action: "UPDATE",
      tableName: "villas",
      recordId: villaId,
      oldData: { name: oldVilla?.name, owner: oldVilla?.owner, location: oldVilla?.location, phone: oldVilla?.phone },
      newData: { name: updates.name, owner: updates.owner, location: updates.location, phone: updates.phone },
      description: `Villa güncellendi: ${updates.name || oldVilla?.name}`,
    });
    if (oldVilla?.seasonalRentTry !== updates.seasonalRentTry && updates.seasonalRentTry != null) {
      auditLog({
        action: "PRICE_UPDATE",
        tableName: "villas",
        recordId: villaId,
        oldData: { seasonalRentTry: oldVilla?.seasonalRentTry },
        newData: { seasonalRentTry: updates.seasonalRentTry },
        description: `Villa fiyatı güncellendi: ${oldVilla?.name} — ${oldVilla?.seasonalRentTry} ₺ → ${updates.seasonalRentTry} ₺`,
      });
    }
  }

  function updateOperationalNotes(villaId, operationalUpdates, newCriticalNote, author) {
    setVillas((prev) =>
      prev.map((villa) => {
        if (villa.id !== villaId) return villa;
        const currentOperational = villa.operational || defaultOperational();
        const nextCriticalNotes = newCriticalNote
          ? [...(currentOperational.criticalNotes || []), newCriticalNote]
          : currentOperational.criticalNotes || [];
        const nextOperational = {
          ...currentOperational,
          keyInfo: operationalUpdates.keyInfo || "",
          cleaningInfo: operationalUpdates.cleaningInfo || "",
          ownerSpecialRequests: operationalUpdates.ownerSpecialRequests || "",
          criticalNotes: nextCriticalNotes,
        };
        const logText = newCriticalNote
          ? "Kritik operasyon paneli güncellendi ve yeni kritik not eklendi."
          : "Kritik operasyon paneli güncellendi.";
        return {
          ...villa,
          operational: nextOperational,
          logs: [...(villa.logs || []), makeLog(author || "Bilinmeyen Kullanıcı", logText)],
        };
      }),
    );
    appendActivity(author, `Kritik operasyon notları güncellendi (ID: ${villaId}).`);
  }

  function deleteVilla(villaId, author) {
    const target = villas.find((villa) => villa.id === villaId);
    setVillas((prev) => prev.filter((villa) => villa.id !== villaId));
    setReservations((prev) => prev.filter((reservation) => reservation.villaId !== villaId));
    appendActivity(
      author,
      `${target?.name || `ID ${villaId}`} villası sistemden silindi.`,
    );
    auditLog({
      action: "DELETE",
      tableName: "villas",
      recordId: villaId,
      oldData: { name: target?.name, owner: target?.owner, location: target?.location, status: target?.status },
      description: `Villa silindi: ${target?.name || villaId}`,
    });
  }

  function updateVillaStatus(villaId, nextStatus, author) {
    const oldVilla = villas.find((v) => v.id === villaId);
    setVillas((prev) =>
      prev.map((villa) => {
        if (villa.id !== villaId) return villa;
        if (villa.status === nextStatus) return villa;
        const log = makeLog(
          author || "Bilinmeyen Kullanıcı",
          `Durum değiştirildi: ${villa.status} -> ${nextStatus}.`,
        );
        return { ...villa, status: nextStatus, logs: [...(villa.logs || []), log] };
      }),
    );
    appendActivity(author, `Villa durumu güncellendi (ID: ${villaId}).`);
    if (oldVilla?.status !== nextStatus) {
      auditLog({
        action: "STATUS_CHANGE",
        tableName: "villas",
        recordId: villaId,
        oldData: { status: oldVilla?.status },
        newData: { status: nextStatus },
        description: `${oldVilla?.name || villaId} durumu değiştirildi: ${oldVilla?.status} → ${nextStatus}`,
      });
    }
  }

  function addLogToVilla(villaId, log, author) {
    setVillas((prev) =>
      prev.map((villa) =>
        villa.id === villaId
          ? { ...villa, logs: [...(villa.logs || []), log] }
          : villa,
      ),
    );
    appendActivity(author, `Villa log kaydı eklendi (ID: ${villaId}).`);
  }

  function addReservation(reservation, author) {
    setReservations((prev) => [reservation, ...prev]);

    // ── Ödeme bilgisi varsa otomatik finansal işlem oluştur ──────────────────
    if (reservation.toplamTutar > 0) {
      const tx = {
        id: Date.now() + 1,
        villaId: reservation.villaId,
        rezervasyonId: reservation.id,
        islemTipi: "Gelir",
        miktar: reservation.toplamTutar,
        bizimKomisyon: reservation.bizimKomisyon,
        alinanOnOdeme: reservation.alinanOnOdeme,
        kapidaOdenecek: reservation.kapidaOdenecek,
        ajansBorc: reservation.ajansBorc || 0,
        ajansOdemeDurumu: reservation.ajansOdemeDurumu || "Beklemede",
        islemTarihi: reservation.startDate,
        aciklama: `Rezervasyon — ${reservation.guestName} (${reservation.startDate} / ${reservation.endDate})`,
        durum: reservation.onOdemeDurumu || "Beklemede",
        kapidaOdemeDurumu: reservation.kapidaOdemeDurumu || "Beklemede",
        createdBy: author || "Bilinmeyen Kullanıcı",
        createdAt: nowIso(),
        autoCreated: true,
      };
      setTransactions((prev) => [tx, ...prev]);
    }

    setVillas((prev) =>
      prev.map((villa) => {
        if (villa.id !== reservation.villaId) return villa;
        return {
          ...villa,
          logs: [
            ...(villa.logs || []),
            makeLog(
              author || "Bilinmeyen Kullanıcı",
              `Rezervasyon eklendi: ${reservation.guestName} (${reservation.startDate} - ${reservation.endDate})${
                reservation.toplamTutar > 0
                  ? ` — ${reservation.toplamTutar.toLocaleString("tr-TR")} ₺ (Ön: ${reservation.alinanOnOdeme?.toLocaleString("tr-TR")} ₺${reservation.ajansBorc > 0 ? `, Ajans Borcu: ${reservation.ajansBorc.toLocaleString("tr-TR")} ₺` : ""})`
                  : ""
              }.`,
            ),
          ],
        };
      }),
    );
    appendActivity(
      author,
      `Yeni rezervasyon girildi: ${reservation.guestName} (${reservation.startDate} - ${reservation.endDate})${
        reservation.toplamTutar > 0
          ? ` — Toplam ${reservation.toplamTutar.toLocaleString("tr-TR")} ₺, ön ödeme ${reservation.onOdeme?.toLocaleString("tr-TR")} ₺.`
          : "."
      }`,
    );
    auditLog({
      action: "CREATE",
      tableName: "reservations",
      recordId: reservation.id,
      newData: {
        guestName: reservation.guestName,
        startDate: reservation.startDate,
        endDate: reservation.endDate,
        toplamTutar: reservation.toplamTutar,
        alinanOnOdeme: reservation.alinanOnOdeme,
      },
      description: `Rezervasyon oluşturuldu: ${reservation.guestName} (${reservation.startDate}–${reservation.endDate})`,
    });
  }

  function sendActivityGuide(reservation, type, author) {
    const targetUrl = type === "pdf" ? ACTIVITY_GUIDE_PDF : ACTIVITY_GUIDE_LINK;
    const subject = encodeURIComponent("Bölgemizdeki Aktiviteler");
    const body = encodeURIComponent(
      `Merhaba ${reservation.guestName},\n\nBölgemizdeki aktiviteler için ${
        type === "pdf" ? "PDF" : "link"
      } paylaşımı:\n${targetUrl}\n\nİyi tatiller dileriz.`,
    );

    if (reservation.guestEmail) {
      window.open(`mailto:${reservation.guestEmail}?subject=${subject}&body=${body}`);
    } else {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    }

    const villa = villas.find((item) => item.id === reservation.villaId);
    const logText =
      type === "pdf"
        ? `'Bölgemizdeki Aktiviteler' PDF'i misafire gönderildi.`
        : `'Bölgemizdeki Aktiviteler' linki misafire gönderildi.`;

    setVillas((prev) =>
      prev.map((item) =>
        item.id === reservation.villaId
          ? {
              ...item,
              logs: [
                ...(item.logs || []),
                makeLog(author || "Bilinmeyen Kullanıcı", logText),
              ],
            }
          : item,
      ),
    );
    appendActivity(
      author,
      `${villa?.name || "Villa"} için ${reservation.guestName} misafirine aktivite ${
        type === "pdf" ? "PDF'i" : "linki"
      } gönderildi.`,
    );
  }

  function sendActivityWhatsapp(reservation, activity, author) {
    const villa = villas.find((item) => item.id === reservation.villaId);
    const phoneNumber = normalizeWhatsappNumber(reservation.guestPhone);
    if (!phoneNumber) {
      appendActivity(
        author,
        `${reservation.guestName} için WhatsApp gönderimi başarısız: telefon yok.`,
      );
      return;
    }

    const region = getVillaRegion(villa);
    const matchedActivities = activity
      ? [activity]
      : activities.filter(
          (item) =>
            item.isActive !== false &&
            item.city === region &&
            dateRangesOverlap(
              reservation.startDate,
              reservation.endDate,
              item.startDate,
              item.endDate,
            ),
        );

    const lines =
      matchedActivities.length > 0
        ? matchedActivities.map(
            (item) =>
              `- ${item.title} (${item.startDate}-${item.endDate}) ${item.priceTry} TL`,
          )
        : ["- Şu an için uygun etkinlik bulunmuyor, size özel öneri ileteceğiz."];

    const message = encodeURIComponent(
      `Merhaba ${reservation.guestName},\n${villa?.name || "villamız"} konaklamanız (${reservation.startDate} - ${reservation.endDate}) için Bölgemizdeki Aktiviteler:\n${lines.join(
        "\n",
      )}\n\nDetaylar için bize bu numaradan yanıt verebilirsiniz.`,
    );
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, "_blank", "noopener,noreferrer");

    setVillas((prev) =>
      prev.map((item) =>
        item.id === reservation.villaId
          ? {
              ...item,
              logs: [
                ...(item.logs || []),
                makeLog(
                  author || "Bilinmeyen Kullanıcı",
                  activity
                    ? `WhatsApp ile aktivite teklifi gönderildi: ${activity.title}.`
                    : "WhatsApp ile tüm uygun aktiviteler gönderildi.",
                ),
              ],
            }
          : item,
      ),
    );

    appendActivity(
      author,
      `${reservation.guestName} misafirine WhatsApp aktivite teklifi gönderildi (${matchedActivities.length} etkinlik).`,
    );
  }

  function addActivity(data) {
    const newActivity = {
      ...data,
      id: `act-${Date.now()}`,
      createdAt: nowIso(),
    };
    setActivities((prev) => [newActivity, ...prev]);
    appendActivity(currentUser, `Yeni aktivite eklendi: ${data.title}.`);
  }

  function updateActivity(activityId, data) {
    setActivities((prev) =>
      prev.map((a) => (a.id === activityId ? { ...a, ...data } : a)),
    );
    appendActivity(currentUser, `Aktivite güncellendi: ${data.title}.`);
  }

  function deleteActivity(activityId) {
    const target = activities.find((a) => a.id === activityId);
    setActivities((prev) => prev.filter((a) => a.id !== activityId));
    appendActivity(
      currentUser,
      `Aktivite silindi: ${target?.title || activityId}.`,
    );
  }

  function toggleActivity(activityId) {
    setActivities((prev) =>
      prev.map((a) => {
        if (a.id !== activityId) return a;
        const next = !a.isActive;
        appendActivity(
          currentUser,
          `${a.title} aktivitesi ${next ? "aktif" : "pasif"} yapıldı.`,
        );
        return { ...a, isActive: next };
      }),
    );
  }

  function addTransaction(data) {
    let enriched = { ...data };
    if (data.islemTipi === "Gelir" && data.bizimKomisyon == null) {
      enriched.bizimKomisyon   = Math.round(data.miktar * 20 / 100);
      enriched.alinanOnOdeme   = data.alinanOnOdeme ?? enriched.bizimKomisyon;
      enriched.kapidaOdenecek  = data.miktar - enriched.alinanOnOdeme;
      enriched.ajansBorc       = Math.max(0, enriched.alinanOnOdeme - enriched.bizimKomisyon);
      enriched.kapidaOdemeDurumu = enriched.kapidaOdemeDurumu || "Beklemede";
      enriched.ajansOdemeDurumu  = enriched.ajansBorc > 0 ? (enriched.ajansOdemeDurumu || "Beklemede") : null;
    }
    const tx = { ...enriched, id: Date.now(), createdAt: nowIso() };
    setTransactions((prev) => [tx, ...prev]);
    const villa = villas.find((v) => v.id === data.villaId);
    appendActivity(
      data.createdBy || currentUser,
      `Yeni finansal işlem eklendi: ${data.islemTipi} ${data.miktar.toLocaleString("tr-TR")} ₺ — ${villa?.name || "Villa #" + data.villaId}.`,
    );
    auditLog({
      action: "CREATE",
      tableName: "transactions",
      recordId: tx.id,
      newData: { islemTipi: tx.islemTipi, miktar: tx.miktar, durum: tx.durum, aciklama: tx.aciklama },
      description: `Finansal işlem oluşturuldu: ${tx.islemTipi} ${tx.miktar?.toLocaleString("tr-TR")} ₺ — ${villa?.name || ""}`,
    });
  }

  function updateTransaction(txId, data) {
    const oldTx = transactions.find((t) => t.id === txId);
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, ...data } : t)),
    );
    appendActivity(currentUser, `Finansal işlem güncellendi (ID: ${txId}).`);
    auditLog({
      action: "UPDATE",
      tableName: "transactions",
      recordId: txId,
      oldData: oldTx ? { miktar: oldTx.miktar, durum: oldTx.durum, aciklama: oldTx.aciklama } : null,
      newData: { miktar: data.miktar, durum: data.durum, aciklama: data.aciklama },
      description: `Finansal işlem güncellendi: ${oldTx?.aciklama || txId}`,
    });
  }

  function deleteTransaction(txId) {
    const target = transactions.find((t) => t.id === txId);
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
    appendActivity(
      currentUser,
      `Finansal işlem silindi: ${target?.aciklama || `ID ${txId}`}.`,
    );
    auditLog({
      action: "DELETE",
      tableName: "transactions",
      recordId: txId,
      oldData: { islemTipi: target?.islemTipi, miktar: target?.miktar, aciklama: target?.aciklama, durum: target?.durum },
      description: `Finansal işlem silindi: ${target?.aciklama || txId}`,
    });
  }

  function markTransactionPaid(txId) {
    const target = transactions.find((t) => t.id === txId);
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, durum: "Ödendi" } : t)),
    );
    appendActivity(
      currentUser,
      `Ön ödeme "Ödendi" olarak işaretlendi: ${target?.aciklama || `ID ${txId}`}.`,
    );
    auditLog({
      action: "STATUS_CHANGE",
      tableName: "transactions",
      recordId: txId,
      oldData: { durum: target?.durum },
      newData: { durum: "Ödendi" },
      description: `Ön ödeme alındı: ${target?.aciklama || txId}`,
    });
  }

  function markKapidaOdendi(txId) {
    const target = transactions.find((t) => t.id === txId);
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, kapidaOdemeDurumu: "Ödendi" } : t)),
    );
    appendActivity(
      currentUser,
      `Kapıda ödeme alındı (ev sahibi %80 tahsil etti): ${target?.aciklama || `ID ${txId}`}.`,
    );
    auditLog({
      action: "STATUS_CHANGE",
      tableName: "transactions",
      recordId: txId,
      oldData: { kapidaOdemeDurumu: target?.kapidaOdemeDurumu },
      newData: { kapidaOdemeDurumu: "Ödendi" },
      description: `Kapıda ödeme tahsil edildi: ${target?.aciklama || txId}`,
    });
  }

  function updateReservation(id, updatedData, author) {
    const oldReservation = reservations.find((r) => r.id === id);
    // Finansal alanları yeniden hesapla
    const bk = Math.round((updatedData.toplamTutar || 0) * 20 / 100);
    const ao = Number(updatedData.alinanOnOdeme) || 0;
    const ko = (updatedData.toplamTutar || 0) - ao;
    const ab = Math.max(0, ao - bk);
    const enriched = { ...updatedData, bizimKomisyon: bk, alinanOnOdeme: ao, kapidaOdenecek: ko, ajansBorc: ab };

    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...enriched, updatedAt: nowIso() } : r)),
    );

    // Bağlı finansal işlemi de güncelle
    setTransactions((prev) =>
      prev.map((tx) => {
        if (tx.rezervasyonId !== id || !tx.autoCreated) return tx;
        return {
          ...tx,
          miktar: enriched.toplamTutar,
          bizimKomisyon: enriched.bizimKomisyon,
          alinanOnOdeme: enriched.alinanOnOdeme,
          kapidaOdenecek: enriched.kapidaOdenecek,
          ajansBorc: enriched.ajansBorc,
          ajansOdemeDurumu: enriched.ajansBorc > 0 ? (tx.ajansOdemeDurumu || "Beklemede") : null,
          islemTarihi: enriched.startDate,
          aciklama: `Rezervasyon — ${enriched.guestName} (${enriched.startDate} / ${enriched.endDate})`,
          durum: enriched.onOdemeDurumu || tx.durum,
          kapidaOdemeDurumu: enriched.kapidaOdemeDurumu || tx.kapidaOdemeDurumu,
        };
      }),
    );

    appendActivity(
      author || currentUser,
      `Rezervasyon güncellendi: ${enriched.guestName} — ${enriched.startDate}/${enriched.endDate}, ${(enriched.toplamTutar || 0).toLocaleString("tr-TR")} ₺.`,
    );
    auditLog({
      action: "UPDATE",
      tableName: "reservations",
      recordId: id,
      oldData: {
        guestName: oldReservation?.guestName,
        startDate: oldReservation?.startDate,
        endDate: oldReservation?.endDate,
        toplamTutar: oldReservation?.toplamTutar,
        alinanOnOdeme: oldReservation?.alinanOnOdeme,
      },
      newData: {
        guestName: enriched.guestName,
        startDate: enriched.startDate,
        endDate: enriched.endDate,
        toplamTutar: enriched.toplamTutar,
        alinanOnOdeme: enriched.alinanOnOdeme,
      },
      description: `Rezervasyon güncellendi: ${enriched.guestName} (${enriched.startDate}–${enriched.endDate})`,
    });
  }

  function cancelReservation(id, iadeEdildi, author) {
    const r = reservations.find((res) => res.id === id);
    setReservations((prev) =>
      prev.map((res) =>
        res.id === id ? { ...res, status: "İptal Edildi", cancelledAt: nowIso() } : res,
      ),
    );

    if (iadeEdildi) {
      // İade edildi → bağlı işlemi "İptal" olarak işaretle, kazançtan düşülür
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.rezervasyonId === id
            ? { ...tx, durum: "İptal", kapidaOdemeDurumu: "İptal", ajansOdemeDurumu: "İptal" }
            : tx,
        ),
      );
    }
    // İade edilmedi → işlem durum olarak beklemede/ödendi kalır ama rezervasyon iptal edildi

    appendActivity(
      author || currentUser,
      `Rezervasyon iptal edildi: ${r?.guestName} (${r?.startDate}–${r?.endDate}). Ön ödeme iade: ${iadeEdildi ? "Evet" : "Hayır"}.`,
    );
    auditLog({
      action: "CANCEL",
      tableName: "reservations",
      recordId: id,
      oldData: { guestName: r?.guestName, startDate: r?.startDate, endDate: r?.endDate, toplamTutar: r?.toplamTutar },
      newData: { status: "İptal Edildi", iadeEdildi },
      description: `Rezervasyon iptal edildi: ${r?.guestName} — İade: ${iadeEdildi ? "Evet" : "Hayır"}`,
    });
  }

  function markAjansOdendi(txId) {
    const target = transactions.find((t) => t.id === txId);
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, ajansOdemeDurumu: "Ödendi" } : t)),
    );
    appendActivity(
      currentUser,
      `Ajans borcu ödendi (ev sahibine fazla tahsilat aktarıldı): ${target?.aciklama || `ID ${txId}`}.`,
    );
    auditLog({
      action: "STATUS_CHANGE",
      tableName: "transactions",
      recordId: txId,
      oldData: { ajansOdemeDurumu: target?.ajansOdemeDurumu },
      newData: { ajansOdemeDurumu: "Ödendi" },
      description: `Ajans borcu ödendi: ${target?.aciklama || txId}`,
    });
  }

  function addTask(task) {
    setTasks((prev) => [task, ...prev]);
  }

  function moveTask(taskId, targetIndex) {
    if (targetIndex < 0 || targetIndex >= taskColumns.length) return;
    const nextStatus = taskColumns[targetIndex];
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, status: nextStatus } : task,
      ),
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public route — login page (no sidebar) */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected layout — requires authentication */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <DashboardPage
                  villas={villas}
                  tasks={tasks}
                  reservations={reservations}
                  activityLogs={activityLogs}
                  onMoveTask={moveTask}
                />
              }
            />
            <Route
              path="/villas"
              element={
                <VillasPage
                  villas={villas}
                  currentUser={currentUser}
                  onAddVilla={addVilla}
                  onImportVillas={importVillas}
                  onAddLog={addLogToVilla}
                  onUpdateOperationalNotes={updateOperationalNotes}
                  onUpdateVilla={updateVilla}
                  onDeleteVilla={deleteVilla}
                  onUpdateStatus={updateVillaStatus}
                />
              }
            />
            <Route
              path="/reservations"
              element={
                <ReservationsPage
                  villas={villas}
                  reservations={reservations}
                  activities={activities}
                  currentUser={currentUser}
                  onAddReservation={addReservation}
                  onUpdateReservation={updateReservation}
                  onCancelReservation={cancelReservation}
                  onSendActivityGuide={sendActivityGuide}
                  onSendActivityWhatsapp={sendActivityWhatsapp}
                />
              }
            />
            <Route
              path="/tasks"
              element={
                <TasksPage tasks={tasks} onAddTask={addTask} onMoveTask={moveTask} />
              }
            />
            <Route
              path="/activities"
              element={
                <ActivitiesPage
                  activities={activities}
                  onAddActivity={addActivity}
                  onUpdateActivity={updateActivity}
                  onDeleteActivity={deleteActivity}
                  onToggleActivity={toggleActivity}
                />
              }
            />

            {/* Admin-only routes */}
            <Route
              path="/finance"
              element={
                <ProtectedRoute requiredRole="admin">
                  <FinancialPage
                    villas={villas}
                    transactions={transactions}
                    currentUser={currentUser}
                    onAddTransaction={addTransaction}
                    onUpdateTransaction={updateTransaction}
                    onDeleteTransaction={deleteTransaction}
                    onMarkPaid={markTransactionPaid}
                    onMarkKapidaOdendi={markKapidaOdendi}
                    onMarkAjansOdendi={markAjansOdendi}
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/statistics"
              element={
                <ProtectedRoute requiredRole="admin">
                  <StatisticsPage
                    villas={villas}
                    reservations={reservations}
                    transactions={transactions}
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff"
              element={
                <ProtectedRoute requiredRole="admin">
                  <StaffManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-logs"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AuditLogsPage devLogs={auditEntries} />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
