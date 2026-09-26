/* Design system: «دفتر الدوام الورقي» — editorial stationery, warm ivory paper, ink navy, coral action markers, Arabic-first clarity. */
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowLeft,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  Filter,
  Info,
  Loader2,
  RotateCcw,
  ScanLine,
  Sparkles,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const HERO_IMAGE = "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-paper-hero-RQ5vBrEG5ni3iJJuDgFaFh.webp";
const EMPTY_IMAGE = "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-empty-state-RykGkFEQghf3KYeEMEY2VJ.webp";
const SUMMARY_IMAGE = "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-summary-BkdjVsxDvCXms2LNtbN6aK.webp";
const GUIDE_IMAGE = "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-guide-he9pEC4RkFnaLxM3KrxH6w.webp";
const MARK_IMAGE = "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-mark-TfQRMuRdAXnhUzTrxwgu4f.png";

const SAMPLE_INPUT = `1001\t2025-09-01\t08:03
1001\t2025-09-01\t18:07
1002\t2025-09-01\t09:16
1002\t2025-09-01\t17:44
1003\t2025-09-02\t08:52
1003\t2025-09-02\t18:00
1001\t2025-09-02\t09:21
1001\t2025-09-02\t17:58`;

const DEFAULT_SCHEDULE = { endTime: "18:00", endGrace: 0, startTime: "09:00", startGrace: 15 };
const SAMPLE_NAMES = `1001\tأحمد علي
1002\tسارة محمد
1003\tخالد حسن`;

type Schedule = typeof DEFAULT_SCHEDULE;
type AttendanceRow = {
  id: string;
  employeeName: string;
  date: string;
  time: string;
  code: string;
  raw: string;
  role: "دخول" | "خروج" | "حركة";
  status: "ضمن الوقت" | "متأخر" | "خروج مبكر" | "حركة";
  lateMinutes: number;
  earlyMinutes: number;
  origin: "أصلية" | "مضافة تلقائياً";
  adjustment: string;
};
type CleaningSummary = { addedEntries: number; addedExits: number; duplicatesRemoved: number };
type ParsedRow = Pick<AttendanceRow, "id" | "employeeName" | "date" | "time" | "code" | "raw">;
type DetectionInfo = {
  serialIndex: number | null;
  employeeIndex: number | null;
  zeroIndexes: number[];
  constantIndexes: number[];
  dateIndex: number | null;
  timeIndex: number | null;
  message: string;
};
type ParseResult = { rows: AttendanceRow[]; invalid: string[]; detection: DetectionInfo };

