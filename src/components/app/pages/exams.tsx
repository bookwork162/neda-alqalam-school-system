"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ClipboardList, Calculator, Printer, Plus } from "lucide-react";
import { apiGet, apiPost } from "@/components/app/api";
import { useN, useT } from "@/components/app/store";
import { Loading, PageHeader, StatusBadge } from "@/components/app/ui";
import { PrintOverlay, DocLetterhead, SignatureRow, SchoolHeaderInfo } from "@/components/app/printable";
import { MOE_EXAM_TYPES, MOE_GRADE_BANDS, gradeForTotal } from "@/lib/moe-constants";
import { formatJalali, toPersianDigits, todayISO } from "@/lib/date";

// ---------- types ----------

interface ExamRow {
  id: string; academicYearId: string; type: string; label: string; maxPerSubject: number;
  classroomId: string; examDate: string; status: string;
  classroom: { id: string; name: string; grade: number; section: string; level: string };
  academicYear: { id: string; name: string };
}

interface ExamDetail {
  exam: ExamRow;
  rows: {
    enrollmentId: string; studentNo: string; name: string; fatherName: string; rollNo: number;
    marks: Record<string, number>;
  }[];
  classSubjects: { id: string; subjectId: string; subjectName: string }[];
}

interface Lookup {
  years: { id: string; name: string }[];
  classrooms: { id: string; name: string; grade: number }[];
  school: SchoolHeaderInfo | null;
  settings: Record<string, unknown>;
}

interface NoticeStudent {
  name: string;
  studentNo: string;
  className: string;
  subjectMarks: { subjectName: string; marks: number | null }[];
  total: number;
  rank: number;
  result: string;
}

// ---------- printables ----------

