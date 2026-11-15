"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowRight, UserPlus, Printer } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/components/app/api";
import { useApp as useAppStore } from "@/components/app/store";
import { useN, useT } from "@/components/app/store";
import { DataTable, EmptyState, JalaliDate, Loading, PageHeader, StatusBadge } from "@/components/app/ui";
import { PrintOverlay, DocLetterhead, SignatureRow, SchoolHeaderInfo } from "@/components/app/printable";
import { formatAFN } from "@/lib/money";
import { monthKeyLabel } from "@/lib/date";

interface StudentRow {
  id: string; studentNo: string; firstName: string; fatherName: string; grandFatherName: string;
  tash: string; gender: string; birthDateJalali: string; birthProvince: string; birthDistrict: string;
  province: string; district: string; village: string; address: string; tazkiraNo: string;
  guardianName: string; guardianRelation: string; guardianPhone: string; phone2: string;
  previousSchool: string; notes: string; status: string;
  activeEnrollment: { id: string; rollNo: number; classroom: { id: string; name: string; grade: number } } | null;
}

const EMPTY_STUDENT: Partial<StudentRow> = {
  firstName: "", fatherName: "", grandFatherName: "", tash: "", gender: "مذکر",
  birthDateJalali: "", birthProvince: "", birthDistrict: "", province: "کابل", district: "",
  village: "", address: "", tazkiraNo: "", guardianName: "", guardianRelation: "پدر",
  guardianPhone: "", phone2: "", previousSchool: "", notes: "",
};

// ---- lookup + value mappings (server stores english keys, UI shows Persian) ----

interface LookupResponse {
  years: { id: string; name: string; isCurrent: boolean }[];
  classrooms: { id: string; name: string; grade: number; section: string; level: string; academicYearId: string }[];
  subjects: { id: string; nameDr: string; namePs: string; nameEn: string }[];
  staff: { id: string; name: string; position: string; subjectSpecialty: string }[];
  studentsMinimal: { id: string; studentNo: string; firstName: string; fatherName: string; gender: string }[];
  school: SchoolHeaderInfo | null;
}

const ST_UI2SRV: Record<string, string> = { "فعال": "active", "ترک تحصیل": "left", "فارغ": "graduated" };
const ST_SRV2UI: Record<string, string> = { active: "فعال", left: "ترک تحصیل", graduated: "فارغ" };
const GENDER_UI2SRV: Record<string, string> = { "مذکر": "ذکور", "مؤنث": "اناث" };
const GENDER_SRV2UI: Record<string, string> = { "ذکور": "مذکر", "اناث": "مؤنث" };
const ENR_SRV2UI: Record<string, string> = { active: "فعال", completed: "تکمیل", transferred: "انتقال", left: "ترک تحصیل" };