function formatNumber(value: number) { return new Intl.NumberFormat("ar-EG").format(value); }
function parseClock(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}
function clockMinutes(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}
function getStatusTone(status: string) {
  if (status === "ضمن الوقت") return "status-positive";
  if (status === "متأخر") return "status-warning";
  if (status === "خروج مبكر") return "status-negative";
  return "status-neutral";
}
function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] || character));
}
function parseEmployeeNames(text: string) {
  return text.split(/\r?\n/).reduce<Record<string, string>>((names, line) => {
    const match = line.trim().match(/^(\d+)\s*(?:\t|,|;|\||\s+-\s+)\s*(.+)$/) || line.trim().match(/^(\d+)\s+(.+)$/);
    if (match) names[match[1]] = match[2].trim();
    return names;
  }, {});
}
function parseAttendanceText(text: string): ParseResult {
  const invalid: string[] = [];
  const parsedLines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.includes("\t") ? "\t" : line.includes(";") ? ";" : line.includes(",") ? "," : null;
    return { line, parts: separator ? line.split(separator).map((part) => part.trim()) : line.split(/\s+/) };
  });
  const dataLines = parsedLines.filter(({ parts }) => parts.some((part) => /\d{4}[-/]\d{1,2}[-/]\d{1,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(part)) && parts.some((part) => /\b([01]?\d|2[0-3]):[0-5]\d/.test(part)));
  const sample = dataLines[0]?.parts || [];
  const dateIndex = sample.findIndex((part) => /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(part));
  const timeIndex = sample.findIndex((part) => /\b([01]?\d|2[0-3]):[0-5]\d/.test(part));
  const numericIndexes = sample.map((_, index) => index).filter((index) => index !== dateIndex && index !== timeIndex && dataLines.every(({ parts }) => /^\d+$/.test(parts[index] || "")));
  const valuesByIndex = new Map<number, number[]>();
  numericIndexes.forEach((index) => valuesByIndex.set(index, dataLines.map(({ parts }) => Number(parts[index]))));
  const zeroIndexes = numericIndexes.filter((index) => valuesByIndex.get(index)!.every((value) => value === 0));
  const constantIndexes = numericIndexes.filter((index) => new Set(valuesByIndex.get(index)!).size === 1);
  const serialIndex = numericIndexes.find((index) => {
    if (zeroIndexes.includes(index) || constantIndexes.includes(index)) return false;
    const values = valuesByIndex.get(index)!;
    return values.length > 1 && values.every((value, position) => position === 0 || value === values[position - 1] + 1);
  }) ?? null;
  const ignoredIndexes = new Set([...zeroIndexes, ...constantIndexes, ...(serialIndex === null ? [] : [serialIndex])]);
  const usefulIndexes = numericIndexes.filter((index) => !ignoredIndexes.has(index));
  const employeeIndex = usefulIndexes.find((index) => {
    const values = valuesByIndex.get(index)!;
    const countsByDay = new Map<string, number>();
    values.forEach((value, position) => {
      const day = dataLines[position].parts[dateIndex] || "";
      const key = `${day}|${value}`;
      countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
    });
    const dailyCounts = Array.from(countsByDay.values());
    return new Set(values).size < values.length && dailyCounts.some((count) => count >= 2) && Math.max(...dailyCounts) <= 6;
  }) ?? usefulIndexes[0] ?? null;
  const detection: DetectionInfo = {
    serialIndex,
    employeeIndex,
    zeroIndexes,
    constantIndexes,
    dateIndex: dateIndex >= 0 ? dateIndex : null,
    timeIndex: timeIndex >= 0 ? timeIndex : null,
    message: employeeIndex === null ? "لم أجد عموداً واضحاً لرقم الموظف من التكرار اليومي." : `فهمت رقم الموظف من العمود ${employeeIndex + 1}${serialIndex !== null ? `، وتجاهلت رقم التسلسل في العمود ${serialIndex + 1}` : ""}${zeroIndexes.length ? ` وأعمدة الصفر (${zeroIndexes.map((index) => index + 1).join("، ")})` : ""}${constantIndexes.length ? ` والأعمدة الثابتة مثل رقم البصامة (${constantIndexes.map((index) => index + 1).join("، ")})` : ""}.`,
  };
  const rows: ParsedRow[] = [];
  parsedLines.forEach(({ line, parts }) => {
    const dateMatch = line.match(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/);
    const timeMatch = line.match(/\b([01]?\d|2[0-3]):[0-5]\d(?:\s?[AP]M)?\b/i);
    const employee = detection.employeeIndex === null ? "" : parts[detection.employeeIndex]?.replace(/\D/g, "") || "";
    const codeCandidate = parts.find((part, index) => index !== dateIndex && index !== timeIndex && index !== detection.employeeIndex && /^\d+$/.test(part)) || "";
    if (!dateMatch || !timeMatch || !employee) {
      if (!/^((رقم|التاريخ|date|id|employee|time|code|status)\b)/i.test(line)) invalid.push(line);
      return;
    }
    rows.push({ id: employee, employeeName: "", date: dateMatch[1], time: timeMatch[0], code: codeCandidate, raw: line });
  });
  return { rows: rows as ParseResult["rows"], invalid, detection };
}
function processAttendance(baseRows: ParseResult["rows"], schedule: Schedule, employeeNames: Record<string, string> = {}): { rows: AttendanceRow[]; summary: CleaningSummary } {
  const start = parseClock(schedule.startTime) ?? 540;
  const end = parseClock(schedule.endTime) ?? 1080;
  const groups = new Map<string, typeof baseRows>();
  const summary: CleaningSummary = { addedEntries: 0, addedExits: 0, duplicatesRemoved: 0 };
  baseRows.forEach((row) => {
    const key = `${row.id}|${row.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  });
  const normalized = Array.from(groups.values()).flatMap((group) => {
    const ordered = [...group].sort((a, b) => clockMinutes(a.time) - clockMinutes(b.time));
    const midpoint = (start + end) / 2;
    const entryCandidates = ordered.filter((row) => clockMinutes(row.time) <= midpoint);
    const exitCandidates = ordered.filter((row) => clockMinutes(row.time) > midpoint);
    const selectedEntry = entryCandidates[0];
    const selectedExit = exitCandidates.at(-1);
    const selected = [
      selectedEntry ? { ...selectedEntry, roleHint: "دخول" as const, adjustment: entryCandidates.length > 1 ? "تم اعتماد أول بصمة دخول" : "" } : { id: group[0].id, employeeName: employeeNames[group[0].id] || "", date: group[0].date, time: schedule.startTime, code: "", raw: "بصمة دخول مضافة تلقائياً", roleHint: "دخول" as const, origin: "مضافة تلقائياً" as const, adjustment: "بصمة دخول مضافة تلقائياً" },
      selectedExit ? { ...selectedExit, roleHint: "خروج" as const, adjustment: exitCandidates.length > 1 ? "تم اعتماد آخر بصمة خروج" : "" } : { id: group[0].id, employeeName: employeeNames[group[0].id] || "", date: group[0].date, time: schedule.endTime, code: "", raw: "بصمة خروج مضافة تلقائياً", roleHint: "خروج" as const, origin: "مضافة تلقائياً" as const, adjustment: "بصمة خروج مضافة تلقائياً" },
    ];
    summary.addedEntries += selectedEntry ? 0 : 1;
    summary.addedExits += selectedExit ? 0 : 1;
    summary.duplicatesRemoved += Math.max(0, entryCandidates.length - 1) + Math.max(0, exitCandidates.length - 1);
    return selected.map((row) => {
      const isEntry = row.roleHint === "دخول";
      const isExit = row.roleHint === "خروج";
      const actual = clockMinutes(row.time);
      const lateMinutes = isEntry ? Math.max(0, actual - (start + Math.max(0, schedule.startGrace))) : 0;
      const earlyMinutes = isExit ? Math.max(0, (end - Math.max(0, schedule.endGrace)) - actual) : 0;
      const role: "دخول" | "خروج" = isEntry ? "دخول" : "خروج";
      const status: AttendanceRow["status"] = role === "دخول" && lateMinutes ? "متأخر" : role === "خروج" && earlyMinutes ? "خروج مبكر" : "ضمن الوقت";
      return { ...row, employeeName: row.employeeName || employeeNames[row.id] || "", role, status, lateMinutes, earlyMinutes, origin: row.origin || "أصلية", adjustment: row.adjustment || "" };
    });
  });
  return { rows: normalized, summary };
}

export default function Home() {
  const [sourceText, setSourceText] = useState(SAMPLE_INPUT);
  const [namesText, setNamesText] = useState(SAMPLE_NAMES);
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE);
  const initialProcess = processAttendance(parseAttendanceText(SAMPLE_INPUT).rows, DEFAULT_SCHEDULE, parseEmployeeNames(SAMPLE_NAMES));
  const [rows, setRows] = useState<AttendanceRow[]>(initialProcess.rows);
  const [cleaningSummary, setCleaningSummary] = useState<CleaningSummary>(initialProcess.summary);
  const [detection, setDetection] = useState<DetectionInfo>(() => parseAttendanceText(SAMPLE_INPUT).detection);
  const [invalidRows, setInvalidRows] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("الكل");
  const [selectedEmployee, setSelectedEmployee] = useState("الكل");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [query, setQuery] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const statuses = useMemo(() => ["الكل", ...Array.from(new Set(rows.map((row) => row.status)))], [rows]);
  const employees = useMemo(() => Array.from(new Set(rows.map((row) => row.id))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [rows]);
  const employeeNamesById = useMemo(() => rows.reduce<Record<string, string>>((names, row) => { if (row.employeeName) names[row.id] = row.employeeName; return names; }, {}), [rows]);
  const employeeRows = useMemo(() => selectedEmployee === "الكل" ? rows : rows.filter((row) => row.id === selectedEmployee), [rows, selectedEmployee]);
  const periodRows = useMemo(() => !selectedMonth ? employeeRows : employeeRows.filter((row) => row.date.slice(0, 7).replace("/", "-") === selectedMonth), [employeeRows, selectedMonth]);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return periodRows.filter((row) => (selectedStatus === "الكل" || row.status === selectedStatus) && (!normalizedQuery || `${row.id} ${row.date} ${row.time} ${row.role} ${row.status}`.toLowerCase().includes(normalizedQuery)));
  }, [periodRows, query, selectedStatus]);
  const dailySummary = useMemo(() => {
    const days = new Map<string, { employee: string; employeeName: string; date: string; entry: AttendanceRow | null; exit: AttendanceRow | null; lateMinutes: number; earlyMinutes: number }>();
    periodRows.forEach((row) => {
      const key = `${row.id}|${row.date}`;
      if (!days.has(key)) days.set(key, { employee: row.id, employeeName: row.employeeName, date: row.date, entry: null, exit: null, lateMinutes: 0, earlyMinutes: 0 });
      const day = days.get(key)!;
      if (row.role === "دخول") day.entry = row;
      if (row.role === "خروج") day.exit = row;
      day.lateMinutes += row.lateMinutes;
      day.earlyMinutes += row.earlyMinutes;
    });
    return Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [periodRows]);
  const statusCounts = useMemo(() => periodRows.reduce<Record<string, number>>((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {}), [periodRows]);
  const uniqueDays = dailySummary.length;
  const latestDate = periodRows.map((row) => row.date).sort().at(-1) || "—";
  const lateMinutes = periodRows.reduce((sum, row) => sum + row.lateMinutes, 0);
  const earlyMinutes = periodRows.reduce((sum, row) => sum + row.earlyMinutes, 0);
  const lateCount = periodRows.filter((row) => row.lateMinutes > 0).length;
  const maxStatusCount = Math.max(1, ...Object.values(statusCounts));

  const analyze = () => {
    const startValid = parseClock(schedule.startTime) !== null;
    const endValid = parseClock(schedule.endTime) !== null;
    if (!startValid || !endValid) { toast.error("اكتب وقت البداية والنهاية بتنسيق 24 ساعة مثل 09:00"); return; }
    setIsAnalyzing(true);
    window.setTimeout(() => {
      const result = parseAttendanceText(sourceText);
      const processed = processAttendance(result.rows, schedule, parseEmployeeNames(namesText));
      setRows(processed.rows);
      setCleaningSummary(processed.summary);
      setDetection(result.detection);
      setInvalidRows(result.invalid);
      setSelectedStatus("الكل"); setSelectedEmployee("الكل"); setSelectedMonth(""); setQuery(""); setIsAnalyzing(false);
      if (result.rows.length) toast.success(`تم تحليل ${formatNumber(result.rows.length)} حركة بنجاح`);
      else toast.error("لم أجد سجلات مكتملة. تأكد من وجود رقم موظف وتاريخ وتوقيت.");
    }, 380);
  };
  const handleSourceChange = (value: string) => {
    setSourceText(value);
    setDetection(parseAttendanceText(value).detection);
  };
  const readFile = (file: File) => {
    if (!file.name.match(/\.(txt|csv|tsv|log|json)$/i)) { toast.error("ارفع ملفاً نصياً أو CSV أو TSV فقط"); return; }
    const reader = new FileReader();
    reader.onload = () => { const value = String(reader.result || ""); handleSourceChange(value); toast.success(`تم تحميل ${file.name}. فهمت شكل الأعمدة، واضغط «حلّل السجلات» لإظهار النتيجة.`); };
    reader.onerror = () => toast.error("تعذّر قراءة الملف"); reader.readAsText(file, "UTF-8");
  };
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) readFile(file); event.target.value = ""; };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); const file = event.dataTransfer.files?.[0]; if (file) readFile(file); };
  const resetSample = () => { const sample = parseAttendanceText(SAMPLE_INPUT); const processed = processAttendance(sample.rows, DEFAULT_SCHEDULE, parseEmployeeNames(SAMPLE_NAMES)); setSourceText(SAMPLE_INPUT); setNamesText(SAMPLE_NAMES); setSchedule(DEFAULT_SCHEDULE); setRows(processed.rows); setCleaningSummary(processed.summary); setDetection(sample.detection); setInvalidRows([]); setSelectedStatus("الكل"); setSelectedEmployee("الكل"); setSelectedMonth(""); setQuery(""); toast.message("رجعنا للمثال الجاهز"); };
  const updateSchedule = (key: keyof Schedule, value: string) => setSchedule((current) => ({ ...current, [key]: key.includes("Grace") ? Math.max(0, Number(value) || 0) : value }));
  const exportCsv = () => {
    if (!filteredRows.length) { toast.error("لا توجد سجلات لتصديرها"); return; }
    const csvRows = [["رقم الموظف", "اسم الموظف", "التاريخ", "التوقيت", "نوع الحركة", "الحالة", "دقائق التأخير", "دقائق الخروج المبكر", "مصدر السطر", "ملاحظة المعالجة"], ...filteredRows.map((row) => [row.id, row.employeeName, row.date, row.time, row.role, row.status, String(row.lateMinutes), String(row.earlyMinutes), row.origin, row.adjustment])];
    const csv = "\ufeff" + csvRows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "attendance-insights.csv"; link.click(); URL.revokeObjectURL(url); toast.success("تم تجهيز ملف CSV");
  };
  const exportEmployeePdf = () => {
    const employeeLabel = selectedEmployee === "الكل" ? "كل الموظفين" : `الموظف ${selectedEmployee}${employeeNamesById[selectedEmployee] ? ` — ${employeeNamesById[selectedEmployee]}` : ""}`;
    const periodLabel = selectedMonth || "كل الفترة";
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) { toast.error("اسمح بفتح نافذة التقرير حتى تحفظه كـ PDF"); return; }
    const reportRows = dailySummary.map((day) => `<tr><td>${escapeHtml(day.employee)}</td><td>${escapeHtml(day.date)}</td><td>${day.entry?.time || "—"}</td><td>${day.exit?.time || "—"}</td><td>${formatNumber(day.lateMinutes)} د</td><td>${formatNumber(day.earlyMinutes)} د</td></tr>`).join("");
    reportWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير دوام ${escapeHtml(employeeLabel)}</title><style>body{font-family:Arial,sans-serif;color:#17324d;padding:36px;line-height:1.6}h1{margin:0 0 6px;font-size:26px}p{color:#526979;margin:4px 0 22px}.meta{display:flex;gap:24px;border:1px solid #d9d1c4;padding:12px;margin-bottom:22px;background:#f5f0e7}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #d9d1c4;text-align:right}th{background:#17324d;color:white}.totals{display:flex;gap:12px;margin-top:22px}.total{padding:12px 16px;border:1px solid #d9d1c4;background:#fcfaf6}@media print{body{padding:0}.no-print{display:none}}</style></head><body><h1>تقرير الدوام</h1><p>ملخص يومي حسب السجل المنظف</p><div class="meta"><span><b>الموظف:</b> ${escapeHtml(employeeLabel)}</span><span><b>الفترة:</b> ${escapeHtml(periodLabel)}</span></div><table><thead><tr><th>الموظف</th><th>التاريخ</th><th>الدخول المعتمد</th><th>الخروج المعتمد</th><th>التأخير</th><th>الخروج المبكر</th></tr></thead><tbody>${reportRows || "<tr><td colspan=6>لا توجد نتائج</td></tr>"}</tbody></table><div class="totals"><div class="total">إجمالي التأخير: <b>${formatNumber(lateMinutes)} دقيقة</b></div><div class="total">إجمالي الخروج المبكر: <b>${formatNumber(earlyMinutes)} دقيقة</b></div></div><p class="no-print">من نافذة الطباعة اختر Save as PDF / حفظ كـ PDF.</p><script>window.onload=function(){window.print();}</script></body></html>`);
    reportWindow.document.close();
  };

  return (
    <main className="app-shell" dir="rtl">
      <aside className="brand-rail"><div><div className="brand-lockup"><img src={MARK_IMAGE} alt="" className="brand-mark" /><div><p className="brand-kicker">سجلّك بوضوح</p><h1>دوام<span>.</span></h1></div></div><div className="rail-rule" /><div className="rail-motif" aria-hidden="true"><span /><span /><span /><i /></div><div className="rail-note"><span className="rail-dot" /><p>مساحة صغيرة<br />لتفهم يومك الكبير.</p></div></div><div className="rail-footer"><div className="rail-stamp">LOCAL<br /><strong>FIRST</strong></div><p>بياناتك تُعالج في متصفحك<br />ولا تُرفع إلى أي مكان.</p></div></aside>
      <section className="workspace"><header className="topbar"><div className="breadcrumb"><span>أداة التحليل</span><ArrowLeft size={15} /><strong>سجل الدوام</strong></div><div className="topbar-meta"><span className="live-dot" /> <span>جاهز للعمل</span></div></header>
        <div className="content-wrap">
          <section className="hero-section" style={{ backgroundImage: `url(${HERO_IMAGE})` }}><div className="hero-copy"><Badge className="coral-badge"><Sparkles size={14} /> نسخة تجريبية عملية</Badge><h2>خلّي سجل الدوام<br /><em>يحكي القصة كاملة.</em></h2><p>ارفع ملفك أو الصق البيانات كما هي. سنقارن أول وآخر حركة في يوم كل موظف مع أوقات دوامك، ونحسب الدقائق التي تهمك.</p></div><div className="hero-side-note"><span className="hero-number">01</span><span>إدخال<br />ثم فهم</span></div></section>
          <div className="section-intro"><div><span className="eyebrow">01 / ابدأ من هنا</span><h3>أدخل السجل كما هو</h3></div><p>يكفينا أن نجد: <strong>رقم الموظف، التاريخ، والتوقيت.</strong><br />والرمز الاختياري سيبقى محفوظاً عند التصدير.</p></div>
          <section className="input-layout"><Card className="input-card"><CardHeader className="input-card-header"><div className="section-title-row"><div className="title-icon"><ScanLine size={20} /></div><div><CardTitle>البيانات الخام</CardTitle><p>الصق النص أو ارفع ملفاً</p></div></div><button className="text-button" onClick={resetSample} title="إعادة المثال الجاهز"><RotateCcw size={15} /> مثال</button></CardHeader><CardContent><textarea value={sourceText} onChange={(event) => handleSourceChange(event.target.value)} className="data-textarea" aria-label="بيانات الدوام الخام" spellCheck={false} dir="ltr" /><div className={`drop-zone ${isDragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}><div className="drop-icon"><Upload size={18} /></div><div><strong>اسحب الملف إلى هنا</strong><span>أو</span></div><button className="upload-link" onClick={() => fileInputRef.current?.click()}>اختر ملفاً</button><input ref={fileInputRef} type="file" accept=".txt,.csv,.tsv,.log,.json" hidden onChange={handleFileChange} /></div><div className="format-hint"><Info size={14} /> يقبل TXT و CSV و TSV — تتم المعالجة محلياً داخل المتصفح</div><div className="detected-schema"><div><span className="schema-pulse" /> <strong>فهمت شكل البيانات تلقائياً</strong></div><p>{detection.message} التاريخ من العمود {detection.dateIndex === null ? "غير واضح" : detection.dateIndex + 1} والوقت من العمود {detection.timeIndex === null ? "غير واضح" : detection.timeIndex + 1}.</p></div></CardContent></Card>
            <div className="mapping-column"><Card className={`mapping-card ${isScheduleOpen ? "is-open" : ""}`}><button className="mapping-toggle" onClick={() => setIsScheduleOpen((open) => !open)}><span className="section-title-row"><span className="title-icon title-icon-muted"><Clock3 size={19} /></span><span><strong>أوقات الدوام</strong><small>متى يبدأ وينتهي اليوم؟</small></span></span><ChevronDown size={18} className="chevron" /></button>{isScheduleOpen && <div className="mapping-body"><p>التوقيت بنظام 24 ساعة. بعد انتهاء السماح بدقيقة يبدأ احتساب التأخير.</p><div className="schedule-fields"><label><span>نهاية الدوام</span><input type="text" inputMode="numeric" maxLength={5} placeholder="18:00" dir="ltr" value={schedule.endTime} onChange={(event) => updateSchedule("endTime", event.target.value)} /></label><label><span>سماح النهاية <small>دقيقة</small></span><input type="number" min="0" value={schedule.endGrace} onChange={(event) => updateSchedule("endGrace", event.target.value)} /></label><label><span>بداية الدوام</span><input type="text" inputMode="numeric" maxLength={5} placeholder="09:00" dir="ltr" value={schedule.startTime} onChange={(event) => updateSchedule("startTime", event.target.value)} /></label><label><span>سماح البداية <small>دقيقة</small></span><input type="number" min="0" value={schedule.startGrace} onChange={(event) => updateSchedule("startGrace", event.target.value)} /></label></div><div className="schedule-preview"><span><b>{schedule.startTime}</b> + {formatNumber(schedule.startGrace)} د سماح</span><span><b>{schedule.endTime}</b> − {formatNumber(schedule.endGrace)} د سماح</span></div></div>}</Card><Card className="mapping-card employee-names-card"><div className="mapping-toggle static-toggle"><span className="section-title-row"><span className="title-icon title-icon-muted"><FileText size={19} /></span><span><strong>أسماء الموظفين</strong><small>رقم الموظف ثم الاسم</small></span></span></div><div className="mapping-body"><p>الصق كل رقم بجانب اسم الموظف، سطراً لكل موظف. مثال: <code>1001    أحمد علي</code></p><textarea value={namesText} onChange={(event) => setNamesText(event.target.value)} className="mapping-textarea employee-names-textarea" dir="rtl" placeholder="1001    أحمد علي&#10;1002    سارة محمد" /><div className="mapping-preview">{Object.entries(parseEmployeeNames(namesText)).map(([id, name]) => <span key={id}><b>{id}</b>{name}</span>)}</div></div></Card><div className="privacy-slip"><Check size={14} /> خصوصيتك محفوظة — لا يوجد تسجيل دخول ولا تخزين سحابي</div></div>
          </section>
          <div className="analyze-row"><div className="analyze-caption"><span className="coral-line" /> أول حركة دخول، وآخر حركة خروج لكل موظف في كل يوم</div><Button className="analyze-button" onClick={analyze} disabled={isAnalyzing}>{isAnalyzing ? <><Loader2 size={18} className="spin" /> جارٍ التحليل...</> : <>حلّل السجلات <ArrowLeft size={18} /></>}</Button></div><Separator className="paper-separator" />
          <section className="results-section"><div className="section-intro results-intro"><div><span className="eyebrow">02 / الصورة الواضحة</span><div className="results-title-row"><h3>النتيجة في صفحة واحدة</h3><label className="employee-filter-inline"><span>الموظف</span><select value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} aria-label="اختيار الموظف"><option value="الكل">كل الموظفين</option>{employees.map((employee) => <option key={employee} value={employee}>{employee}{employeeNamesById[employee] ? ` — ${employeeNamesById[employee]}` : ""}</option>)}</select><ChevronDown size={14} /></label><label className="month-filter-inline"><span>الشهر</span><input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} aria-label="اختيار الشهر" /></label></div></div><div className="results-actions"><span className="processed-label"><span className="live-dot" /> تمت المعالجة محلياً</span><Button variant="outline" className="export-button" onClick={exportEmployeePdf}>تقرير PDF</Button><Button variant="outline" className="export-button" onClick={exportCsv}><ArrowDownToLine size={16} /> تنزيل CSV</Button></div></div>
            <div className="metric-grid"><Card className="metric-card metric-main"><CardContent><div className="metric-index">A / قراءة</div><div className="metric-label"><FileText size={16} /> إجمالي الحركات</div><strong>{formatNumber(periodRows.length)}</strong><span>{selectedEmployee === "الكل" ? "كل الموظفين" : `الموظف ${selectedEmployee}`}</span></CardContent></Card><Card className="metric-card"><CardContent><div className="metric-index">B / زمن</div><div className="metric-label"><Clock3 size={16} /> أيام مختلفة</div><strong>{formatNumber(uniqueDays)}</strong><span>حتى {latestDate}</span></CardContent></Card><Card className="metric-card metric-alert"><CardContent><div className="metric-index">C / تأخير</div><div className="metric-label"><BarChart3 size={16} /> دقائق التأخير</div><strong>{formatNumber(lateMinutes)}</strong><span>{formatNumber(lateCount)} حركة بعد السماح</span></CardContent></Card><Card className="metric-card metric-alert"><CardContent><div className="metric-index">D / خروج</div><div className="metric-label"><CircleHelp size={16} /> دقائق الخروج المبكر</div><strong>{formatNumber(earlyMinutes)}</strong><span>للموظف المختار</span></CardContent></Card></div>
            <div className="analysis-grid"><Card className="status-card"><CardHeader className="card-heading-row"><div><CardTitle>ملخص الحالات</CardTitle><p>مقارنة الحركات مع أوقات الدوام التي عرّفتها</p></div><Badge variant="outline">{formatNumber(Object.keys(statusCounts).length)} حالات</Badge></CardHeader><CardContent><div className="status-bars">{Object.entries(statusCounts).map(([status, count]) => <div className="status-bar-row" key={status}><div className="status-bar-label"><span className={`status-dot ${getStatusTone(status)}`} /><span>{status}</span><b>{formatNumber(count)}</b></div><div className="bar-track"><div className={`bar-fill ${getStatusTone(status)}`} style={{ width: `${(count / maxStatusCount) * 100}%` }} /></div></div>)}{!rows.length && <div className="empty-inline">حلّل بياناتك حتى يظهر الملخص هنا.</div>}</div><div className="status-footnote"><Info size={14} /> تم تنظيف البصمات الشاذة: نعتمد أول دخول وآخر خروج، ونضيف التوقيت المفقود تلقائياً عند الحاجة.</div></CardContent></Card><Card className="summary-visual-card"><img src={SUMMARY_IMAGE} alt="رسم ورقي تجريدي لملخص الدوام" /><div className="summary-overlay"><span className="eyebrow">ملاحظة سريعة</span><strong>{lateMinutes || earlyMinutes ? `${formatNumber(lateMinutes + earlyMinutes)} دقيقة تحتاج انتباهاً` : "لا توجد دقائق حرجة"}</strong><span>{lateMinutes || earlyMinutes ? "تفصيلها ظاهر في الجدول والتصدير." : "سجل الدوام يبدو مرتباً حتى الآن."}</span><div className="summary-adjustments"><span>دخول مضاف: {formatNumber(cleaningSummary.addedEntries)}</span><span>خروج مضاف: {formatNumber(cleaningSummary.addedExits)}</span><span>تكرارات محذوفة: {formatNumber(cleaningSummary.duplicatesRemoved)}</span></div></div></Card></div>
            <Card className="daily-card"><CardHeader className="card-heading-row"><div><CardTitle>الملخص اليومي</CardTitle><p>{selectedEmployee === "الكل" ? "مقارنة يومية لكل الموظفين" : `تفصيل يومي للموظف ${selectedEmployee}`}{selectedMonth ? ` — ${selectedMonth}` : ""}</p></div><Badge variant="outline">{formatNumber(dailySummary.length)} أيام</Badge></CardHeader><CardContent><div className="table-scroll"><table className="daily-table"><thead><tr><th>الموظف</th><th>التاريخ</th><th>الدخول المعتمد</th><th>الخروج المعتمد</th><th>التأخير</th><th>الخروج المبكر</th></tr></thead><tbody>{dailySummary.map((day) => <tr key={`${day.employee}-${day.date}`}><td><span className="id-chip">{day.employee}</span>{day.employeeName && <span className="daily-employee-name">{day.employeeName}</span>}</td><td dir="ltr">{day.date}</td><td dir="ltr" className="time-cell">{day.entry?.time || "—"}</td><td dir="ltr" className="time-cell">{day.exit?.time || "—"}</td><td>{day.lateMinutes ? `${formatNumber(day.lateMinutes)} د` : "—"}</td><td>{day.earlyMinutes ? `${formatNumber(day.earlyMinutes)} د` : "—"}</td></tr>)}{!dailySummary.length && <tr><td colSpan={6}><div className="empty-inline">لا توجد نتائج ضمن الفترة المختارة.</div></td></tr>}</tbody></table></div></CardContent></Card>
            <Card className="table-card"><CardHeader className="table-header"><div className="table-title"><div className="title-icon title-icon-muted"><Filter size={18} /></div><div><CardTitle>سجل التفاصيل</CardTitle><p>ابحث، صفِّ، ثم صدّر ما تحتاجه</p></div></div><div className="table-controls"><label className="search-field"><span>بحث</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="رقم أو تاريخ..." /></label><div className="status-filter"><select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} aria-label="تصفية حسب الحالة">{statuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={15} /></div></div></CardHeader><CardContent className="table-content"><div className="table-scroll"><table><thead><tr><th>رقم الموظف</th><th>التاريخ</th><th>التوقيت</th><th>النوع</th><th>الحالة</th><th>تأخير</th><th>خروج مبكر</th><th>المعالجة</th></tr></thead><tbody>{filteredRows.map((row, index) => <tr key={`${row.raw}-${index}`}><td><span className="id-chip">{row.id}</span>{row.employeeName && <span className="daily-employee-name">{row.employeeName}</span>}</td><td dir="ltr">{row.date}</td><td dir="ltr" className="time-cell">{row.time}</td><td>{row.role}</td><td><span className={`status-pill ${getStatusTone(row.status)}`}><span />{row.status}</span></td><td>{row.lateMinutes ? `${formatNumber(row.lateMinutes)} د` : "—"}</td><td>{row.earlyMinutes ? `${formatNumber(row.earlyMinutes)} د` : "—"}</td><td><span className={`row-adjustment ${row.origin === "مضافة تلقائياً" ? "is-added" : ""}`}>{row.adjustment || row.origin}</span></td></tr>)}{!filteredRows.length && <tr><td colSpan={8}><div className="empty-table"><img src={EMPTY_IMAGE} alt="" /><strong>لا توجد سجلات بهذه التصفية</strong><span>جرّب تغيير البحث أو اختيار «الكل».</span></div></td></tr>}</tbody></table></div><div className="table-footer"><span>عرض {formatNumber(filteredRows.length)} من {formatNumber(periodRows.length)} حركة منظفة</span>{invalidRows.length > 0 && <span className="invalid-note"><Info size={14} /> تم تجاوز {formatNumber(invalidRows.length)} سطور غير مكتملة</span>}</div></CardContent></Card>
          </section>
          <section className="guide-strip"><div className="guide-copy"><span className="eyebrow">ورقة صغيرة قبل أن تبدأ</span><h3>أول حركة للدخول،<br /><em>وآخر حركة للخروج.</em></h3><p>ضع بداية الدوام ونهايته وفترة السماح لكل منهما. إذا بدأ الدوام 09:00 والسماح 15 دقيقة، فإن 09:16 يُحسب متأخراً بدقيقة واحدة.</p></div><img src={GUIDE_IMAGE} alt="علامات ورقية تمثل أوقات الدوام" /></section>
        </div><footer className="site-footer"><span>دوام. / أداة صغيرة للقراءة اليومية</span><span>مصممة للبيانات التي تبدأ كرقم وتنتهي بفهم.</span></footer>
      </section>
    </main>
  );
}
