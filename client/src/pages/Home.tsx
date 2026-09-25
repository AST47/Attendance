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
  ListFilter,
  Loader2,
  RotateCcw,
  ScanLine,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const HERO_IMAGE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-paper-hero-RQ5vBrEG5ni3iJJuDgFaFh.webp";
const EMPTY_IMAGE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-empty-state-RykGkFEQghf3KYeEMEY2VJ.webp";
const SUMMARY_IMAGE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-summary-BkdjVsxDvCXms2LNtbN6aK.webp";
const GUIDE_IMAGE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-guide-he9pEC4RkFnaLxM3KrxH6w.webp";
const MARK_IMAGE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663026763281/kQefmURs8xWYKP6K3ocdwM/attendance-mark-TfQRMuRdAXnhUzTrxwgu4f.png";

const SAMPLE_INPUT = `1001\t2025-09-01\t08:03\t1
1002\t2025-09-01\t08:19\t2
1003\t2025-09-01\t09:11\t3
1001\t2025-09-02\t07:56\t1
1002\t2025-09-02\t08:04\t1
1003\t2025-09-02\t08:38\t2
1001\t2025-09-03\t08:14\t2
1002\t2025-09-03\t08:01\t1`;

const SAMPLE_CODES = `1 = حاضر
2 = متأخر
3 = غائب`;

type AttendanceRow = {
  id: string;
  date: string;
  time: string;
  code: string;
  status: string;
  raw: string;
};

type ParseResult = {
  rows: AttendanceRow[];
  invalid: string[];
};

function parseCodeMap(text: string) {
  return text.split(/\r?\n/).reduce<Record<string, string>>((acc, line) => {
    const match = line.match(/^\s*(\d+)\s*(?:=|:|-|\t)\s*(.+?)\s*$/);
    if (match) acc[match[1]] = match[2];
    return acc;
  }, {});
}

function parseAttendanceText(text: string, mapping: Record<string, string>): ParseResult {
  const rows: AttendanceRow[] = [];
  const invalid: string[] = [];

  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const dateMatch = line.match(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/);
      const timeMatch = line.match(/\b([01]?\d|2[0-3]):[0-5]\d(?:\s?[AP]M)?\b/i);
      const separator = line.includes("\t") ? "\t" : line.includes(";") ? ";" : line.includes(",") ? "," : null;
      const parts = separator ? line.split(separator).map((part) => part.trim()) : line.split(/\s+/);
      const dateIndex = parts.findIndex((part) => /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(part));
      const timeIndex = parts.findIndex((part) => /\b([01]?\d|2[0-3]):[0-5]\d/.test(part));
      const codeIndex = parts.length - 1;
      const codeCandidate = parts[codeIndex]?.replace(/[^\d]/g, "") ?? "";
      const idCandidate = parts.find((part, index) => index !== codeIndex && index !== dateIndex && index !== timeIndex && /^\d{2,}$/.test(part.replace(/\D/g, "")));

      if (!dateMatch || !timeMatch || !codeCandidate || !idCandidate) {
        if (!/^((رقم|التاريخ|date|id|employee|time|code|status)\b)/i.test(line)) invalid.push(line);
        return;
      }

      rows.push({
        id: idCandidate.replace(/\D/g, ""),
        date: dateMatch[1],
        time: timeMatch[0],
        code: codeCandidate,
        status: mapping[codeCandidate] || "غير معرّف",
        raw: line,
      });
    });

  return { rows, invalid };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ar-EG").format(value);
}

function getStatusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("حاضر") || normalized.includes("مكتمل")) return "status-positive";
  if (normalized.includes("متأخر") || normalized.includes("تأخير")) return "status-warning";
  if (normalized.includes("غائب") || normalized.includes("غياب")) return "status-negative";
  return "status-neutral";
}