export function StudentsPage() {
  const { t, locale } = useT();
  const n = useN();
  const navigate = { to: (h: string) => { window.location.hash = h; } };
  const qc = useQueryClient();
  const [regOpen, setRegOpen] = useState(false);
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const user = useAppRole();

  const meta = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<LookupResponse>("/api/x/lookup") });
  const studentsQ = useQuery({
    queryKey: ["students", classFilter, statusFilter],
    queryFn: () =>
      apiGet<{ items: Record<string, unknown>[]; total: number }>(
        `/api/x/students?take=1000${classFilter !== "all" ? `&classroomId=${classFilter}` : ""}${statusFilter !== "all" ? `&status=${ST_UI2SRV[statusFilter] ?? statusFilter}` : ""}`,
      ),
  });
  const students = (studentsQ.data?.items ?? []).map((s) => {
    const enrAll = (s.enrollments ?? []) as { id: string; rollNo: number; status: string; classroom: { id: string; name: string; grade: number } }[];
    const activeEnr = enrAll.find((e) => e.status === "active") ?? enrAll[0] ?? null;
    return {
      ...s,
      status: ST_SRV2UI[String(s.status)] ?? String(s.status),
      gender: GENDER_SRV2UI[String(s.gender)] ?? String(s.gender),
      activeEnrollment: activeEnr,
    } as unknown as StudentRow;
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.students}
        subtitle={`${n.n(studentsQ.data?.total ?? 0)} ${t.studentsCount}`}
        actions={
          (user === "ADMIN" || user === "STAFF") && (
            <Button onClick={() => setRegOpen(true)}>
              <UserPlus className="h-4 w-4 me-1" /> {t.registerStudent}
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-2">
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t.selectClass} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.all}</SelectItem>
            {meta.data?.classrooms.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t.status} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.all}</SelectItem>
            <SelectItem value="فعال">{t.active}</SelectItem>
            <SelectItem value="ترک تحصیل">{t.left}</SelectItem>
            <SelectItem value="فارغ">{t.graduated}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {studentsQ.isLoading ? (
        <Loading rows={8} />
      ) : (
        <DataTable
          rows={students as unknown as Array<Record<string, unknown>>}
          searchPlaceholder={`${t.search}: ${t.studentNo} / ${t.firstName} / ${t.fatherName}`}
          searchKeys={["studentNo", "firstName", "fatherName", "guardianName", "guardianPhone"]}
          emptyText={t.noData}
          pageSize={12}
          columns={[
            { key: "studentNo", header: t.studentNo, render: (r) => <span dir="ltr">{(r as StudentRow).studentNo}</span> },
            {
              key: "name",
              header: t.firstName,
              render: (r) => (
                <button className="text-primary hover:underline font-medium" onClick={() => navigate.to(`#/students/${(r as StudentRow).id}`)}>
                  {(r as StudentRow).firstName}
                </button>
              ),
            },
            { key: "fatherName", header: t.fatherName, render: (r) => (r as StudentRow).fatherName },
            { key: "gender", header: t.gender, render: (r) => (r as StudentRow).gender },
            { key: "class", header: t.classroom, render: (r) => (r as StudentRow).activeEnrollment?.classroom.name ?? "—" },
            { key: "rollNo", header: t.rollNo, render: (r) => n.n((r as StudentRow).activeEnrollment?.rollNo ?? 0) },
            { key: "status", header: t.status, render: (r) => <StatusBadge status={(r as StudentRow).status} /> },
            {
              key: "actions",
              header: t.actions,
              render: (r) => (
                <Button size="sm" variant="outline" onClick={() => navigate.to(`#/students/${(r as StudentRow).id}`)}>
                  {t.view}
                </Button>
              ),
            },
          ]}
        />
      )}

      <RegisterStudentDialog open={regOpen} onClose={() => setRegOpen(false)} meta={meta.data} />
    </div>
  );
}

function useAppRole(): string {
  const user = useAppStore((s) => s.user);
  return user?.role ?? "STAFF";
}

function RegisterStudentDialog({ open, onClose, meta }: { open: boolean; onClose: () => void; meta: LookupResponse | undefined }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<StudentRow>>({ ...EMPTY_STUDENT });
  const [classroomId, setClassroomId] = useState("");
  const [uniform, setUniform] = useState({ top: true, bottom: true, cover: true });

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        gender: GENDER_UI2SRV[form.gender ?? "مذکر"] ?? form.gender,
        uniformItems: undefined,
        classroomId: undefined,
      };
      const res = await apiPost<{ item: { id: string } }>("/api/x/students", payload);
      if (classroomId) {
        const enr = await apiGet<{ items: unknown[] }>(`/api/x/enrollments?classroomId=${classroomId}&status=active`);
        await apiPost(`/api/x/students/${res.item.id}/enroll`, {
          classroomId,
          rollNo: (enr.items?.length ?? 0) + 1,
          uniformItems: [
            ...(uniform.top ? ["پیراهن"] : []),
            ...(uniform.bottom ? ["تنبان"] : []),
            ...(uniform.cover ? ["سرپوش"] : []),
          ],
        });
      }
      return res;
    },
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["lookup"] });
      setForm({ ...EMPTY_STUDENT });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const field = (key: keyof StudentRow, label: string, opts?: { dir?: string }) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={String(form[key] ?? "")} onChange={(e) => set(key, e.target.value)} dir={opts?.dir} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto nq-scroll">
        <DialogHeader>
          <DialogTitle>{t.registerStudent}</DialogTitle>
          <DialogDescription>{t.studentNo} به‌صورت خودکار جور می‌شود</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          {field("firstName", t.firstName)}
          {field("fatherName", t.fatherName)}
          {field("grandFatherName", t.grandFatherName)}
          {field("tash", t.tash)}
          <div className="space-y-1">
            <Label>{t.gender}</Label>
            <Select value={form.gender ?? "مذکر"} onValueChange={(v) => set("gender", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="مذکر">{t.male}</SelectItem>
                <SelectItem value="مؤنث">{t.female}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t.birthDate} <span className="text-[10px] text-muted-foreground">(1380-03-15)</span></Label>
            <Input value={form.birthDateJalali ?? ""} onChange={(e) => set("birthDateJalali", e.target.value)} dir="ltr" placeholder="1380-03-15" />
          </div>
          {field("birthProvince", t.birthProvince)}
          {field("birthDistrict", t.birthDistrict)}
          {field("province", t.province)}
          {field("district", t.district)}
          {field("village", t.village)}
          {field("address", t.address)}
          {field("tazkiraNo", t.tazkiraNo, { dir: "ltr" })}
          {field("guardianName", t.guardianName)}
          {field("guardianRelation", t.guardianRelation)}
          {field("guardianPhone", t.guardianPhone, { dir: "ltr" })}
          {field("phone2", t.phone2, { dir: "ltr" })}
          {field("previousSchool", t.previousSchool)}
        </div>
        <div className="space-y-1">
          <Label>{t.notes}</Label>
          <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>

        <div className="rounded-lg border p-3 space-y-3 bg-accent/40">
          <div className="font-semibold text-sm">{t.enroll}</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t.classroom}</Label>
              <Select value={classroomId} onValueChange={setClassroomId}>
                <SelectTrigger><SelectValue placeholder={t.selectClass} /></SelectTrigger>
                <SelectContent>
                  {meta?.classrooms.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t.uniformItems}</Label>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <Checkbox checked={uniform.top} onCheckedChange={(v) => setUniform((u) => ({ ...u, top: !!v }))} />
                  {t.uniformTop}
                </label>
                <label className="flex items-center gap-1.5">
                  <Checkbox checked={uniform.bottom} onCheckedChange={(v) => setUniform((u) => ({ ...u, bottom: !!v }))} />
                  {t.uniformBottom}
                </label>
                <label className="flex items-center gap-1.5">
                  <Checkbox checked={uniform.cover} onCheckedChange={(v) => setUniform((u) => ({ ...u, cover: !!v }))} />
                  {t.uniformCover}
                </label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.firstName || !form.fatherName}>
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ================= Student Profile =================