function MarksheetPrint({ school, detail, yearName }: { school: SchoolHeaderInfo | null; detail: ExamDetail; yearName: string }) {
  const n = useN();
  return (
    <div>
      <DocLetterhead school={school} yearName={yearName} />
      <div className="text-center font-bold mb-2">شقه امتحان — {detail.exam.label}</div>
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-1">{n.eastern("پشت")}</th>
            <th className="border p-1">نام</th>
            <th className="border p-1">نام پدر</th>
            {detail.classSubjects.map((cs) => (
              <th key={cs.id} className="border p-1">{cs.subjectName}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {detail.rows.map((r, i) => (
            <tr key={r.enrollmentId}>
              <td className="border p-1 text-center">{n.eastern(r.rollNo || i + 1)}</td>
              <td className="border p-1">{r.name}</td>
              <td className="border p-1">{r.fatherName}</td>
              {detail.classSubjects.map((cs) => {
                const m = r.marks[cs.id];
                return (
                  <td key={cs.id} className="border p-1 text-center">
                    {m === undefined ? "" : n.eastern(m)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] mt-1">{n.eastern("نمره اطمینانی هر مضمون")}: {n.eastern(detail.exam.maxPerSubject)}</p>
      <SignatureRow left="امضای معلم" right="امضای مدیر" />
    </div>
  );
}

function SummarySheetPrint({ school, detail, yearName }: { school: SchoolHeaderInfo | null; detail: ExamDetail; yearName: string }) {
  const n = useN();
  const ranked = useMemo(() => rankRows(detail), [detail]);
  return (
    <div>
      <DocLetterhead school={school} yearName={yearName} />
      <div className="text-center font-bold mb-2">خلص جدول نمرات — {detail.exam.label} — صنف {detail.exam.classroom.name}</div>
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-1">{n.eastern("پشت")}</th>
            <th className="border p-1">نام متعلم</th>
            {detail.classSubjects.map((cs) => (
              <th key={cs.id} className="border p-1">{cs.subjectName}</th>
            ))}
            <th className="border p-1">مجموع</th>
            <th className="border p-1">درجه</th>
            <th className="border p-1">مقام</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.enrollmentId}>
              <td className="border p-1 text-center">{n.eastern(r.rollNo || i + 1)}</td>
              <td className="border p-1">{r.name} {r.fatherName}</td>
              {detail.classSubjects.map((cs) => {
                const m = r.marks[cs.id];
                return (
                  <td key={cs.id} className="border p-1 text-center">
                    {m === undefined ? "" : n.eastern(m)}
                  </td>
                );
              })}
              <td className="border p-1 text-center font-bold">{n.eastern(r.total)}</td>
              <td className="border p-1 text-center">{r.grade}</td>
              <td className="border p-1 text-center">{n.eastern(r.rank)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SignatureRow left="امضای معلم" right="امضای مدیر" />
    </div>
  );
}

function NoticeCardPrint({ school, student, yearName }: { school: SchoolHeaderInfo | null; student: NoticeStudent; yearName: string }) {
  const n = useN();
  const { t } = useT();
  return (
    <div className="max-w-md mx-auto">
      <DocLetterhead school={school} yearName={yearName} />
      <div className="text-center font-bold mb-2">اطلاعنامه نتایج</div>
      <table className="w-full text-xs border" dir="rtl">
        <tbody>
          <tr><td className="bg-gray-50 font-semibold w-32 p-1.5 border">متعلم</td><td className="p-1.5 border">{student.name}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">نمبر متعلم</td><td className="p-1.5 border" dir="ltr">{student.studentNo}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">صنف</td><td className="p-1.5 border">{student.className}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">مقام</td><td className="p-1.5 border">{n.eastern(student.rank)}</td></tr>
        </tbody>
      </table>
      <table className="w-full text-xs border-collapse mt-2">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-1">مضمون</th>
            <th className="border p-1">نمره</th>
          </tr>
        </thead>
        <tbody>
          {student.subjectMarks.map((sm, i) => (
            <tr key={i}>
              <td className="border p-1">{sm.subjectName}</td>
              <td className="border p-1 text-center">{sm.marks === null ? "—" : n.eastern(sm.marks)}</td>
            </tr>
          ))}
          <tr>
            <td className="border p-1 font-bold">مجموع</td>
            <td className="border p-1 text-center font-bold">{n.eastern(student.total)}</td>
          </tr>
          <tr>
            <td className="border p-1 font-bold">نتیجه</td>
            <td className="border p-1 text-center font-bold">{student.result}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[10px] mt-3 text-gray-700">{t.remarksForParents}</p>
      <SignatureRow left="امضای مدیر" right="امضای ولی" />
    </div>
  );
}

// ---------- ranking helper ----------

function rankRows(detail: ExamDetail) {
  const bands = MOE_GRADE_BANDS;
  const rows = detail.rows.map((r) => {
    const total = detail.classSubjects.reduce((s, cs) => s + (r.marks[cs.id] ?? 0), 0);
    return { ...r, total, grade: gradeForTotal(total, bands), rank: 0 };
  });
  rows.sort((a, b) => b.total - a.total);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

// ---------- main page ----------

export function ExamsPage() {
  const { t, locale } = useT();
  const n = useN();
  const qc = useQueryClient();

  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const yearId = (lookup.data?.years.find((y) => y.isCurrent) ?? lookup.data?.years[0])?.id ?? "";
  const [yearFilter, setYearFilter] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [noticeStudent, setNoticeStudent] = useState<NoticeStudent | null>(null);
  const [printSheet, setPrintSheet] = useState(false);
  const [printSummary, setPrintSummary] = useState(false);

  const effYear = yearFilter || yearId;
  const yearName = lookup.data?.years.find((y) => y.id === effYear)?.name ?? lookup.data?.years[0]?.name ?? "1405";

  const examsQ = useQuery({
    queryKey: ["exams", effYear, classFilter],
    queryFn: () =>
      apiGet<{ items: ExamRow[]; total: number }>(
        `/api/x/exams?academicYearId=${effYear}${classFilter !== "all" ? `&classroomId=${classFilter}` : ""}`,
      ),
    enabled: !!effYear,
  });

  const detailQ = useQuery({
    queryKey: ["exam-detail", selectedId],
    queryFn: () => apiGet<ExamDetail>(`/api/x/exams/${selectedId}`),
    enabled: !!selectedId,
  });

  // local marks draft: map `${enrollmentId}:${classSubjectId}` -> string value
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftExamId, setDraftExamId] = useState("");
  const detail = detailQ.data;
  if (detail && detail.exam.id !== draftExamId) {
    setDraftExamId(detail.exam.id);
    const init: Record<string, string> = {};
    for (const r of detail.rows) {
      for (const [csId, m] of Object.entries(r.marks)) {
        init[`${r.enrollmentId}:${csId}`] = String(m);
      }
    }
    setDraft(init);
  }

  const saveMarks = useMutation({
    mutationFn: () => {
      const rows: { enrollmentId: string; classSubjectId: string; marks: number | null }[] = [];
      for (const [key, val] of Object.entries(draft)) {
        const [enrollmentId, classSubjectId] = key.split(":");
        if (!enrollmentId || !classSubjectId) continue;
        if (val === "") {
          rows.push({ enrollmentId, classSubjectId, marks: null });
          continue;
        }
        const num = Math.max(0, Math.min(parseInt(val, 10) || 0, detail?.exam.maxPerSubject ?? 100));
        rows.push({ enrollmentId, classSubjectId, marks: num });
      }
      return apiPost<{ saved: number }>(`/api/x/exams/${selectedId}/marks`, { rows });
    },
    onSuccess: (res) => {
      toast.success(`${t.savedMarks} (${n.n(res.saved)})`);
      qc.invalidateQueries({ queryKey: ["exam-detail", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const computeResults = useMutation({
    mutationFn: () => apiPost<{ computed: number }>(`/api/x/exams/${selectedId}/compute`, {}),
    onSuccess: (res) => {
      toast.success(`${t.resultsComputed} (${n.n(res.computed)})`);
      qc.invalidateQueries({ queryKey: ["exam-detail", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedExam = detail?.exam ?? null;

  const openNotice = (row: ExamDetail["rows"][0]) => {
    if (!detail) return;
    const ranked = rankRows(detail);
    const mine = ranked.find((r) => r.enrollmentId === row.enrollmentId);
    if (!mine) return;
    setNoticeStudent({
      name: `${mine.name} ${mine.fatherName}`,
      studentNo: mine.studentNo,
      className: detail.exam.classroom.name,
      subjectMarks: detail.classSubjects.map((cs) => ({ subjectName: cs.subjectName, marks: mine.marks[cs.id] ?? null })),
      total: mine.total,
      rank: mine.rank,
      result: mine.grade,
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.exams}
        subtitle={t.markSheet}
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 me-1" /> {t.newExam}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* ---- exam list pane ---- */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={yearFilter || yearId} onValueChange={setYearFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(lookup.data?.years ?? []).map((y) => (
                  <SelectItem key={y.id} value={y.id}>{n.eastern(y.name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder={t.selectClass} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                {(lookup.data?.classrooms ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {examsQ.isLoading ? (
            <Loading rows={4} />
          ) : (examsQ.data?.items ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t.noData}</p>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto nq-scroll pe-1">
              {(examsQ.data?.items ?? []).map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`w-full text-start rounded-lg border p-3 transition-colors hover:bg-accent ${
                    selectedId === e.id ? "bg-primary/10 border-primary" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{e.label}</span>
                    <StatusBadge status={e.status} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {e.classroom.name} — {e.type} — {formatJalali(e.examDate, locale)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {t.maxMarks}: {n.eastern(e.maxPerSubject)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---- work area ---- */}
        <div className="space-y-3 min-w-0">
          {!selectedId ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                {t.selectExam}
              </CardContent>
            </Card>
          ) : detailQ.isLoading || !detail ? (
            <Loading rows={8} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold">{detail.exam.label}</h2>
                  <p className="text-xs text-muted-foreground">
                    {detail.exam.classroom.name} — {detail.exam.type} — {formatJalali(detail.exam.examDate, locale)} —{" "}
                    {t.maxMarks}: {n.eastern(detail.exam.maxPerSubject)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => saveMarks.mutate()} disabled={saveMarks.isPending || detail.classSubjects.length === 0}>
                    {t.saveMarks}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => computeResults.mutate()} disabled={computeResults.isPending}>
                    <Calculator className="h-4 w-4 me-1" /> {t.computeResults}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPrintSheet(true)} disabled={detail.rows.length === 0}>
                    <Printer className="h-4 w-4 me-1" /> {t.printMarksheet}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPrintSummary(true)} disabled={detail.rows.length === 0}>
                    <Printer className="h-4 w-4 me-1" /> {t.printSummarySheet}
                  </Button>
                </div>
              </div>
              {detail.classSubjects.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">{t.noClassSubjects}</p>
              ) : (
                <div className="rounded-md border max-h-[60vh] overflow-auto nq-scroll">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr className="border-b">
                        <th className="p-2 text-start w-12">{t.rollNo}</th>
                        <th className="p-2 text-start min-w-36">{t.student}</th>
                        {detail.classSubjects.map((cs) => (
                          <th key={cs.id} className="p-2 text-center min-w-20">{cs.subjectName}</th>
                        ))}
                        <th className="p-2 text-center">{t.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.rows.map((r) => (
                        <tr key={r.enrollmentId} className="border-b last:border-0">
                          <td className="p-1.5 text-center">{n.eastern(r.rollNo)}</td>
                          <td className="p-1.5">
                            <div className="font-medium">{r.name}</div>
                            <div className="text-[10px] text-muted-foreground" dir="ltr">{r.studentNo}</div>
                          </td>
                          {detail.classSubjects.map((cs) => {
                            const key = `${r.enrollmentId}:${cs.id}`;
                            return (
                              <td key={cs.id} className="p-1">
                                <Input
                                  type="number"
                                  dir="ltr"
                                  min={0}
                                  max={detail.exam.maxPerSubject}
                                  className="h-7 w-16 text-center"
                                  value={draft[key] ?? ""}
                                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                                />
                              </td>
                            );
                          })}
                          <td className="p-1.5 text-center">
                            <Button size="sm" variant="ghost" onClick={() => openNotice(r)}>
                              {t.printNoticeCard}
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {detail.rows.length === 0 && (
                        <tr><td colSpan={detail.classSubjects.length + 3} className="p-4 text-center text-muted-foreground">{t.emptyGrid}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <NewExamDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onSaved={(exam) => {
          qc.invalidateQueries({ queryKey: ["exams"] });
          setSelectedId(exam.id);
        }}
        yearId={effYear}
      />

      {printSheet && detail && (
        <PrintOverlay title={t.printMarksheet} onClose={() => setPrintSheet(false)}>
          <MarksheetPrint school={lookup.data?.school ?? null} detail={detail} yearName={yearName} />
        </PrintOverlay>
      )}
      {printSummary && detail && (
        <PrintOverlay title={t.printSummarySheet} onClose={() => setPrintSummary(false)}>
          <SummarySheetPrint school={lookup.data?.school ?? null} detail={detail} yearName={yearName} />
        </PrintOverlay>
      )}
      {noticeStudent && (
        <PrintOverlay title={t.studentNotice} onClose={() => setNoticeStudent(null)}>
          <NoticeCardPrint school={lookup.data?.school ?? null} student={noticeStudent} yearName={yearName} />
        </PrintOverlay>
      )}
    </div>
  );
}

// ---------- new exam dialog ----------

function NewExamDialog({
  open, onClose, onSaved, yearId,
}: {
  open: boolean; onClose: () => void; onSaved: (exam: ExamRow) => void; yearId: string;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const [classroomId, setClassroomId] = useState("");
  const [type, setType] = useState(MOE_EXAM_TYPES[0]?.type ?? "چهارونیم‌ماهه");
  const [examDate, setExamDate] = useState(todayISO());

  const classroom = (lookup.data?.classrooms ?? []).find((c) => c.id === classroomId);
  const maxByType = MOE_EXAM_TYPES.find((x) => x.type === type)?.maxPerSubject ?? 40;
  const label = classroom ? `امتحان ${type} ${classroom.name}` : `امتحان ${type}`;

  const create = useMutation({
    mutationFn: () =>
      apiPost<{ item: ExamRow }>("/api/x/exams", {
        academicYearId: yearId,
        classroomId,
        type,
        label,
        maxPerSubject: maxByType,
        examDate,
        status: "برنامه‌ریزی‌شده",
      }),
    onSuccess: (res) => {
      toast.success(t.created);
      qc.invalidateQueries({ queryKey: ["exams"] });
      onSaved(res.item);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.newExam}</DialogTitle>
          <DialogDescription>{t.examLabel}: {label} — {t.maxMarks}: {toPersianDigits(maxByType)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t.classroom}</Label>
            <Select value={classroomId} onValueChange={setClassroomId}>
              <SelectTrigger><SelectValue placeholder={t.selectClass} /></SelectTrigger>
              <SelectContent>
                {(lookup.data?.classrooms ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t.examType}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOE_EXAM_TYPES.map((x) => (
                  <SelectItem key={x.type} value={x.type}>{x.type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t.examDate}</Label>
            <Input type="date" dir="ltr" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !classroomId}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