export default function Home() {
  const [sourceText, setSourceText] = useState(SAMPLE_INPUT);
  const [mappingText, setMappingText] = useState(SAMPLE_CODES);
  const [rows, setRows] = useState<AttendanceRow[]>(() => parseAttendanceText(SAMPLE_INPUT, parseCodeMap(SAMPLE_CODES)).rows);
  const [invalidRows, setInvalidRows] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("الكل");
  const [query, setQuery] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isMappingOpen, setIsMappingOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mapping = useMemo(() => parseCodeMap(mappingText), [mappingText]);
  const statuses = useMemo(() => ["الكل", ...Array.from(new Set(rows.map((row) => row.status)))], [rows]);
  const statusCounts = useMemo(() => {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
  }, [rows]);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = selectedStatus === "الكل" || row.status === selectedStatus;
      const matchesQuery = !normalizedQuery || `${row.id} ${row.date} ${row.time} ${row.status}`.toLowerCase().includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [query, rows, selectedStatus]);
  const uniqueDays = useMemo(() => new Set(rows.map((row) => row.date)).size, [rows]);
  const latestDate = rows.map((row) => row.date).sort().at(-1) || "—";
  const lateCount = rows.filter((row) => row.status.includes("متأخر") || row.code === "2").length;
  const unknownCount = rows.filter((row) => row.status === "غير معرّف").length;
  const maxStatusCount = Math.max(1, ...Object.values(statusCounts));

  const analyze = () => {
    setIsAnalyzing(true);
    window.setTimeout(() => {
      const result = parseAttendanceText(sourceText, mapping);
      setRows(result.rows);
      setInvalidRows(result.invalid);
      setSelectedStatus("الكل");
      setQuery("");
      setIsAnalyzing(false);
      if (result.rows.length) {
        toast.success(`تم تحليل ${formatNumber(result.rows.length)} سجل بنجاح`);
      } else {
        toast.error("لم أجد سجلات مكتملة. تأكد من وجود رقم وتاريخ وتوقيت ورمز.");
      }
    }, 380);
  };

  const readFile = (file: File) => {
    if (!file.name.match(/\.(txt|csv|tsv|log|json)$/i)) {
      toast.error("ارفع ملفاً نصياً أو CSV أو TSV فقط");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSourceText(String(reader.result || ""));
      toast.success(`تم تحميل ${file.name}. اضغط «حلّل السجلات» لإظهار النتيجة.`);
    };
    reader.onerror = () => toast.error("تعذّر قراءة الملف");
    reader.readAsText(file, "UTF-8");
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) readFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const resetSample = () => {
    setSourceText(SAMPLE_INPUT);
    setMappingText(SAMPLE_CODES);
    setRows(parseAttendanceText(SAMPLE_INPUT, parseCodeMap(SAMPLE_CODES)).rows);
    setInvalidRows([]);
    setSelectedStatus("الكل");
    setQuery("");
    toast.message("رجعنا للمثال الجاهز");
  };

  const exportCsv = () => {
    if (!filteredRows.length) {
      toast.error("لا توجد سجلات لتصديرها");
      return;
    }
    const csvRows = [
      ["رقم الموظف", "التاريخ", "التوقيت", "الرمز", "الحالة"],
      ...filteredRows.map((row) => [row.id, row.date, row.time, row.code, row.status]),
    ];
    const csv = "\ufeff" + csvRows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "attendance-insights.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("تم تجهيز ملف CSV");
  };

  return (
    <main className="app-shell" dir="rtl">
      <aside className="brand-rail">
        <div>
          <div className="brand-lockup">
            <img src={MARK_IMAGE} alt="" className="brand-mark" />
            <div>
              <p className="brand-kicker">سجلّك بوضوح</p>
              <h1>دوام<span>.</span></h1>
            </div>
          </div>
          <div className="rail-rule" />
          <div className="rail-motif" aria-hidden="true"><span /><span /><span /><i /></div>
          <div className="rail-note">
            <span className="rail-dot" />
            <p>مساحة صغيرة<br />لتفهم يومك الكبير.</p>
          </div>
        </div>
        <div className="rail-footer">
          <div className="rail-stamp">LOCAL<br /><strong>FIRST</strong></div>
          <p>بياناتك تُعالج في متصفحك<br />ولا تُرفع إلى أي مكان.</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumb"><span>أداة التحليل</span><ArrowLeft size={15} /><strong>سجل الدوام</strong></div>
          <div className="topbar-meta"><span className="live-dot" /> <span>جاهز للعمل</span></div>
        </header>

        <div className="content-wrap">
          <section className="hero-section" style={{ backgroundImage: `url(${HERO_IMAGE})` }}>
            <div className="hero-copy">
              <Badge className="coral-badge"><Sparkles size={14} /> نسخة تجريبية عملية</Badge>
              <h2>خلّي سجل الدوام<br /><em>يحكي القصة كاملة.</em></h2>
              <p>ارفع ملفك أو الصق البيانات كما هي. سنرتب الأرقام والتواريخ والتواقيت، ونحوّلها إلى ملخص واضح يمكنك مراجعته وتصديره.</p>
            </div>
            <div className="hero-side-note">
              <span className="hero-number">01</span>
              <span>إدخال<br />ثم فهم</span>
            </div>
          </section>

          <div className="section-intro">
            <div>
              <span className="eyebrow">01 / ابدأ من هنا</span>
              <h3>أدخل السجل كما هو</h3>
            </div>
            <p>لا تحتاج إلى تنسيق مثالي.<br />يكفينا أن نجد: <strong>رقماً، تاريخاً، توقيتاً، ورمزاً.</strong></p>
          </div>

          <section className="input-layout">
            <Card className="input-card">
              <CardHeader className="input-card-header">
                <div className="section-title-row">
                  <div className="title-icon"><ScanLine size={20} /></div>
                  <div>
                    <CardTitle>البيانات الخام</CardTitle>
                    <p>الصق النص أو ارفع ملفاً</p>
                  </div>
                </div>
                <button className="text-button" onClick={resetSample} title="إعادة المثال الجاهز"><RotateCcw size={15} /> مثال</button>
              </CardHeader>
              <CardContent>
                <textarea
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  className="data-textarea"
                  aria-label="بيانات الدوام الخام"
                  spellCheck={false}
                  dir="ltr"
                />
                <div
                  className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
                  onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <div className="drop-icon"><Upload size={18} /></div>
                  <div><strong>اسحب الملف إلى هنا</strong><span>أو</span></div>
                  <button className="upload-link" onClick={() => fileInputRef.current?.click()}>اختر ملفاً</button>
                  <input ref={fileInputRef} type="file" accept=".txt,.csv,.tsv,.log,.json" hidden onChange={handleFileChange} />
                </div>
                <div className="format-hint"><Info size={14} /> يقبل TXT و CSV و TSV — تتم المعالجة محلياً داخل المتصفح</div>
              </CardContent>
            </Card>

            <div className="mapping-column">
              <Card className={`mapping-card ${isMappingOpen ? "is-open" : ""}`}>
                <button className="mapping-toggle" onClick={() => setIsMappingOpen((open) => !open)}>
                  <span className="section-title-row">
                    <span className="title-icon title-icon-muted"><ListFilter size={19} /></span>
                    <span><strong>قاموس الحالات</strong><small>شو يعني كل رقم؟</small></span>
                  </span>
                  <ChevronDown size={18} className="chevron" />
                </button>
                {isMappingOpen && (
                  <div className="mapping-body">
                    <p>اكتب كل رمز أمام اسمه، سطراً لكل حالة. مثال: <code>1 = حاضر</code></p>
                    <textarea value={mappingText} onChange={(event) => setMappingText(event.target.value)} className="mapping-textarea" dir="rtl" />
                    <div className="mapping-preview">
                      {Object.entries(mapping).map(([code, label]) => <span key={code}><b>{code}</b>{label}</span>)}
                      {!Object.keys(mapping).length && <span className="muted-inline">أضف رمزاً واحداً على الأقل</span>}
                    </div>
                  </div>
                )}
              </Card>
              <div className="privacy-slip"><Check size={14} /> خصوصيتك محفوظة — لا يوجد تسجيل دخول ولا تخزين سحابي</div>
            </div>
          </section>

          <div className="analyze-row">
            <div className="analyze-caption"><span className="coral-line" /> اضغط عندما تكون جاهزاً، وسنرتب الصفحة</div>
            <Button className="analyze-button" onClick={analyze} disabled={isAnalyzing}>
              {isAnalyzing ? <><Loader2 size={18} className="spin" /> جارٍ التحليل...</> : <>حلّل السجلات <ArrowLeft size={18} /></>}
            </Button>
          </div>

          <Separator className="paper-separator" />

          <section className="results-section">
            <div className="section-intro results-intro">
              <div>
                <span className="eyebrow">02 / الصورة الواضحة</span>
                <h3>النتيجة في صفحة واحدة</h3>
              </div>
              <div className="results-actions">
                <span className="processed-label"><span className="live-dot" /> تمت المعالجة محلياً</span>
                <Button variant="outline" className="export-button" onClick={exportCsv}><ArrowDownToLine size={16} /> تنزيل CSV</Button>
              </div>
            </div>

            <div className="metric-grid">
              <Card className="metric-card metric-main"><CardContent><div className="metric-index">A / قراءة</div><div className="metric-label"><FileText size={16} /> إجمالي السجلات</div><strong>{formatNumber(rows.length)}</strong><span>سجل تم قراءته</span></CardContent></Card>
              <Card className="metric-card"><CardContent><div className="metric-index">B / زمن</div><div className="metric-label"><Clock3 size={16} /> أيام مختلفة</div><strong>{formatNumber(uniqueDays)}</strong><span>حتى {latestDate}</span></CardContent></Card>
              <Card className="metric-card"><CardContent><div className="metric-index">C / انتباه</div><div className="metric-label"><BarChart3 size={16} /> حالات متأخرة</div><strong>{formatNumber(lateCount)}</strong><span>{rows.length ? `${Math.round((lateCount / rows.length) * 100)}% من السجلات` : "لا يوجد بعد"}</span></CardContent></Card>
              <Card className="metric-card metric-alert"><CardContent><div className="metric-index">D / قاموس</div><div className="metric-label"><CircleHelp size={16} /> تحتاج تسمية</div><strong>{formatNumber(unknownCount)}</strong><span>{unknownCount ? "راجع قاموس الحالات" : "كل الرموز مفهومة"}</span></CardContent></Card>
            </div>

            <div className="analysis-grid">
              <Card className="status-card">
                <CardHeader className="card-heading-row"><div><CardTitle>توزيع الحالات</CardTitle><p>كيف توزعت السجلات حسب القاموس الذي عرّفته؟</p></div><Badge variant="outline">{formatNumber(Object.keys(statusCounts).length)} حالات</Badge></CardHeader>
                <CardContent>
                  <div className="status-bars">
                    {Object.entries(statusCounts).map(([status, count]) => (
                      <div className="status-bar-row" key={status}>
                        <div className="status-bar-label"><span className={`status-dot ${getStatusTone(status)}`} /> <span>{status}</span><b>{formatNumber(count)}</b></div>
                        <div className="bar-track"><div className={`bar-fill ${getStatusTone(status)}`} style={{ width: `${(count / maxStatusCount) * 100}%` }} /></div>
                      </div>
                    ))}
                    {!rows.length && <div className="empty-inline">حلّل بياناتك حتى يظهر التوزيع هنا.</div>}
                  </div>
                  <div className="status-footnote"><Info size={14} /> النتيجة مبنية على الأرقام التي عرّفتها أنت، ويمكن تعديل القاموس وإعادة التحليل.</div>
                </CardContent>
              </Card>

              <Card className="summary-visual-card">
                <img src={SUMMARY_IMAGE} alt="رسم ورقي تجريدي لملخص الدوام" />
                <div className="summary-overlay"><span className="eyebrow">ملاحظة سريعة</span><strong>{lateCount ? `${formatNumber(lateCount)} سجلات تحتاج انتباهاً` : "لا توجد حالات متأخرة"}</strong><span>{lateCount ? "يمكنك تصفيتها من الجدول أدناه." : "سجل الدوام يبدو مرتباً حتى الآن."}</span></div>
              </Card>
            </div>

            <Card className="table-card">
              <CardHeader className="table-header">
                <div className="table-title"><div className="title-icon title-icon-muted"><Filter size={18} /></div><div><CardTitle>سجل التفاصيل</CardTitle><p>ابحث، صفِّ، ثم صدّر ما تحتاجه</p></div></div>
                <div className="table-controls">
                  <label className="search-field"><span>بحث</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="رقم أو تاريخ..." /></label>
                  <div className="status-filter"><select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} aria-label="تصفية حسب الحالة">{statuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={15} /></div>
                </div>
              </CardHeader>
              <CardContent className="table-content">
                <div className="table-scroll"><table><thead><tr><th>رقم الموظف</th><th>التاريخ</th><th>التوقيت</th><th>الرمز</th><th>الحالة</th><th aria-label="إجراء" /></tr></thead><tbody>
                  {filteredRows.map((row, index) => <tr key={`${row.raw}-${index}`}><td><span className="id-chip">{row.id}</span></td><td dir="ltr">{row.date}</td><td dir="ltr" className="time-cell">{row.time}</td><td><span className="code-chip">{row.code}</span></td><td><span className={`status-pill ${getStatusTone(row.status)}`}><span />{row.status}</span></td><td><button className="row-more" aria-label={`تفاصيل السجل ${row.id}`}>•••</button></td></tr>)}
                  {!filteredRows.length && <tr><td colSpan={6}><div className="empty-table"><img src={EMPTY_IMAGE} alt="" /><strong>لا توجد سجلات بهذه التصفية</strong><span>جرّب تغيير البحث أو اختيار «الكل».</span></div></td></tr>}
                </tbody></table></div>
                <div className="table-footer"><span>عرض {formatNumber(filteredRows.length)} من {formatNumber(rows.length)} سجل</span>{invalidRows.length > 0 && <span className="invalid-note"><Info size={14} /> تم تجاوز {formatNumber(invalidRows.length)} سطور غير مكتملة</span>}</div>
              </CardContent>
            </Card>
          </section>

          <section className="guide-strip">
            <div className="guide-copy"><span className="eyebrow">ورقة صغيرة قبل أن تبدأ</span><h3>كلما كان القاموس أوضح،<br /><em>كانت النتيجة أذكى.</em></h3><p>إذا كان الرقم 2 يعني «متأخر» في نظامك، اكتبه مرة واحدة فقط. الأداة ستستخدم هذا المعنى في الملخص والجدول والتصدير.</p></div>
            <img src={GUIDE_IMAGE} alt="علامات ورقية تمثل ربط رموز الدوام بمعانيها" />
          </section>
        </div>

        <footer className="site-footer"><span>دوام. / أداة صغيرة للقراءة اليومية</span><span>مصممة للبيانات التي تبدأ كرقم وتنتهي بفهم.</span></footer>
      </section>
    </main>
  );
}