interface ProfileResponse {
  student: StudentRow;
  enrollments: {
    id: string; rollNo: number; enrolledAt: string; status: string; uniformItemsJson: string;
    classroom: { id: string; name: string; grade: number; level: string };
    academicYear: { id: string; name: string };
  }[];
  attendanceStats: { total: number; present: number; absent: number; sick: number; leave: number; percent: number };
  invoices: { id: string; monthKey: string; monthName: string; amount: number; discount: number; paidAmount: number; note: string }[];
  payments: { id: string; invoiceId: string; amount: number; date: string; method: string; receiptNo: string; note: string }[];
  summaries: { id: string; enrollmentId: string; academicYearId: string; total: number; average: number; rank: number; status: string }[];
  results: { id: string; enrollmentId: string; subjectId: string; total: number; grade: string; passed: boolean; subject: { nameDr: string } | null }[];
  notifications: { id: string; category: string; body: string; status: string; createdAt: string; phone: string }[];
}

/** raw shapes of GET /api/x/students/:id and /api/x/notifications?studentId */
interface XStudentDetail {
  student: Record<string, unknown>;
  enrollments: {
    id: string; rollNo: number; status: string; academicYearId: string; uniformItems: string | null; enrolledAt: string;
    classroom: { id: string; name: string; grade: number; section: string; level: string };
  }[];
  invoices: {
    id: string; monthKey: string; amount: number; discount: number; paidAmount: number; note: string | null;
    payments: { id: string; amount: number; date: string; method: string; receiptNo: string; note: string | null }[];
  }[];
  attendanceStats: { total: number; present: number; absent: number; sick: number; leave: number; percent: number };
  summaries: {
    id: string; enrollmentId: string; academicYearId: string; total: number; average: number; rank: number; status: string;
    results: { id: string; subjectId: string; total: number; grade: string; passed: boolean; subject: { id: string; nameDr: string; nameEn: string } }[];
  }[];
}

type PrintKind = "tazkira" | "idcard" | "regform" | "results" | null;

