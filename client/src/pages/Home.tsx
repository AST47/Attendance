/* Design system: «دفتر الدوام الورقي» — editorial stationery, warm ivory paper, ink navy, coral action markers, Arabic-first clarity. */
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  ArrowLeft,
  FileDown,
  FileSpreadsheet,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  LogIn,
  LogOut,
  WalletCards,
  FileText,
  Filter,
  Info,
  Loader2,
  ScanLine,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const HERO_IMAGE = "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-paper-hero-RQ5vBrEG5ni3iJJuDgFaFh.webp";
const EMPTY_IMAGE = "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-empty-state-RykGkFEQghf3KYeEMEY2VJ.webp";
const SUMMARY_IMAGE = "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-summary-BkdjVsxDvCXms2LNtbN6aK.webp";
const GUIDE_IMAGE = "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-guide-he9pEC4RkFnaLxM3KrxH6w.webp";
const LOGO_PATH = `${import.meta.env.BASE_URL}Logo.png`;

const SAMPLE_INPUT = `1001\t2025-09-01\t08:03
1001\t2025-09-01\t18:07
1002\t2025-09-01\t09:16
1002\t2025-09-01\t17:44
1003\t2025-09-02\t08:52
1003\t2025-09-02\t18:00
1001\t2025-09-02\t09:21
1001\t2025-09-02\t17:58`;

const DEFAULT_SCHEDULE = { endTime: "18:00", endGrace: 0, startTime: "09:00", startGrace: 15, weekendDays: ["الجمعة", "السبت"], overtimeMultiplier: 2, deductionMultiplier: 1 };
const SAMPLE_NAMES = `1001\tأحمد علي\t750000
1002\tسارة محمد\t900000
1003\tخالد حسن\t800000`;