export function StudentProfilePage({ studentId }: { studentId: string }) {
  const { t, locale } = useT();
  const n = useN();
  const qc = useQueryClient();
  const [printKind, setPrintKind] = useState<PrintKind>(null);
  const meta = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<LookupResponse>("/api/x/lookup") });
  const q = useQuery({
    queryKey: ["student", studentId],
    queryFn: async (): Promise<ProfileResponse> => {
      const [d, notifs, lookup] = await Promise.all([
        apiGet<XStudentDetail>(`/api/x/students/${studentId}`),
        apiGet<{ items: { id: string; category: string; body: string; status: string; createdAt: string; phone: string | null }[] }>(
          `/api/x/notifications?studentId=${studentId}`,
        ),
        apiGet<LookupResponse>("/api/x/lookup"),
      ]);
      const yearsMap = new Map((lookup.years ?? []).map((y) => [y.id, y.name]));
      const s = d.student;
      const student = {
        ...(s as unknown as StudentRow),
        status: ST_SRV2UI[String(s.status)] ?? String(s.status),
        gender: GENDER_SRV2UI[String(s.gender)] ?? String(s.gender),
      } as StudentRow;
      const enrollments = (d.enrollments ?? []).map((e) => ({
        id: e.id,
        rollNo: e.rollNo,
        enrolledAt: String(e.enrolledAt ?? ""),
        status: ENR_SRV2UI[e.status] ?? e.status,
        uniformItemsJson: e.uniformItems ?? "[]",
        classroom: e.classroom,
        academicYear: { id: e.academicYearId, name: yearsMap.get(e.academicYearId) ?? "۱۴۰۵" },
      }));
      const invoices = (d.invoices ?? []).map((inv) => ({
        id: inv.id,
        monthKey: inv.monthKey,
        monthName: monthKeyLabel(inv.monthKey),
        amount: inv.amount,
        discount: inv.discount ?? 0,
        paidAmount: inv.paidAmount ?? 0,
        note: inv.note ?? "",
      }));
      const payments = (d.invoices ?? []).flatMap((inv) =>
        (inv.payments ?? []).map((p) => ({
          id: p.id,
          invoiceId: inv.id,
          amount: p.amount,
          date: String(p.date),
          method: p.method,
          receiptNo: p.receiptNo,
          note: p.note ?? "",
        })),
      );
      const summaries = (d.summaries ?? []).map((sm) => ({
        id: sm.id,
        enrollmentId: sm.enrollmentId,
        academicYearId: sm.academicYearId,
        total: sm.total,
        average: sm.average,
        rank: sm.rank,
        status: sm.status,
      }));
      const results = (d.summaries ?? []).flatMap((sm) =>
        (sm.results ?? []).map((r) => ({
          id: r.id,
          enrollmentId: sm.enrollmentId,
          subjectId: r.subjectId,
          total: r.total,
          grade: r.grade,
          passed: r.passed,
          subject: { nameDr: r.subject?.nameDr ?? "" },
        })),
      );
      const notifications = (notifs.items ?? []).map((nt) => ({
        id: nt.id,
        category: nt.category,
        body: nt.body,
        status: nt.status,
        createdAt: String(nt.createdAt),
        phone: nt.phone ?? "",
      }));
      return {
        student,
        enrollments,
        attendanceStats: d.attendanceStats ?? { total: 0, present: 0, absent: 0, sick: 0, leave: 0, percent: 0 },
        invoices,
        payments,
        summaries,
        results,
        notifications,
      };
    },
  });
  const save = useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiPut(`/api/x/students/${studentId}`, {
        ...data,
        status: ST_UI2SRV[data.status] ?? data.status,
        gender: GENDER_UI2SRV[data.gender] ?? data.gender,
        activeEnrollment: undefined,
      }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["student", studentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading || !q.data) return <Loading rows={8} />;
  const { student, enrollments, attendanceStats, invoices, payments, summaries, results, notifications } = q.data;
  const activeEnr = enrollments.find((e) => e.status === "فعال") ?? enrollments[0];
  const schoolInfo: SchoolHeaderInfo | null = meta.data?.school ?? null;

  const attTotal = attendanceStats.total;
  const attPresent = attendanceStats.present;
  const attPercent = attendanceStats.percent;
  const totalBilled = invoices.reduce((a, i) => a + i.amount - i.discount, 0);
  const totalPaid = invoices.reduce((a, i) => a + i.paidAmount, 0);
  const summary = summaries.find((s) => s.enrollmentId === activeEnr?.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => { window.location.hash = "#/students"; }}>
          <ArrowRight className="h-4 w-4 me-1" /> {t.back}
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{student.firstName} {student.fatherName}</h1>
          <p className="text-xs text-muted-foreground" dir="ltr">{student.studentNo}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setPrintKind("tazkira")}><Printer className="h-4 w-4 me-1" /> {t.printTazkiraCard}</Button>
          <Button size="sm" variant="outline" onClick={() => setPrintKind("idcard")}><Printer className="h-4 w-4 me-1" /> {t.printIdCard}</Button>
          <Button size="sm" variant="outline" onClick={() => setPrintKind("regform")}><Printer className="h-4 w-4 me-1" /> {t.printRegForm}</Button>
          <Button size="sm" variant="outline" onClick={() => setPrintKind("results")}><Printer className="h-4 w-4 me-1" /> {t.printResults}</Button>
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="info">{t.info}</TabsTrigger>
          <TabsTrigger value="attendance">{t.attendanceTab}</TabsTrigger>
          <TabsTrigger value="fees">{t.feesTab}</TabsTrigger>
          <TabsTrigger value="results">{t.resultsTab}</TabsTrigger>
          <TabsTrigger value="docs">{t.docsTab}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <InfoTab student={student} onSave={(d) => save.mutate(d)} />
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {t.attendanceTab}: {n.n(attTotal)} {t.days} — {t.attendancePercent}: {n.n(attPercent)}{t.percentSign}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto nq-scroll">
              {attTotal === 0 ? <EmptyState text={t.noData} /> : (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
                  <div className="rounded border p-2 text-center"><div className="text-muted-foreground">{t.presentDays}</div><b className="text-emerald-700">{n.n(attPresent)}</b></div>
                  <div className="rounded border p-2 text-center"><div className="text-muted-foreground">{t.absentDays}</div><b className="text-red-700">{n.n(attendanceStats.absent)}</b></div>
                  <div className="rounded border p-2 text-center"><div className="text-muted-foreground">{t.sick}</div><b>{n.n(attendanceStats.sick)}</b></div>
                  <div className="rounded border p-2 text-center"><div className="text-muted-foreground">{t.leave}</div><b>{n.n(attendanceStats.leave)}</b></div>
                  <div className="rounded border p-2 text-center"><div className="text-muted-foreground">{t.attendancePercent}</div><b>{n.n(attPercent)}{t.percentSign}</b></div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees" className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{t.total} شقه</div><div className="font-bold">{formatAFN(totalBilled, locale)}</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{t.payments}</div><div className="font-bold text-emerald-700">{formatAFN(totalPaid, locale)}</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{t.balance}</div><div className="font-bold text-red-700">{formatAFN(totalBilled - totalPaid, locale)}</div></div>
          </div>
          <DataTable
            rows={invoices as unknown as Array<Record<string, unknown>>}
            searchable={false}
            emptyText={t.noData}
            pageSize={10}
            columns={[
              { key: "monthName", header: t.month, render: (r) => (r as ProfileResponse["invoices"][0]).monthName },
              { key: "amount", header: t.amount, render: (r) => formatAFN((r as ProfileResponse["invoices"][0]).amount) },
              { key: "discount", header: t.discount, render: (r) => formatAFN((r as ProfileResponse["invoices"][0]).discount) },
              { key: "paid", header: t.payments, render: (r) => formatAFN((r as ProfileResponse["invoices"][0]).paidAmount) },
              {
                key: "remaining", header: t.balance,
                render: (r) => {
                  const inv = r as ProfileResponse["invoices"][0];
                  const rem = inv.amount - inv.discount - inv.paidAmount;
                  return <span className={rem > 0 ? "text-red-700 font-semibold" : "text-emerald-700"}>{formatAFN(rem)}</span>;
                },
              },
              {
                key: "status", header: t.invoiceStatus,
                render: (r) => {
                  const inv = r as ProfileResponse["invoices"][0];
                  const rem = inv.amount - inv.discount - inv.paidAmount;
                  return <StatusBadge status={rem <= 0 ? t.paid : inv.paidAmount > 0 ? t.partial : t.unpaid} />;
                },
              },
            ]}
          />
          <h3 className="font-semibold text-sm pt-2">{t.payments}</h3>
          <DataTable
            rows={payments as unknown as Array<Record<string, unknown>>}
            searchable={false}
            emptyText={t.noData}
            pageSize={8}
            columns={[
              { key: "receiptNo", header: t.receiptNo, render: (r) => <span dir="ltr">{(r as ProfileResponse["payments"][0]).receiptNo}</span> },
              { key: "date", header: t.date, render: (r) => <JalaliDate iso={(r as ProfileResponse["payments"][0]).date} /> },
              { key: "amount", header: t.amount, render: (r) => formatAFN((r as ProfileResponse["payments"][0]).amount) },
              { key: "method", header: t.method, render: (r) => (r as ProfileResponse["payments"][0]).method },
            ]}
          />
        </TabsContent>

        <TabsContent value="results" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {t.resultsTab} {summary ? `— ${t.average}: ${n.n(summary.average)} | ${t.rank}: ${n.n(summary.rank)} | ` : ""}
                {summary && <StatusBadge status={summary.status} />}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto nq-scroll">
              {results.length === 0 ? <EmptyState text={t.noData} /> : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="py-1.5 text-start">{t.subject}</th>
                      <th className="py-1.5">{t.total}</th>
                      <th className="py-1.5">{t.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.filter((r) => r.enrollmentId === activeEnr?.id).map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-1.5">{r.subject?.nameDr}</td>
                        <td className="py-1.5 text-center font-semibold">{n.n(r.total)}</td>
                        <td className="py-1.5 text-center"><StatusBadge status={r.grade} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{t.docsTab}</CardTitle></CardHeader>
            <CardContent className="max-h-96 overflow-y-auto nq-scroll">
              {notifications.length === 0 ? <EmptyState text={t.noData} /> : (
                <ul className="space-y-2">
                  {notifications.map((nt) => (
                    <li key={nt.id} className="rounded border p-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{nt.category}</span>
                        <StatusBadge status={nt.status} />
                      </div>
                      <p className="text-muted-foreground">{nt.body}</p>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span dir="ltr">{nt.phone}</span>
                        <JalaliDate iso={nt.createdAt} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {printKind === "tazkira" && (
        <PrintOverlay title={t.printTazkiraCard} onClose={() => setPrintKind(null)}>
          <TazkiraCardPrint school={schoolInfo} student={student} enrollment={activeEnr} results={results} summary={summary} />
        </PrintOverlay>
      )}
      {printKind === "idcard" && (
        <PrintOverlay title={t.printIdCard} onClose={() => setPrintKind(null)}>
          <IdCardPrint school={schoolInfo} student={student} enrollment={activeEnr} />
        </PrintOverlay>
      )}
      {printKind === "regform" && (
        <PrintOverlay title={t.printRegForm} onClose={() => setPrintKind(null)}>
          <RegFormPrint school={schoolInfo} student={student} enrollment={activeEnr} copies />
        </PrintOverlay>
      )}
      {printKind === "results" && (
        <PrintOverlay title={t.printResults} onClose={() => setPrintKind(null)}>
          <ResultsNoticePrint school={schoolInfo} student={student} enrollment={activeEnr} results={results} summary={summary} />
        </PrintOverlay>
      )}
    </div>
  );
}

function InfoTab({ student, onSave }: { student: StudentRow; onSave: (d: Record<string, string>) => void }) {
  const { t } = useT();
  const [form, setForm] = useState<Partial<StudentRow>>({ ...student });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = (key: keyof StudentRow, label: string, dir?: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={String(form[key] ?? "")} onChange={(e) => set(key, e.target.value)} dir={dir} />
    </div>
  );
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {field("firstName", t.firstName)}
          {field("fatherName", t.fatherName)}
          {field("grandFatherName", t.grandFatherName)}
          {field("tash", t.tash)}
          <div className="space-y-1">
            <Label>{t.gender}</Label>
            <Select value={form.gender ?? "مذکر"} onValueChange={(v) => set("gender", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="مذکر">{t.male}</SelectItem>
                <SelectItem value="مؤنث">{t.female}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field("birthDateJalali", `${t.birthDate}`, "ltr")}
          {field("birthProvince", t.birthProvince)}
          {field("birthDistrict", t.birthDistrict)}
          {field("province", t.province)}
          {field("district", t.district)}
          {field("village", t.village)}
          {field("address", t.address)}
          {field("tazkiraNo", t.tazkiraNo, "ltr")}
          {field("guardianName", t.guardianName)}
          {field("guardianRelation", t.guardianRelation)}
          {field("guardianPhone", t.guardianPhone, "ltr")}
          {field("phone2", t.phone2, "ltr")}
          {field("previousSchool", t.previousSchool)}
          <div className="space-y-1">
            <Label>{t.status}</Label>
            <Select value={form.status ?? "فعال"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="فعال">{t.active}</SelectItem>
                <SelectItem value="ترک تحصیل">{t.left}</SelectItem>
                <SelectItem value="فارغ">{t.graduated}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>{t.notes}</Label>
          <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <Button onClick={() => onSave(form as Record<string, string>)}>{t.save}</Button>
      </CardContent>
    </Card>
  );
}

// ============== Printables ==============

function TazkiraCardPrint({
  school, student, enrollment, results, summary,
}: {
  school: SchoolHeaderInfo | null;
  student: StudentRow;
  enrollment?: ProfileResponse["enrollments"][0];
  results: ProfileResponse["results"];
  summary?: ProfileResponse["summaries"][0];
}) {
  const n = useN();
  const rows: [string, string][] = [
    ["نام و نام پدر", `${student.firstName} ${student.fatherName}`],
    ["نام پدرکلان", student.grandFatherName],
    ["قومیت", student.tash],
    ["جنس", student.gender],
    ["تاریخ تولد", student.birthDateJalali],
    ["ولایت تولد", `${student.birthProvince} / ${student.birthDistrict}`],
    ["مقیم", `${student.province}، ${student.district}`],
    ["نمبر کارت سوانح", student.tazkiraNo],
    ["نمبر متعلم", student.studentNo],
    ["صنف", enrollment?.classroom.name ?? ""],
    ["نمبر پشت", String(n.eastern(enrollment?.rollNo ?? 0))],
    ["نام ولی", `${student.guardianName} (${student.guardianRelation})`],
    ["شماره تماس", student.guardianPhone],
  ];
  return (
    <div>
      <DocLetterhead school={school} />
      <div className="text-center font-bold mb-2">کارت سوانح متعلم</div>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="w-40 font-semibold bg-gray-50">{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {results.length > 0 && (
        <>
          <div className="font-bold mt-4 mb-1">نتایج امتحانات</div>
          <table>
            <thead>
              <tr>
                <th>مضمون</th>
                <th>نمره از ۱۰۰</th>
                <th>درجه</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>{r.subject?.nameDr}</td>
                  <td>{n.eastern(r.total)}</td>
                  <td>{r.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary && (
            <div className="mt-2 text-xs">
              میانگین: {n.eastern(summary.average)} — مقام: {n.eastern(summary.rank)} — وضعیت: {summary.status}
            </div>
          )}
        </>
      )}
      <SignatureRow left="امضای مدیر" right="امضای ولی" />
    </div>
  );
}

function IdCardPrint({
  school, student, enrollment,
}: {
  school: SchoolHeaderInfo | null;
  student: StudentRow;
  enrollment?: ProfileResponse["enrollments"][0];
}) {
  return (
    <div className="flex justify-center py-4">
      <div className="w-72 rounded-xl border-2 border-black overflow-hidden">
        <div className="bg-teal-700 text-white text-center py-2">
          <div className="font-bold text-sm">{school?.name ?? "مکتب خصوصی نداالقلم"}</div>
          <div className="text-[9px]">ایدی کارت متعلم — سال تعلیمی {enrollment?.academicYear.name ?? "۱۴۰۵"}</div>
        </div>
        <div className="p-3 flex gap-3">
          <div className="w-20 h-24 rounded border border-dashed flex items-center justify-center text-[9px] text-gray-500 bg-gray-50">
            عکس
          </div>
          <div className="text-[11px] space-y-1 flex-1">
            <div className="font-bold">{student.firstName} {student.fatherName}</div>
            <div>صنف: {enrollment?.classroom.name ?? "—"}</div>
            <div>پشت: {enrollment?.rollNo ?? "—"}</div>
            <div dir="ltr" className="text-start">{student.studentNo}</div>
            <div>ولی: {student.guardianName}</div>
          </div>
        </div>
        <div className="text-center text-[9px] pb-2 text-gray-600">
          تحت پوشش وزارت معارف افغانستان
        </div>
      </div>
    </div>
  );
}

function RegFormPrint({
  school, student, enrollment, copies,
}: {
  school: SchoolHeaderInfo | null;
  student: StudentRow;
  enrollment?: ProfileResponse["enrollments"][0];
  copies?: boolean;
}) {
  const items = useMemo(() => {
    try {
      return JSON.parse(enrollment?.uniformItemsJson ?? "[]") as string[];
    } catch {
      return [];
    }
  }, [enrollment?.uniformItemsJson]);
  const checkbox = (label: string) => (items.includes(label) ? "[✓]" : "[ ]");
  const oneForm = (copyLabel: string) => (
    <div className="mb-8 border-2 border-black p-4">
      <div className="text-center text-[10px] border border-black w-fit px-3 py-0.5 mb-2 mx-auto">{copyLabel}</div>
      <DocLetterhead school={school} />
      <div className="text-center font-bold mb-2">فورم ثبت‌نام و تحویل سه پارچه یونیفورم</div>
      <table>
        <tbody>
          <tr><td className="w-44 bg-gray-50 font-semibold">نام متعلم</td><td>{student.firstName}</td><td className="w-36 bg-gray-50 font-semibold">نام پدر</td><td>{student.fatherName}</td></tr>
          <tr><td className="bg-gray-50 font-semibold">نمبر متعلم</td><td dir="ltr">{student.studentNo}</td><td className="bg-gray-50 font-semibold">صنف</td><td>{enrollment?.classroom.name ?? ""}</td></tr>
          <tr><td className="bg-gray-50 font-semibold">نام ولی</td><td>{student.guardianName}</td><td className="bg-gray-50 font-semibold">تماس</td><td dir="ltr">{student.guardianPhone}</td></tr>
          <tr><td className="bg-gray-50 font-semibold">آدرس</td><td colSpan={3}>{student.province}، {student.district} {student.village}</td></tr>
        </tbody>
      </table>
      <div className="mt-3 font-semibold text-xs">اجناس تحویل‌شده (سه پارچه یونیفورم):</div>
      <div className="flex gap-6 text-xs mt-1">
        <span>{checkbox("پیراهن")} پیراهن</span>
        <span>{checkbox("تنبان")} تنبان</span>
        <span>{checkbox("سرپوش")} سرپوش</span>
      </div>
      <p className="text-[10px] mt-2 text-gray-700">
        رسید تحویل اجناس ثبت‌نام متعلم در سال تعلیمی {enrollment?.academicYear.name ?? "۱۴۰۵"}. این فورم در سه نسخه تکثیر شده: نسخه مکتب، نسخه والدین، نسخه اسناد.
      </p>
      <SignatureRow left="امضای مدیر" right="امضای ولی" />
    </div>
  );

  if (!copies) return <>{oneForm("نسخه مکتب")}</>;
  return (
    <div>
      {oneForm("نسخه مکتب")}
      {oneForm("نسخه والدین")}
      {oneForm("نسخه اسناد")}
    </div>
  );
}

function ResultsNoticePrint({
  school, student, enrollment, results, summary,
}: {
  school: SchoolHeaderInfo | null;
  student: StudentRow;
  enrollment?: ProfileResponse["enrollments"][0];
  results: ProfileResponse["results"];
  summary?: ProfileResponse["summaries"][0];
}) {
  const n = useN();
  const enrResults = results.filter((r) => r.enrollmentId === enrollment?.id);
  return (
    <div>
      <DocLetterhead school={school} />
      <div className="text-center font-bold mb-2">اطلاعنامه نتایج امتحانی</div>
      <table className="mb-3">
        <tbody>
          <tr><td className="w-40 bg-gray-50 font-semibold">متعلم</td><td>{student.firstName} {student.fatherName}</td><td className="w-32 bg-gray-50 font-semibold">صنف</td><td>{enrollment?.classroom.name ?? ""}</td></tr>
          <tr><td className="bg-gray-50 font-semibold">نمبر متعلم</td><td dir="ltr">{student.studentNo}</td><td className="bg-gray-50 font-semibold">سال تعلیمی</td><td>{enrollment?.academicYear.name ?? "۱۴۰۵"}</td></tr>
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>مضمون</th>
            <th>نمره از ۱۰۰</th>
            <th>درجه</th>
            <th>وضعیت</th>
          </tr>
        </thead>
        <tbody>
          {enrResults.map((r, i) => (
            <tr key={r.id}>
              <td>{n.eastern(i + 1)}</td>
              <td>{r.subject?.nameDr}</td>
              <td>{n.eastern(r.total)}</td>
              <td>{r.grade}</td>
              <td>{r.passed ? "قبول" : "مردود"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {summary && (
        <div className="mt-3 text-xs space-y-0.5">
          <div>مجموع نمرات: {n.eastern(summary.total)} — میانگین: {n.eastern(summary.average)} از ۱۰۰</div>
          <div>مقام در صنف: {n.eastern(summary.rank)} — وضعیت نهایی: <b>{summary.status}</b></div>
        </div>
      )}
      <SignatureRow left="امضای معلم" right="امضای مدیر" />
    </div>
  );
}