type Schedule = typeof DEFAULT_SCHEDULE & { weekendDays: string[]; overtimeMultiplier: number; deductionMultiplier: number };
type ExceptionKind = "عطلة رسمية / إذن" | "إعفاء من التأخير" | "سماح بخروج مبكر";
type AttendanceException = { id: string; date: string; employee: string; kind: ExceptionKind };
type Advance = { id: string; date: string; employee: string; value: number };
type AttendanceRow = {
  id: string;
  employeeName: string;
  date: string;
  time: string;
  code: string;
  raw: string;
  role: "دخول" | "خروج" | "حركة";
  status: "ضمن الوقت" | "متأخر" | "دخول متأخر" | "خروج مبكر" | "غياب" | "استثناء" | "حركة";
  lateMinutes: number;
  earlyMinutes: number;
  origin: "أصلية" | "مضافة تلقائياً";
  adjustment: string;
  exception?: ExceptionKind;
  excludedDay?: boolean;
  demoStatus?: "غياب";
};
type EmployeeProfile = { name: string; salary: number };
type PayrollLine = { id: string; name: string; salary: number; workdays: number; dailyHours: number; hourlyRate: number; overtimeHours: number; overtimeValue: number; deductionHours: number; deductionValue: number; advanceValue: number; net: number };
type CleaningSummary = { addedEntries: number; addedExits: number; duplicatesRemoved: number };
type ParsedRow = Pick<AttendanceRow, "id" | "employeeName" | "date" | "time" | "code" | "raw"> & { demoStatus?: "غياب" };
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
function formatAmount(value: number) { return formatNumber(Math.round(value)); }
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
function displayStatus(status: string) {
  return status === "متأخر" ? "دخول متأخر" : status;
}
function getStatusTone(status: string) {
  if (status === "ضمن الوقت") return "status-positive";
  if (status === "متأخر" || status === "دخول متأخر" || status === "خروج مبكر") return "status-warning";
  if (status === "غياب") return "status-negative";
  return "status-neutral";
}
function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] || character));
}
function parseEmployeeNames(text: string) {
  return Object.fromEntries(Object.entries(parseEmployeeProfiles(text)).map(([id, profile]) => [id, profile.name]));
}
function parseEmployeeProfiles(text: string) {
  return text.split(/\r?\n/).reduce<Record<string, EmployeeProfile>>((profiles, line) => {
    const trimmed = line.trim();
    if (!trimmed) return profiles;
    const parts = trimmed.split(/[\t,;|]/).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3 && /^\d+$/.test(parts[0]) && /^[\d,.]+$/.test(parts.at(-1) || "")) {
      profiles[parts[0]] = { name: parts.slice(1, -1).join(" "), salary: Number((parts.at(-1) || "0").replace(/[,،]/g, "")) || 0 };
      return profiles;
    }
    const match = trimmed.match(/^(\d+)\s+(.+?)\s+([\d,.]+)$/);
    if (match) profiles[match[1]] = { name: match[2].trim(), salary: Number(match[3].replace(/[,،]/g, "")) || 0 };
    else {
      const nameOnly = trimmed.match(/^(\d+)\s+(.+)$/);
      if (nameOnly) profiles[nameOnly[1]] = { name: nameOnly[2].trim(), salary: 0 };
    }
    return profiles;
  }, {});
}
function normalizeDateValue(value: string) {
  const parts = value.split(/[-\/]/).map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return value;
  const [first, second, third] = parts;
  const year = first >= 1000 ? first : third >= 1000 ? third : 0;
  const month = first >= 1000 ? second : second;
  const day = first >= 1000 ? third : first;
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return value;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function parseDateValue(value: string) {
  const [year, month, day] = normalizeDateValue(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
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
    const isDemoAbsence = parts.some((part) => part === "غياب");
    if (isDemoAbsence && dateMatch && employee) {
      rows.push({ id: employee, employeeName: "", date: normalizeDateValue(dateMatch[1]), time: "—", code: "", raw: line, demoStatus: "غياب" });
      return;
    }
    if (!dateMatch || !timeMatch || !employee) {
      if (!/^((رقم|التاريخ|date|id|employee|time|code|status)\b)/i.test(line)) invalid.push(line);
      return;
    }
    rows.push({ id: employee, employeeName: "", date: normalizeDateValue(dateMatch[1]), time: timeMatch[0], code: codeCandidate, raw: line });
  });
  return { rows: rows as ParseResult["rows"], invalid, detection };
}
function processAttendance(baseRows: ParseResult["rows"], schedule: Schedule, employeeNames: Record<string, string> = {}, exceptions: AttendanceException[] = []): { rows: AttendanceRow[]; summary: CleaningSummary } {
  const start = parseClock(schedule.startTime) ?? 540;
  const end = parseClock(schedule.endTime) ?? 1080;
  const groups = new Map<string, typeof baseRows>();
  const summary: CleaningSummary = { addedEntries: 0, addedExits: 0, duplicatesRemoved: 0 };
  baseRows.forEach((row) => {
    const key = `${row.id}|${row.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  });
  const normalizedGroups = Array.from(groups.values()).flatMap((group) => {
    const demoAbsence = group.find((row) => row.demoStatus === "غياب");
    if (demoAbsence) return [{ ...demoAbsence, employeeName: employeeNames[demoAbsence.id] || "", role: "حركة" as const, status: "غياب" as const, lateMinutes: 0, earlyMinutes: 0, origin: "أصلية" as const, adjustment: "غياب تجريبي" } as AttendanceRow];
    const ordered = [...group].sort((a, b) => clockMinutes(a.time) - clockMinutes(b.time));
    const groupException = exceptions.find((exception) => (exception.date === "كافة الأيام" || exception.date === group[0].date) && (exception.employee === "الكل" || exception.employee === group[0].id));
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
      const rawLateMinutes = isEntry ? Math.max(0, actual - (start + Math.max(0, schedule.startGrace))) : 0;
      const rawEarlyMinutes = isExit ? Math.max(0, (end - Math.max(0, schedule.endGrace)) - actual) : 0;
      const lateMinutes = groupException?.kind === "عطلة رسمية / إذن" || groupException?.kind === "إعفاء من التأخير" ? 0 : rawLateMinutes;
      const earlyMinutes = groupException?.kind === "عطلة رسمية / إذن" || groupException?.kind === "سماح بخروج مبكر" ? 0 : rawEarlyMinutes;
      const role: "دخول" | "خروج" = isEntry ? "دخول" : "خروج";
      const status: AttendanceRow["status"] = groupException?.kind === "عطلة رسمية / إذن" ? "استثناء" : role === "دخول" && lateMinutes ? "متأخر" : role === "خروج" && earlyMinutes ? "خروج مبكر" : "ضمن الوقت";
      const exceptionAdjustment = groupException ? `${groupException.kind} — ${groupException.employee === "الكل" ? "عطلة عامة" : "إذن الموظف"}` : "";
      return { ...row, employeeName: row.employeeName || employeeNames[row.id] || "", role, status, lateMinutes, earlyMinutes, origin: row.origin || "أصلية", adjustment: exceptionAdjustment || row.adjustment || "", exception: groupException?.kind, excludedDay: groupException?.kind === "عطلة رسمية / إذن" };
    });
  });
  const dateValues = baseRows.map((row) => parseDateValue(row.date)).filter((date): date is Date => Boolean(date));
  const generatedAbsences: AttendanceRow[] = [];
  if (dateValues.length) {
    const firstDate = new Date(Math.min(...dateValues.map((date) => date.getTime())));
    const lastDate = new Date(Math.max(...dateValues.map((date) => date.getTime())));
    const employeeIds = Array.from(new Set(baseRows.map((row) => row.id)));
    for (const cursor = new Date(firstDate); cursor <= lastDate; cursor.setDate(cursor.getDate() + 1)) {
      const date = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      if (schedule.weekendDays.includes(arabicWeekday(cursor))) continue;
      for (const id of employeeIds) {
        const key = `${id}|${date}`;
        if (groups.has(key)) continue;
        const hasLeave = exceptions.some((exception) => exception.kind === "عطلة رسمية / إذن" && (exception.date === "كافة الأيام" || exception.date === date) && (exception.employee === "الكل" || exception.employee === id));
        if (hasLeave) continue;
        generatedAbsences.push({ id, employeeName: employeeNames[id] || "", date, time: "—", code: "", raw: "غياب مضاف تلقائياً", role: "حركة", status: "غياب", lateMinutes: 0, earlyMinutes: 0, origin: "مضافة تلقائياً", adjustment: "غياب محسوب تلقائياً" });
      }
    }
  }
  return { rows: [...normalizedGroups, ...generatedAbsences], summary };
}

function dateKey(year: number, month: number, day: number) { return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function arabicWeekday(date: Date) { return ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][date.getDay()]; }
function calculatePayroll(rows: AttendanceRow[], profiles: Record<string, EmployeeProfile>, schedule: Schedule, exceptions: AttendanceException[], advances: Advance[], month: string): PayrollLine[] {
  if (!month) return [];
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const dailyHours = Math.max(0, ((parseClock(schedule.endTime) ?? 1080) - (parseClock(schedule.startTime) ?? 540)) / 60);
  const workDates = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, monthNumber - 1, index + 1);
    return { key: dateKey(year, monthNumber - 1, index + 1), date };
  }).filter(({ date }) => !schedule.weekendDays.includes(arabicWeekday(date)));
  const employees = Array.from(new Set(rows.map((row) => row.id))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const isExceptionFor = (date: string, id: string, kind?: ExceptionKind) => exceptions.some((exception) => exception.kind === kind && (exception.date === "كافة الأيام" || exception.date === date) && (exception.employee === "الكل" || exception.employee === id));
  const groupByDay = (items: AttendanceRow[]) => items.reduce<Record<string, AttendanceRow[]>>((groups, row) => { (groups[row.date] ||= []).push(row); return groups; }, {});
  return employees.map((id) => {
    const profile = profiles[id] || { name: rows.find((row) => row.id === id)?.employeeName || "", salary: 0 };
    const holidayDates = new Set(workDates.filter(({ key }) => isExceptionFor(key, id, "عطلة رسمية / إذن") && exceptions.some((exception) => exception.employee === "الكل" && exception.kind === "عطلة رسمية / إذن" && (exception.date === "كافة الأيام" || exception.date === key))).map(({ key }) => key));
    const workdays = Math.max(0, workDates.length - holidayDates.size);
    const hourlyRate = workdays && dailyHours ? profile.salary / (workdays * dailyHours) : 0;
    const monthRows = rows.filter((row) => row.id === id && row.date.startsWith(month));
    const grouped = groupByDay(monthRows);
    const coveredKeys = monthRows.map((row) => row.date).sort();
    const coveredDates = coveredKeys.length
      ? workDates.filter(({ key }) => key >= coveredKeys[0] && key <= coveredKeys.at(-1)!)
      : [];
    let lateMinutes = 0, earlyMinutes = 0, overtimeMinutes = 0, absentMinutes = 0;
    coveredDates.forEach(({ key }) => {
      const dayRows = grouped[key] || [];
      if (holidayDates.has(key) || isExceptionFor(key, id, "عطلة رسمية / إذن")) return;
      if (!dayRows.length || dayRows.some((row) => row.status === "غياب")) { absentMinutes += dailyHours * 60; return; }
      lateMinutes += dayRows.reduce((sum, row) => sum + row.lateMinutes, 0);
      earlyMinutes += dayRows.reduce((sum, row) => sum + row.earlyMinutes, 0);
      const exit = dayRows.find((row) => row.role === "خروج");
      if (exit && !isExceptionFor(key, id, "عطلة رسمية / إذن")) overtimeMinutes += Math.max(0, clockMinutes(exit.time) - (parseClock(schedule.endTime) ?? 1080));
    });
    const deductionHours = (lateMinutes + earlyMinutes + absentMinutes) / 60;
    const overtimeHours = overtimeMinutes / 60;
    const overtimeValue = overtimeHours * hourlyRate * schedule.overtimeMultiplier;
    const deductionValue = deductionHours * hourlyRate * schedule.deductionMultiplier;
    const advanceValue = advances.filter((advance) => advance.date.startsWith(month) && (advance.employee === "الكل" || advance.employee === id)).reduce((sum, advance) => sum + Math.max(0, advance.value || 0), 0);
    return { id, name: profile.name, salary: profile.salary, workdays, dailyHours, hourlyRate, overtimeHours, overtimeValue, deductionHours, deductionValue, advanceValue, net: profile.salary + overtimeValue - deductionValue - advanceValue };
  });
}

export default function Home() {
  const [sourceText, setSourceText] = useState(SAMPLE_INPUT);
  const [namesText, setNamesText] = useState(SAMPLE_NAMES);
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE);
  const initialProcess = processAttendance(parseAttendanceText(SAMPLE_INPUT).rows, DEFAULT_SCHEDULE, parseEmployeeNames(SAMPLE_NAMES), []);
  const [rows, setRows] = useState<AttendanceRow[]>(initialProcess.rows);
  const [cleaningSummary, setCleaningSummary] = useState<CleaningSummary>(initialProcess.summary);
  const [detection, setDetection] = useState<DetectionInfo>(() => parseAttendanceText(SAMPLE_INPUT).detection);
  const [invalidRows, setInvalidRows] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("الكل");
  const [selectedEmployee, setSelectedEmployee] = useState("الكل");
  const [selectedDate, setSelectedDate] = useState("");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [exceptions, setExceptions] = useState<AttendanceException[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const namesFileInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeExportMenu = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) setIsExportOpen(false);
    };
    document.addEventListener("mousedown", closeExportMenu);
    return () => document.removeEventListener("mousedown", closeExportMenu);
  }, []);

  const statuses = useMemo(() => ["الكل", "ضمن الوقت", "دخول متأخر", "خروج مبكر", "غياب"], []);
  const employees = useMemo(() => Array.from(new Set(rows.map((row) => row.id))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [rows]);
  const employeeProfiles = useMemo(() => parseEmployeeProfiles(namesText), [namesText]);
  const availableDates = useMemo(() => Array.from(new Set(rows.map((row) => row.date))).sort(), [rows]);
  const employeeNamesById = useMemo(() => rows.reduce<Record<string, string>>((names, row) => { if (row.employeeName) names[row.id] = row.employeeName; return names; }, {}), [rows]);
  const employeeRows = useMemo(() => selectedEmployee === "الكل" ? rows : rows.filter((row) => row.id === selectedEmployee), [rows, selectedEmployee]);
  const periodRows = useMemo(() => !selectedDate ? employeeRows : employeeRows.filter((row) => row.date === selectedDate), [employeeRows, selectedDate]);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return periodRows.filter((row) => (selectedStatus === "الكل" || displayStatus(row.status) === selectedStatus) && (!normalizedQuery || `${row.id} ${row.date} ${row.time} ${row.role} ${displayStatus(row.status)}`.toLowerCase().includes(normalizedQuery)));
  }, [periodRows, query, selectedStatus]);
  const dailySummary = useMemo(() => {
    const days = new Map<string, { employee: string; employeeName: string; date: string; entry: AttendanceRow | null; exit: AttendanceRow | null; lateMinutes: number; earlyMinutes: number; excludedDay?: boolean }>();
    periodRows.forEach((row) => {
      const key = `${row.id}|${row.date}`;
      if (!days.has(key)) days.set(key, { employee: row.id, employeeName: row.employeeName, date: row.date, entry: null, exit: null, lateMinutes: 0, earlyMinutes: 0, excludedDay: row.excludedDay });
      const day = days.get(key)!;
      if (row.role === "دخول") day.entry = row;
      if (row.role === "خروج") day.exit = row;
      day.lateMinutes += row.lateMinutes;
      day.earlyMinutes += row.earlyMinutes;
    });
    return Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [periodRows]);
  const statusCounts = useMemo(() => { const counts: Record<string, number> = { "ضمن الوقت": 0, "دخول متأخر": 0, "خروج مبكر": 0, "غياب": 0 }; periodRows.forEach((row) => { const status = displayStatus(row.status); if (status in counts) counts[status] += 1; }); return counts; }, [periodRows]);
  const uniqueDays = dailySummary.filter((day) => !day.excludedDay).length;
  const latestDate = periodRows.map((row) => row.date).sort().at(-1) || "—";
  const lateMinutes = periodRows.reduce((sum, row) => sum + row.lateMinutes, 0);
  const earlyMinutes = periodRows.reduce((sum, row) => sum + row.earlyMinutes, 0);
  const lateCount = periodRows.filter((row) => row.role === "دخول" && row.lateMinutes > 0).length;
  const earlyCount = periodRows.filter((row) => row.role === "خروج" && row.earlyMinutes > 0).length;
  const maxStatusCount = Math.max(1, ...Object.values(statusCounts));
  const payrollMonth = selectedDate ? selectedDate.slice(0, 7) : (rows.map((row) => row.date).sort().at(-1)?.slice(0, 7) || "");
  const payrollCoverageDates = rows.map((row) => row.date).filter((date) => date.startsWith(payrollMonth)).sort();
  const payrollCoverageNote = payrollCoverageDates.length
    ? payrollCoverageDates[0] === payrollCoverageDates.at(-1)
      ? `البيانات المدخلة بتاريخ ${payrollCoverageDates[0].slice(8)}`
      : `البيانات المدخلة من تاريخ ${payrollCoverageDates[0].slice(8)} إلى تاريخ ${payrollCoverageDates.at(-1)!.slice(8)}`
    : "لا توجد تواريخ مدخلة";
  const payrollSummary = useMemo(() => calculatePayroll(rows, employeeProfiles, schedule, exceptions, advances, payrollMonth), [rows, employeeProfiles, schedule, exceptions, advances, payrollMonth]);
  const selectedPayroll = useMemo(() => selectedEmployee === "الكل" ? payrollSummary : payrollSummary.filter((line) => line.id === selectedEmployee), [payrollSummary, selectedEmployee]);
  const payrollTotals = useMemo(() => selectedPayroll.reduce((totals, line) => ({ overtimeValue: totals.overtimeValue + line.overtimeValue, deductionValue: totals.deductionValue + line.deductionValue, advanceValue: totals.advanceValue + line.advanceValue, net: totals.net + line.net }), { overtimeValue: 0, deductionValue: 0, advanceValue: 0, net: 0 }), [selectedPayroll]);

  const analyze = () => {
    const startValid = parseClock(schedule.startTime) !== null;
    const endValid = parseClock(schedule.endTime) !== null;
    if (!startValid || !endValid) { toast.error("اكتب وقت البداية والنهاية بتنسيق 24 ساعة مثل 09:00"); return; }
    setIsAnalyzing(true);
    window.setTimeout(() => {
      const result = parseAttendanceText(sourceText);
      const processed = processAttendance(result.rows, schedule, parseEmployeeNames(namesText), exceptions);
      setRows(processed.rows);
      setCleaningSummary(processed.summary);
      setDetection(result.detection);
      setInvalidRows(result.invalid);
      setSelectedStatus("الكل"); setSelectedEmployee("الكل"); setSelectedDate(""); setQuery(""); setIsAnalyzing(false);
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
  const readNamesFile = (file: File) => {
    if (!file.name.match(/\.(txt|csv|tsv|log)$/i)) { toast.error("ارفع ملف أسماء بصيغة TXT أو CSV أو TSV"); return; }
    const reader = new FileReader();
    reader.onload = () => { setNamesText(String(reader.result || "")); toast.success(`تم تحميل أسماء الموظفين من ${file.name}`); };
    reader.onerror = () => toast.error("تعذّر قراءة ملف الأسماء");
    reader.readAsText(file, "UTF-8");
  };
  const handleNamesFileChange = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) readNamesFile(file); event.target.value = ""; };
  const handleNamesDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) readNamesFile(file); };
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) readFile(file); event.target.value = ""; };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); const file = event.dataTransfer.files?.[0]; if (file) readFile(file); };
  const resetSample = () => { const sample = parseAttendanceText(SAMPLE_INPUT); const processed = processAttendance(sample.rows, DEFAULT_SCHEDULE, parseEmployeeNames(SAMPLE_NAMES), []); setSourceText(SAMPLE_INPUT); setNamesText(SAMPLE_NAMES); setExceptions([]); setAdvances([]); setSchedule(DEFAULT_SCHEDULE); setRows(processed.rows); setCleaningSummary(processed.summary); setDetection(sample.detection); setInvalidRows([]); setSelectedStatus("الكل"); setSelectedEmployee("الكل"); setSelectedDate(""); setQuery(""); toast.message("رجعنا للمثال الجاهز"); };
  const updateSchedule = (key: keyof Schedule, value: string | string[]) => setSchedule((current) => ({ ...current, [key]: key === "weekendDays" ? value : key.includes("Grace") || key.includes("Multiplier") ? Math.max(0, Number(value) || 0) : value } as Schedule));
  const addException = () => {
    if (!availableDates.length || !employees.length) { toast.error("حلّل البيانات أولاً حتى تظهر التواريخ والموظفون"); return; }
    setExceptions((current) => [...current, { id: `${Date.now()}-${current.length}`, date: availableDates[0], employee: "الكل", kind: "عطلة رسمية / إذن" }]);
  };
  const updateException = (id: string, key: keyof Omit<AttendanceException, "id">, value: string) => setExceptions((current) => current.map((exception) => exception.id === id ? { ...exception, [key]: value } as AttendanceException : exception));
  const removeException = (id: string) => setExceptions((current) => current.filter((exception) => exception.id !== id));
  const addAdvance = () => {
    if (!availableDates.length || !employees.length) { toast.error("حلّل البيانات أولاً حتى تظهر التواريخ والموظفون"); return; }
    setAdvances((current) => [...current, { id: `${Date.now()}-${current.length}`, date: availableDates[0], employee: employees[0], value: 0 }]);
  };
  const updateAdvance = (id: string, key: keyof Omit<Advance, "id">, value: string) => setAdvances((current) => current.map((advance) => advance.id === id ? { ...advance, [key]: key === "value" ? Math.max(0, Number(value) || 0) : value } : advance));
  const removeAdvance = (id: string) => setAdvances((current) => current.filter((advance) => advance.id !== id));

  const exportCsv = () => {
    if (!filteredRows.length) { toast.error("لا توجد سجلات لتصديرها"); return; }
    const csvRows = [["رقم الموظف", "اسم الموظف", "التاريخ", "التوقيت", "نوع الحركة", "الحالة", "دقائق التأخير", "دقائق الخروج المبكر"], ...filteredRows.map((row) => [row.id, row.employeeName, row.date, row.time, row.role, row.status, String(row.lateMinutes), String(row.earlyMinutes)])];
    const csv = "\ufeff" + csvRows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "attendance-insights.csv"; link.click(); URL.revokeObjectURL(url); toast.success("تم تجهيز ملف CSV");
  };
  const exportEmployeePdf = () => {
    const employeeLabel = selectedEmployee === "الكل" ? "كل الموظفين" : `الموظف ${selectedEmployee}${employeeNamesById[selectedEmployee] ? ` — ${employeeNamesById[selectedEmployee]}` : ""}`;
    const periodLabel = selectedDate || "كل الفترة";
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) { toast.error("اسمح بفتح نافذة التقرير حتى تحفظه كـ PDF"); return; }
    const logoUrl = new URL(LOGO_PATH, window.location.origin).href;
    const reportRows = dailySummary.map((day) => `<tr><td>${escapeHtml(day.employee)}</td><td>${escapeHtml(day.date)}</td><td>${day.entry?.time || "—"}</td><td>${day.exit?.time || "—"}</td><td>${formatNumber(day.lateMinutes)} د</td><td>${formatNumber(day.earlyMinutes)} د</td></tr>`).join("");
    const payrollRows = selectedPayroll.map((line) => `<tr><td>${escapeHtml(line.id)}</td><td>${escapeHtml(line.name || "—")}</td><td>${formatAmount(line.salary)}</td><td>${line.workdays}</td><td>${line.dailyHours.toFixed(2)}</td><td>${line.overtimeHours.toFixed(2)}</td><td>${formatAmount(line.overtimeValue)}</td><td>${line.deductionHours.toFixed(2)}</td><td>${formatAmount(line.deductionValue)}</td><td>${formatAmount(line.advanceValue)}</td><td>${formatAmount(line.net)}</td></tr>`).join("");
    const attentionText = lateMinutes || earlyMinutes ? `${formatNumber(lateMinutes + earlyMinutes)} دقيقة تحتاج انتباهاً` : "لا توجد دقائق حرجة";
    const reportHtml = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير دوام ${escapeHtml(employeeLabel)}</title><style>
      :root{--ink:#17324d;--ink-soft:#526979;--coral:#df6b52;--mustard:#c59a35;--moss:#71866a;--line:#d9d1c4;--paper:#f5f0e7;--white:#fcfaf6}
      *{box-sizing:border-box}body{font-family:Arial,"Tahoma",sans-serif;color:var(--ink);background:var(--paper);padding:34px;line-height:1.55}h1{margin:0 0 5px;font-size:28px;font-weight:700}h2{margin:28px 0 10px;font-size:18px}p{color:var(--ink-soft);margin:4px 0 18px}.meta{display:flex;justify-content:space-between;gap:20px;border:1px solid var(--line);padding:12px 15px;margin-bottom:22px;background:var(--white)}
      .report-summary{margin:0 0 25px}.summary-top,.summary-bottom{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.summary-card{min-height:108px;padding:15px 18px;background:var(--white);border:1px solid var(--line);text-align:center;display:flex;flex-direction:column;justify-content:center}.summary-card .index{font-size:10px;color:var(--ink-soft);margin-bottom:7px}.summary-card strong{font-size:27px;line-height:1.1}.summary-card small{color:var(--ink-soft);font-size:10px;margin-top:6px}.summary-card.read{border-left:3px solid var(--coral);border-radius:0 5px 5px 0}.summary-card.time{border-right:3px solid var(--ink);border-radius:5px 0 0 5px}.summary-payable{margin:12px 0;min-height:108px;padding:15px 20px;border:1px solid var(--line);border-bottom:3px solid var(--coral);background:var(--white);text-align:center}.summary-payable .label{color:var(--coral);font-size:12px;font-weight:700}.summary-payable strong{display:block;font-size:29px;margin-top:9px}.summary-payable small{display:block;color:var(--ink-soft);font-size:10px;margin-top:5px}.summary-card.late{border-top:3px solid var(--mustard)}.summary-card.early{border-top:3px solid var(--coral)}.summary-note{margin-top:12px;padding:15px 20px;border:1px solid var(--line);background:var(--ink);color:white;text-align:center}.summary-note .label{color:#f3c2b5;font-size:10px}.summary-note strong{display:block;font-size:18px;margin-top:6px}.summary-note small{display:block;color:rgba(255,255,255,.72);font-size:10px;margin-top:5px}
      .report-brand{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:18px;padding:12px 15px;border:1px solid var(--line);background:var(--white)}.report-brand img{width:54px;height:54px;object-fit:contain}.report-brand strong{display:block;font-size:18px}.report-brand a{color:var(--coral);font-size:10px;text-decoration:none;direction:ltr}
      table{width:100%;border-collapse:collapse;background:var(--white);font-size:10px;page-break-inside:auto}thead{display:table-header-group}tr{page-break-inside:avoid;page-break-after:auto}th,td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:right}th{background:var(--ink);color:white;font-weight:700}tbody tr:nth-child(even){background:#faf7f1}.totals{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.total{flex:1;min-width:160px;padding:11px 14px;border:1px solid var(--line);background:var(--white);font-size:11px}.total b{font-size:15px}.no-print{margin-top:24px;font-size:10px}
      @media print{body{padding:0;background:white}.no-print{display:none}.report-summary{page-break-inside:avoid}h2{page-break-after:avoid}}
    </style></head><body><div class="report-brand"><img src="${logoUrl}" alt="شعار دوام" /><div><strong>دوام.</strong><a href="https://ahmadsalehtuffaha.com/">ahmadsalehtuffaha.com</a></div></div><h1>تقرير الدوام</h1><p>ملخص يومي حسب السجل المنظف — ${escapeHtml(payrollCoverageNote)}</p><div class="meta"><span><b>الموظف:</b> ${escapeHtml(employeeLabel)}</span><span><b>الفترة:</b> ${escapeHtml(periodLabel)}</span></div>
      <section class="report-summary"><div class="summary-top"><div class="summary-card read"><span class="index">قراءة</span><strong>${formatNumber(periodRows.length)}</strong><small>إجمالي الحركات</small></div><div class="summary-card time"><span class="index">زمن</span><strong>${formatNumber(uniqueDays)}</strong><small>أيام مختلفة</small></div></div><div class="summary-payable"><span class="label">المبلغ المستحق للدفع</span><strong>${formatAmount(payrollTotals.net)}</strong><small>بعد الإضافي والخصومات</small></div><div class="summary-bottom"><div class="summary-card late"><span class="index">تأخير</span><strong>${formatNumber(lateMinutes)}</strong><small>دقائق التأخير</small></div><div class="summary-card early"><span class="index">خروج مبكر</span><strong>${formatNumber(earlyMinutes)}</strong><small>دقائق الخروج المبكر</small></div></div><div class="summary-note"><span class="label">ملاحظة سريعة</span><strong>${attentionText}</strong><small>تفصيلها ظاهر في الجداول والتصدير.</small></div></section>
      <h2>الملخص اليومي</h2><table><thead><tr><th>الموظف</th><th>التاريخ</th><th>الدخول المعتمد</th><th>الخروج المعتمد</th><th>دخول متأخر</th><th>الخروج المبكر</th></tr></thead><tbody>${reportRows || "<tr><td colspan=6>لا توجد نتائج</td></tr>"}</tbody></table><h2>ملخص الرواتب</h2><table><thead><tr><th>الرقم</th><th>الاسم</th><th>الراتب</th><th>أيام الدوام</th><th>ساعات اليوم</th><th>إضافي</th><th>قيمة الإضافي</th><th>ساعات الخصم</th><th>قيمة الخصم</th><th>السلف</th><th>الصافي</th></tr></thead><tbody>${payrollRows || "<tr><td colspan=11>لا توجد بيانات رواتب</td></tr>"}</tbody></table><div class="totals"><div class="total">إجمالي الإضافي: <b>${formatAmount(payrollTotals.overtimeValue)}</b></div><div class="total">إجمالي الخصومات: <b>${formatAmount(payrollTotals.deductionValue)}</b></div><div class="total">إجمالي السلف: <b>${formatAmount(payrollTotals.advanceValue)}</b></div><div class="total">الصافي: <b>${formatAmount(payrollTotals.net)}</b></div><div class="total">إجمالي التأخير: <b>${formatNumber(lateMinutes)} دقيقة</b></div><div class="total">إجمالي الخروج المبكر: <b>${formatNumber(earlyMinutes)} دقيقة</b></div></div><p class="no-print">من نافذة الطباعة اختر Save as PDF / حفظ كـ PDF.</p><script>window.onload=function(){window.print();}</script></body></html>`;
    reportWindow.document.write(reportHtml);
    reportWindow.document.close();
  };

  return (
    <main className="app-shell" dir="rtl">
      <section className="workspace"><header className="site-header"><div className="site-header-title">سجل الدوام <span>بوضوح</span> تام</div><a className="site-header-logo" href="#top" aria-label="العودة إلى بداية الصفحة"><img src={LOGO_PATH} alt="شعار دوام" /></a><div className="site-header-note"><div className="rail-stamp">LOCAL<br /><strong>FIRST</strong></div><p>بياناتك تُعالج في متصفحك<br />ولا تُرفع إلى أي مكان.</p></div></header>
        <div className="content-wrap">
          <section className="hero-section" style={{ backgroundImage: `url(${HERO_IMAGE})` }}><div className="hero-ready"><span className="live-dot" /> <span>جاهز للعمل</span></div><div className="hero-copy"><Badge className="coral-badge"><Sparkles size={14} /> نسخة تجريبية عملية</Badge><h2>خلّي سجل الدوام<br /><em>يحكي القصة كاملة.</em></h2><p>ارفع ملفك أو الصق البيانات كما هي. سنقارن أول وآخر حركة في يوم كل موظف مع أوقات دوامك، ونحسب الدقائق التي تهمك.</p></div><div className="hero-side-note"><span className="hero-number">أولاً</span><span>إدخال<br />ثم فهم</span></div></section>
          <div className="section-intro"><div><span className="eyebrow">01 / ابدأ من هنا</span><h3>أدخل السجل كما هو</h3></div><div className="privacy-slip"><Check size={14} /> خصوصيتك محفوظة — لا يوجد تسجيل دخول ولا تخزين سحابي</div></div>
          <section className="input-layout"><Card className="input-card"><CardHeader className="input-card-header"><div className="section-title-row"><div className="title-icon"><ScanLine size={20} /></div><div><CardTitle>البيانات الخام</CardTitle><p>الصق النص أو ارفع ملفاً</p></div></div></CardHeader><CardContent><p className="input-helper">الصق السجل كما هو، سطراً لكل حركة. (يكفينا أن نجد: رقم الموظف، التاريخ، والتوقيت.)</p><textarea value={sourceText} onChange={(event) => handleSourceChange(event.target.value)} className="data-textarea" aria-label="بيانات الدوام الخام" spellCheck={false} dir="ltr" /><div className={`drop-zone ${isDragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}><div className="drop-icon"><Upload size={18} /></div><div><strong>اسحب الملف إلى هنا</strong><span>أو</span></div><button className="upload-link" onClick={() => fileInputRef.current?.click()}>اختر ملفاً</button><input ref={fileInputRef} type="file" accept=".txt,.csv,.tsv,.log,.json" hidden onChange={handleFileChange} /></div><div className="format-hint"><Info size={14} /> يقبل TXT و CSV و TSV — تتم المعالجة محلياً داخل المتصفح</div><div className="detected-schema"><div><span className="schema-pulse" /> <strong>فهمت شكل البيانات تلقائياً</strong></div><p>قرأت {formatNumber(rows.length)} سطر، فيهم {formatNumber(new Set(rows.map((row) => row.date)).size)} يوم دوام، وعدد موظفين {formatNumber(new Set(rows.map((row) => row.id)).size)}.</p></div></CardContent></Card><Card className="exceptions-card"><CardHeader className="input-card-header"><div className="section-title-row"><div className="title-icon title-icon-muted"><CalendarDays size={20} /></div><div><CardTitle>الاستثناءات</CardTitle><p>أضف عطلة أو إذناً قبل إعادة التحليل</p></div></div></CardHeader><CardContent className="exceptions-content"><p>القوائم مأخوذة من التواريخ والموظفين الموجودين في البيانات بعد التحليل. اختر «كافة الأيام» لتطبيق الاستثناء على كل أيام الموظف.</p>{exceptions.map((exception) => <div className="exception-row" key={exception.id}><label><span>التاريخ</span><select value={exception.date} onChange={(event) => updateException(exception.id, "date", event.target.value)}><option value="كافة الأيام">كافة الأيام</option>{availableDates.map((date) => <option key={date} value={date}>{date}</option>)}</select></label><label><span>الموظف</span><select value={exception.employee} onChange={(event) => updateException(exception.id, "employee", event.target.value)}><option value="الكل">الكل — جميع الموظفين</option>{employees.map((employee) => <option key={employee} value={employee}>{employee}{employeeNamesById[employee] ? ` — ${employeeNamesById[employee]}` : ""}</option>)}</select></label><label><span>نوع الاستثناء</span><select value={exception.kind} onChange={(event) => updateException(exception.id, "kind", event.target.value)}><option value="عطلة رسمية / إذن">عطلة رسمية / إذن</option><option value="إعفاء من التأخير">إعفاء من التأخير</option><option value="سماح بخروج مبكر">سماح بخروج مبكر</option></select></label><button className="exception-remove" onClick={() => removeException(exception.id)} aria-label="حذف الاستثناء" title="حذف الاستثناء"><X size={15} /></button></div>)}{exceptions.length > 0 && <div className="exceptions-hint"><Info size={14} /> اضغط «حلّل السجلات» مرة ثانية حتى تُطبَّق الاستثناءات.</div>}{!exceptions.length && <div className="exceptions-empty">لا توجد استثناءات مضافة حالياً.</div>}<Button variant="outline" className="exception-add-button" onClick={addException}>إضافة استثناء +</Button></CardContent></Card><Card className="advances-card"><CardHeader className="input-card-header"><div className="section-title-row"><div className="title-icon title-icon-muted"><WalletCards size={20} /></div><div><CardTitle>السلف</CardTitle><p>أضف سلفة لتُخصم من راتب الشهر</p></div></div></CardHeader><CardContent className="advances-content"><p>اختر التاريخ والموظف واكتب قيمة السلفة يدوياً.</p>{advances.map((advance) => <div className="advance-row" key={advance.id}><label><span>التاريخ</span><select value={advance.date} onChange={(event) => updateAdvance(advance.id, "date", event.target.value)}>{availableDates.map((date) => <option key={date} value={date}>{date}</option>)}</select></label><label><span>الموظف</span><select value={advance.employee} onChange={(event) => updateAdvance(advance.id, "employee", event.target.value)}><option value="الكل">الكل — توزيع على الجميع</option>{employees.map((employee) => <option key={employee} value={employee}>{employee}{employeeNamesById[employee] ? ` — ${employeeNamesById[employee]}` : ""}</option>)}</select></label><label><span>قيمة السلفة</span><input type="number" min="0" step="1" value={advance.value} onChange={(event) => updateAdvance(advance.id, "value", event.target.value)} /></label><button className="exception-remove" onClick={() => removeAdvance(advance.id)} aria-label="حذف السلفة" title="حذف السلفة"><X size={15} /></button></div>)}{advances.length > 0 && <div className="exceptions-hint"><Info size={14} /> تُخصم السلفة عند احتساب راتب الشهر المحدد.</div>}{!advances.length && <div className="exceptions-empty">لا توجد سلف مضافة حالياً.</div>}<Button variant="outline" className="exception-add-button" onClick={addAdvance}>إضافة سلفة +</Button></CardContent></Card><Button className="analyze-button exceptions-analyze-button" onClick={analyze} disabled={isAnalyzing}>{isAnalyzing ? <><Loader2 size={18} className="spin" /> جارٍ التحليل...</> : <>حلّل السجلات <ArrowLeft size={18} /></>}</Button>
            <div className="mapping-column"><Card className="mapping-card"><div className="mapping-toggle static-toggle"><span className="section-title-row"><span className="title-icon title-icon-muted"><Clock3 size={19} /></span><span><strong>معلومات الدوام</strong><small>متى يبدأ وينتهي اليوم، والعطل ومعاملة الفروقات</small></span></span></div><div className="mapping-body"><p>التوقيت بنظام 24 ساعة. بعد انتهاء السماح بدقيقة يبدأ احتساب التأخير.</p><div className="schedule-fields"><label><span>بداية الدوام</span><input type="text" inputMode="numeric" maxLength={5} placeholder="09:00" dir="ltr" value={schedule.startTime} onChange={(event) => updateSchedule("startTime", event.target.value)} /></label><label><span>سماح البداية <small>دقيقة</small></span><input type="number" min="0" value={schedule.startGrace} onChange={(event) => updateSchedule("startGrace", event.target.value)} /></label><label><span>نهاية الدوام</span><input type="text" inputMode="numeric" maxLength={5} placeholder="18:00" dir="ltr" value={schedule.endTime} onChange={(event) => updateSchedule("endTime", event.target.value)} /></label><label><span>سماح النهاية <small>دقيقة</small></span><input type="number" min="0" value={schedule.endGrace} onChange={(event) => updateSchedule("endGrace", event.target.value)} /></label></div><div className="schedule-preview"><span><b>{schedule.startTime}</b> + {formatNumber(schedule.startGrace)} د سماح</span><span><b>{schedule.endTime}</b> − {formatNumber(schedule.endGrace)} د سماح</span><span><b>{formatNumber(Math.max(0, ((parseClock(schedule.endTime) ?? 1080) - (parseClock(schedule.startTime) ?? 540)) / 60))}</b> ساعة دوام يومي</span></div><div className="payroll-settings"><label><span>أيام العطلة الأسبوعية <small>اختيار متعدد</small></span><div className="weekday-checklist">{["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((day) => <label key={day}><input type="checkbox" checked={schedule.weekendDays.includes(day)} onChange={(event) => updateSchedule("weekendDays", event.target.checked ? [...schedule.weekendDays, day] : schedule.weekendDays.filter((currentDay) => currentDay !== day))} /><span>{day}</span></label>)}</div></label><div className="payroll-rate-fields"><label><span>نسبة الإضافي</span><input type="number" min="0" step="0.1" value={schedule.overtimeMultiplier} onChange={(event) => updateSchedule("overtimeMultiplier", event.target.value)} /></label><label><span>نسبة الخصم</span><input type="number" min="0" step="0.1" value={schedule.deductionMultiplier} onChange={(event) => updateSchedule("deductionMultiplier", event.target.value)} /></label></div></div></div></Card><Card className="mapping-card employee-names-card"><div className="mapping-toggle static-toggle"><span className="section-title-row"><span className="title-icon title-icon-muted"><FileText size={19} /></span><span><strong>أسماء الموظفين</strong><small>رقم الموظف ثم الاسم والراتب</small></span></span></div><div className="mapping-body names-card-body"><p>الصق رقم الموظف واسمه وراتبه، سطراً لكل موظف.</p><textarea value={namesText} onChange={(event) => setNamesText(event.target.value)} className="mapping-textarea employee-names-textarea" dir="rtl" placeholder="1001    أحمد علي&#10;1002    سارة محمد" /><div className="drop-zone names-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={handleNamesDrop}><div className="drop-icon"><Upload size={18} /></div><div><strong>اسحب ملف الأسماء إلى هنا</strong><span>أو</span></div><button className="upload-link" onClick={() => namesFileInputRef.current?.click()}>اختر ملفاً</button><input ref={namesFileInputRef} type="file" accept=".txt,.csv,.tsv,.log" hidden onChange={handleNamesFileChange} /></div><div className="format-hint"><Info size={14} /> يقبل TXT و CSV و TSV — تتم المعالجة محلياً داخل المتصفح</div><div className="names-detection"><div><span className="schema-pulse" /> <strong>الأسماء التي فهمها النظام</strong></div>{Object.entries(employeeProfiles).map(([id, profile]) => <div className="name-detection-row" key={id}><b>{id}</b><span>{profile.name}</span><span>{profile.salary ? `${formatNumber(profile.salary)}` : "أجر غير محدد"}</span></div>)}</div></div></Card></div>
          </section>
          <Separator className="paper-separator" />
          <section className="results-section"><div className="section-intro results-intro"><div><span className="eyebrow">02 / الصورة الواضحة</span><div className="results-title-row"><h3>النتيجة في صفحة واحدة</h3></div></div><div className="results-controls"><label className="employee-filter-inline"><span>الموظف</span><select value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} aria-label="اختيار الموظف"><option value="الكل">كل الموظفين</option>{employees.map((employee) => <option key={employee} value={employee}>{employee}{employeeNamesById[employee] ? ` — ${employeeNamesById[employee]}` : ""}</option>)}</select><ChevronDown size={14} /></label><label className="date-filter-inline"><span>التاريخ</span><select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} aria-label="اختيار التاريخ"><option value="">كل الأيام</option>{availableDates.map((date) => <option key={date} value={date}>{date}</option>)}</select><ChevronDown size={14} /></label><div className="export-menu" ref={exportMenuRef}><button className="export-menu-trigger" onClick={() => setIsExportOpen((open) => !open)} aria-expanded={isExportOpen} aria-label="خيارات التصدير"><Download size={16} /><ChevronDown size={13} /></button>{isExportOpen && <div className="export-menu-list"><button onClick={() => { setIsExportOpen(false); exportEmployeePdf(); }}><FileDown size={16} /> تقرير PDF</button><button onClick={() => { setIsExportOpen(false); exportCsv(); }}><FileSpreadsheet size={16} /> تنزيل CSV</button></div>}</div></div></div><div className="dashboard-grid"><Card className="metric-card metric-main"><CardContent><div className="metric-heading"><BarChart3 size={17} /><span>قراءة</span></div><strong className="metric-value">{formatNumber(periodRows.length)}</strong><span className="metric-note">إجمالي حركات ({selectedEmployee === "الكل" ? "كل الموظفين" : `الموظف ${selectedEmployee}`})</span></CardContent></Card><Card className="metric-card"><CardContent><div className="metric-heading"><Clock3 size={17} /><span>زمن</span></div><strong className="metric-value">{formatNumber(uniqueDays)}</strong><span className="metric-note">أيام مختلفة حتى تاريخ {latestDate}</span></CardContent></Card><Card className="minutes-merge-card"><img src={SUMMARY_IMAGE} alt="رسم ورقي تجريدي لملخص الدوام" /><div className="minutes-merge-tint" /><Card className="payable-card"><CardContent><div className="metric-heading"><WalletCards size={17} /><span>المبلغ المستحق</span></div><strong className="metric-value">{formatAmount(payrollTotals.net)}</strong><span className="metric-note">بعد الإضافي والخصومات</span></CardContent></Card><div className="minutes-merge-metrics"><Card className="metric-card metric-alert"><CardContent><div className="metric-heading"><LogIn size={17} /><span>دخول متأخر</span></div><strong className="metric-value">{formatNumber(lateMinutes)} <small className="metric-unit">د</small></strong><span className="metric-note">{formatNumber(lateCount)} حركات بعد السماح</span></CardContent></Card><Card className="metric-card metric-alert"><CardContent><div className="metric-heading"><LogOut size={17} /><span>خروج مبكر</span></div><strong className="metric-value">{formatNumber(earlyMinutes)} <small className="metric-unit">د</small></strong><span className="metric-note">{formatNumber(earlyCount)} حركات بعد السماح</span></CardContent></Card></div><div className="summary-overlay"><span className="eyebrow">مجموع الدقائق</span><strong>{`${formatNumber(lateMinutes + earlyMinutes)} دقيقة ستضاف إلى الخصم`}</strong><span>{lateMinutes || earlyMinutes ? "تفصيلها ظاهر في الجدول والتصدير" : "سجل الدوام يبدو مرتباً حتى الآن."}</span><div className="summary-adjustments"><span>دخول مضاف: {formatNumber(cleaningSummary.addedEntries)}</span><span>خروج مضاف: {formatNumber(cleaningSummary.addedExits)}</span><span>تكرارات محذوفة: {formatNumber(cleaningSummary.duplicatesRemoved)}</span></div></div></Card><Card className="status-card"><CardHeader className="card-heading-row"><div><CardTitle>ملخص الحالات</CardTitle><p>مقارنة الحركات مع أوقات الدوام التي عرّفتها</p></div></CardHeader><CardContent><div className="status-bars">{Object.entries(statusCounts).map(([status, count]) => <div className="status-bar-row" key={status}><div className="status-bar-label"><span className={`status-dot ${getStatusTone(status)}`} /><span>{status}</span><b>{formatNumber(count)}</b></div><div className="bar-track"><div className={`bar-fill ${getStatusTone(status)}`} style={{ width: `${(count / maxStatusCount) * 100}%` }} /></div></div>)}{!rows.length && <div className="empty-inline">حلّل بياناتك حتى يظهر الملخص هنا.</div>}</div><div className="status-footnote"><Info size={14} /> تم تنظيف البصمات الشاذة: نعتمد أول دخول وآخر خروج، ونضيف التوقيت المفقود تلقائياً عند الحاجة.</div></CardContent></Card></div>
            <Card className="daily-card"><CardHeader className="card-heading-row"><div><CardTitle>الملخص اليومي</CardTitle><p>{selectedEmployee === "الكل" ? "مقارنة يومية لكل الموظفين" : `تفصيل يومي للموظف ${selectedEmployee}`}{selectedDate ? ` — ${selectedDate}` : ""}</p></div><Badge variant="outline">{formatNumber(uniqueDays)} أيام</Badge></CardHeader><CardContent><div className="table-scroll"><table className="daily-table"><thead><tr><th>الموظف</th><th>التاريخ</th><th>الدخول المعتمد</th><th>الخروج المعتمد</th><th>دخول متأخر</th><th>الخروج المبكر</th></tr></thead><tbody>{dailySummary.map((day) => <tr key={`${day.employee}-${day.date}`}><td><span className="id-chip">{day.employee}</span>{day.employeeName && <span className="daily-employee-name">{day.employeeName}</span>}</td><td dir="ltr">{day.date}</td><td dir="ltr" className="time-cell">{day.entry?.time || "—"}</td><td dir="ltr" className="time-cell">{day.exit?.time || "—"}</td><td>{day.lateMinutes ? `${formatNumber(day.lateMinutes)} د` : "—"}</td><td>{day.earlyMinutes ? `${formatNumber(day.earlyMinutes)} د` : "—"}</td></tr>)}{!dailySummary.length && <tr><td colSpan={6}><div className="empty-inline">لا توجد نتائج ضمن الفترة المختارة.</div></td></tr>}</tbody></table></div></CardContent></Card>
            <Card className="payroll-card"><CardHeader className="card-heading-row"><div><CardTitle>ملخص الرواتب</CardTitle><p>حساب الإضافي والخصومات للشهر {payrollMonth || "المختار"} — {payrollCoverageNote} — القيم بالعملة المدخلة</p></div><Badge variant="outline">{formatNumber(selectedPayroll.length)} موظف</Badge></CardHeader><CardContent><div className="table-scroll"><table className="payroll-table"><thead><tr><th>الموظف</th><th>الراتب</th><th>أيام الدوام</th><th>ساعات اليوم</th><th>أجر الساعة</th><th>إضافي</th><th>قيمة الإضافي</th><th>ساعات الخصم</th><th>قيمة الخصم</th><th>السلف</th><th>الصافي</th></tr></thead><tbody>{selectedPayroll.map((line) => <tr key={line.id}><td><span className="id-chip">{line.id}</span>{line.name && <span className="daily-employee-name">{line.name}</span>}</td><td>{formatAmount(line.salary)}</td><td>{formatNumber(line.workdays)}</td><td>{line.dailyHours.toFixed(2)}</td><td>{formatAmount(line.hourlyRate)}</td><td>{line.overtimeHours.toFixed(2)}</td><td>{formatAmount(line.overtimeValue)}</td><td>{line.deductionHours.toFixed(2)}</td><td>{formatAmount(line.deductionValue)}</td><td>{formatAmount(line.advanceValue)}</td><td><b>{formatAmount(line.net)}</b></td></tr>)}{!selectedPayroll.length && <tr><td colSpan={11}><div className="empty-inline">اختر شهراً أو حلّل سجلاً حتى يظهر ملخص الرواتب.</div></td></tr>}</tbody></table></div><div className="payroll-totals"><span>إجمالي الإضافي: <b>{formatAmount(payrollTotals.overtimeValue)}</b></span><span>إجمالي الخصومات: <b>{formatAmount(payrollTotals.deductionValue)}</b></span><span>إجمالي السلف: <b>{formatAmount(payrollTotals.advanceValue)}</b></span><span>الصافي: <b>{formatAmount(payrollTotals.net)}</b></span></div></CardContent></Card>
            
              <section className="guide-strip"><div className="guide-copy"><span className="eyebrow guide-raw-line">هي معلوماتك خام متلما وصلتني من عندك</span><h3>رتبتلك ياها، بشكل جديد</h3><div className="guide-accent">تصفّح، ابحث، فلتر، تأكّد، كن على دراية وإطّلاع</div><p>يظهر فيه الموظف، التاريخ، وقت الدخول والخروج، ودقائق دخول متأخر وخروج مبكر.</p></div><img src={GUIDE_IMAGE} alt="علامات ورقية تمثل أوقات الدوام" /></section>
            <Card className="table-card"><CardHeader className="table-header"><div className="table-title"><div className="title-icon title-icon-muted"><Filter size={18} /></div><div><CardTitle>سجل التفاصيل</CardTitle><p>ابحث، صفِّ، ثم صدّر ما تحتاجه</p></div></div><div className="table-controls"><label className="search-field"><span>بحث</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="رقم أو تاريخ..." /></label><div className="status-filter"><select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} aria-label="تصفية حسب الحالة">{statuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={15} /></div></div></CardHeader><CardContent className="table-content"><div className="table-scroll"><table><thead><tr><th>رقم الموظف</th><th>التاريخ</th><th>التوقيت</th><th>النوع</th><th>الحالة</th><th>دخول متأخر</th><th>خروج مبكر</th><th>المعالجة</th></tr></thead><tbody>{filteredRows.map((row, index) => <tr key={`${row.raw}-${index}`}><td><span className="id-chip">{row.id}</span>{row.employeeName && <span className="daily-employee-name">{row.employeeName}</span>}</td><td dir="ltr">{row.date}</td><td dir="ltr" className="time-cell">{row.time}</td><td>{row.role}</td><td><span className={`status-pill ${getStatusTone(row.status)}`}><span />{displayStatus(row.status)}</span></td><td>{row.lateMinutes ? `${formatNumber(row.lateMinutes)} د` : "—"}</td><td>{row.earlyMinutes ? `${formatNumber(row.earlyMinutes)} د` : "—"}</td><td><span className={`row-adjustment ${row.origin === "مضافة تلقائياً" ? "is-added" : ""}`}>{row.adjustment || row.origin}</span></td></tr>)}{!filteredRows.length && <tr><td colSpan={8}><div className="empty-table"><img src={EMPTY_IMAGE} alt="" /><strong>لا توجد سجلات بهذه التصفية</strong><span>جرّب تغيير البحث أو اختيار «الكل».</span></div></td></tr>}</tbody></table></div><div className="table-footer"><span>عرض {formatNumber(filteredRows.length)} من {formatNumber(periodRows.length)} حركة منظفة</span>{invalidRows.length > 0 && <span className="invalid-note"><Info size={14} /> تم تجاوز {formatNumber(invalidRows.length)} سطور غير مكتملة</span>}</div></CardContent></Card>
          </section>
        </div><footer className="site-footer"><a href="https://ahmadsalehtuffaha.com/" target="_blank" rel="noreferrer">أحمد صالح تفاحة</a><span>© 2026 — جميع الحقوق محفوظة</span></footer>
      </section>
    </main>
  );
}
