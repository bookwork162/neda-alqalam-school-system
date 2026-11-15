"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Star, ArrowLeftRight } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/components/app/api";
import { useN, useT } from "@/components/app/store";
import { DataTable, JalaliDate, Loading, PageHeader, StatusBadge } from "@/components/app/ui";
import { formatAFN } from "@/lib/money";

interface LookupResponse {
  years: { id: string; name: string; isCurrent: boolean }[];
  classrooms: { id: string; name: string; grade: number; section: string; level: string; academicYearId: string }[];
  subjects: { id: string; nameDr: string; namePs: string; nameEn: string }[];
  staff: { id: string; name: string; position: string }[];
  studentsMinimal: { id: string; studentNo: string; firstName: string; fatherName: string }[];
}

/** enrollment status: server active/completed/transferred/left ↔ UI Persian */
const ENR_SRV2UI: Record<string, string> = { active: "فعال", completed: "تکمیل", transferred: "انتقال", left: "ترک تحصیل" };
const ENR_UI2SRV: Record<string, string> = { "فعال": "active", "ترک تحصیل": "left" };

export function AdminPage() {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <PageHeader title={t.adminManagement} />
      <Tabs defaultValue="years">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="years">{t.academicYears}</TabsTrigger>
          <TabsTrigger value="classes">{t.classes}</TabsTrigger>
          <TabsTrigger value="subjects">{t.subjects}</TabsTrigger>
          <TabsTrigger value="enrollment">{t.enrollment}</TabsTrigger>
        </TabsList>
        <TabsContent value="years" className="mt-4"><YearsTab /></TabsContent>
        <TabsContent value="classes" className="mt-4"><ClassesTab /></TabsContent>
        <TabsContent value="subjects" className="mt-4"><SubjectsTab /></TabsContent>
        <TabsContent value="enrollment" className="mt-4"><EnrollmentTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function YearsTab() {
  const { t } = useT();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const q = useQuery({
    queryKey: ["years"],
    queryFn: async () => {
      const res = await apiGet<{ items: { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }[] }>("/api/x/years");
      const years = res.items ?? [];
      return { years, currentYearId: years.find((y) => y.isCurrent)?.id ?? null };
    },
  });
  const create = useMutation({
    mutationFn: () => apiPost("/api/x/years", { name, startDate, endDate }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["years"] });
      qc.invalidateQueries({ queryKey: ["lookup"] });
      setName(""); setStartDate(""); setEndDate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const setCurrent = useMutation({
    mutationFn: (id: string) => apiPut(`/api/x/years/${id}`, { isCurrent: true }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["years"] });
      qc.invalidateQueries({ queryKey: ["lookup"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{t.new} {t.year}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label>{t.year}</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="1406" className="w-28" dir="ltr" /></div>
          <div className="space-y-1"><Label>{t.from}</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} dir="ltr" className="w-40" /></div>
          <div className="space-y-1"><Label>{t.to}</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} dir="ltr" className="w-40" /></div>
          <Button onClick={() => create.mutate()} disabled={!name || !startDate || !endDate}><Plus className="h-4 w-4 me-1" />{t.add}</Button>
        </CardContent>
      </Card>
      {q.isLoading ? (
        <Loading rows={3} />
      ) : (
        <DataTable
          rows={(q.data?.years ?? []) as unknown as Array<Record<string, unknown>>}
          searchable={false}
          emptyText={t.noData}
          columns={[
            { key: "name", header: t.year, render: (r) => <span dir="ltr" className="font-bold">{(r as { name: string }).name}</span> },
            { key: "startDate", header: t.from, render: (r) => <JalaliDate iso={(r as { startDate: string }).startDate} /> },
            { key: "endDate", header: t.to, render: (r) => <JalaliDate iso={(r as { endDate: string }).endDate} /> },
            {
              key: "current", header: t.status,
              render: (r) => ((r as { isCurrent: boolean }).isCurrent ? <Badge className="bg-emerald-600">{t.currentYear}</Badge> : <span className="text-muted-foreground text-xs">—</span>),
            },
            {
              key: "actions", header: t.actions,
              render: (r) => {
                const y = r as { id: string; isCurrent: boolean };
                return !y.isCurrent ? (
                  <Button size="sm" variant="outline" onClick={() => setCurrent.mutate(y.id)}><Star className="h-3.5 w-3.5 me-1" />{t.setCurrent}</Button>
                ) : null;
              },
            },
          ]}
        />
      )}
    </div>
  );
}

function ClassesTab() {
  const { t } = useT();
  const n = useN();
  const qc = useQueryClient();
  const meta = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<LookupResponse>("/api/x/lookup") });
  const currentYearId = meta.data?.years.find((y) => y.isCurrent)?.id ?? meta.data?.years[0]?.id ?? "";
  // enrollment counts per classroom (single call)
  const enrQ = useQuery({
    queryKey: ["enrollments-all"],
    queryFn: () => apiGet<{ items: { classroomId: string }[] }>("/api/x/enrollments?take=2000"),
  });
  const classesQ = useQuery({
    queryKey: ["classrooms", enrQ.data],
    queryFn: async () => {
      const res = await apiGet<{ items: (LookupResponse["classrooms"][0] & { activeCount?: number })[] }>("/api/x/classrooms");
      const counts = new Map<string, number>();
      for (const e of enrQ.data?.items ?? []) counts.set(e.classroomId, (counts.get(e.classroomId) ?? 0) + 1);
      return { classrooms: (res.items ?? []).map((c) => ({ ...c, activeCount: counts.get(c.id) ?? 0 })) };
    },
    enabled: !!enrQ.data,
  });
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("الف");
  const [selected, setSelected] = useState<string>("");

  const create = useMutation({
    mutationFn: () => apiPost("/api/x/classrooms", { academicYearId: currentYearId, grade: parseInt(grade), section }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["classrooms"] });
      qc.invalidateQueries({ queryKey: ["lookup"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/x/classrooms/${id}`),
    onSuccess: () => {
      toast.success(t.deleted);
      qc.invalidateQueries({ queryKey: ["classrooms"] });
      qc.invalidateQueries({ queryKey: ["lookup"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sel = classesQ.data?.classrooms.find((c) => c.id === selected);

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm">{t.classes}</CardTitle>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label>{t.grade}</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger className="w-32"><SelectValue placeholder={t.grade} /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                    <SelectItem key={g} value={String(g)}>صنف {n.eastern(g)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t.section}</Label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{["الف", "ب", "ج"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={() => create.mutate()} disabled={!grade}><Plus className="h-4 w-4 me-1" />{t.add}</Button>
          </div>
        </CardHeader>
        <CardContent className="max-h-[420px] overflow-y-auto nq-scroll">
          {classesQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <ul className="space-y-1.5">
              {classesQ.data?.classrooms.map((c) => (
                <li
                  key={c.id}
                  className={`flex items-center justify-between rounded-md border p-2.5 text-sm cursor-pointer hover:bg-accent ${selected === c.id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => setSelected(c.id)}
                >
                  <div>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-[10px] text-muted-foreground ms-2">({c.level})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{n.n(c.activeCount)} {t.studentsCount}</Badge>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remove.mutate(c.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <ClassSubjectsPanel classroomId={selected} classroomName={sel?.name ?? ""} meta={meta.data} />
    </div>
  );
}

function ClassSubjectsPanel({ classroomId, classroomName, meta }: { classroomId: string; classroomName: string; meta: LookupResponse | undefined }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [subjectId, setSubjectId] = useState("");
  const [staffId, setStaffId] = useState("");
  const q = useQuery({
    queryKey: ["class-subjects", classroomId],
    queryFn: () =>
      apiGet<{ items: { id: string; subjectId: string; staffId: string | null; subject: { nameDr: string } | null; staff: { name: string } | null }[] }>(
        `/api/x/classSubjects?classroomId=${classroomId}`,
      ),
    enabled: classroomId !== "",
  });
  const add = useMutation({
    mutationFn: () => apiPost("/api/x/classSubjects", { classroomId, subjectId, staffId: staffId || undefined }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["class-subjects", classroomId] });
      qc.invalidateQueries({ queryKey: ["lookup"] });
      setSubjectId(""); setStaffId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateStaff = useMutation({
    mutationFn: (p: { id: string; staffId: string | null }) => apiPut(`/api/x/classSubjects/${p.id}`, { staffId: p.staffId }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["class-subjects", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/x/classSubjects/${id}`),
    onSuccess: () => {
      toast.success(t.deleted);
      qc.invalidateQueries({ queryKey: ["class-subjects", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t.subjects} — {classroomName || t.selectClass}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!classroomId ? (
          <p className="text-sm text-muted-foreground">{t.selectClass}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label>{t.subject}</Label>
                <Select value={subjectId} onValueChange={setSubjectId}>
                  <SelectTrigger className="w-44"><SelectValue placeholder={t.subject} /></SelectTrigger>
                  <SelectContent>
                    {meta?.subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.nameDr}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t.teacher}</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger className="w-44"><SelectValue placeholder={t.teacher} /></SelectTrigger>
                  <SelectContent>
                    {meta?.staff.filter((s) => s.position === "معلم" || s.position === "مدیر").map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => add.mutate()} disabled={!subjectId}><Plus className="h-4 w-4 me-1" />{t.add}</Button>
            </div>
            {q.isLoading ? (
              <Loading rows={4} />
            ) : (
              <ul className="space-y-1.5 max-h-72 overflow-y-auto nq-scroll">
                {(q.data?.items ?? []).map((cs) => (
                  <li key={cs.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                    <span className="font-medium">{cs.subject?.nameDr}</span>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={cs.staffId ?? ""}
                        onValueChange={(v) => updateStaff.mutate({ id: cs.id, staffId: v || null })}
                      >
                        <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder={t.teacher} /></SelectTrigger>
                        <SelectContent>
                          {meta?.staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(cs.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  </li>
                ))}
                {(q.data?.items ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t.noClassSubjects}</p>}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SubjectsTab() {
  const { t } = useT();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const meta = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<LookupResponse>("/api/x/lookup") });
  const create = useMutation({
    mutationFn: () => apiPost("/api/x/subjects", { nameDr: name, namePs: name, nameEn: name }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["lookup"] });
      setName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/x/subjects/${id}`),
    onSuccess: () => {
      toast.success(t.deleted);
      qc.invalidateQueries({ queryKey: ["lookup"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{t.new} {t.subject}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="space-y-1 flex-1 max-w-xs"><Label>{t.name}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Button onClick={() => create.mutate()} disabled={!name}><Plus className="h-4 w-4 me-1" />{t.add}</Button>
        </CardContent>
      </Card>
      <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {meta.data?.subjects.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded border p-2.5 text-sm">
            <span>{s.nameDr}</span>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}><Trash2 className="h-3.5 w-3.5 text-red-600" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EnrollmentTab() {
  const { t } = useT();
  const n = useN();
  const qc = useQueryClient();
  const meta = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<LookupResponse>("/api/x/lookup") });
  const [classroomId, setClassroomId] = useState("");
  const enrQ = useQuery({
    queryKey: ["enrollments", classroomId],
    queryFn: () =>
      apiGet<{ items: { id: string; rollNo: number; status: string; student: { id: string; studentNo: string; firstName: string; fatherName: string; guardianPhone: string | null }; classroom: { name: string } }[]; total: number }>(
        `/api/x/enrollments?classroomId=${classroomId}&take=200`,
      ),
    enabled: classroomId !== "",
  });
  const enrollments = (enrQ.data?.items ?? []).map((e) => ({
    ...e,
    status: ENR_SRV2UI[e.status] ?? e.status,
  }));

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [enrollClassId, setEnrollClassId] = useState("");

  const enroll = useMutation({
    mutationFn: async () => {
      const existing = await apiGet<{ items: unknown[] }>(
        `/api/x/enrollments?classroomId=${enrollClassId}&status=active&take=2000`,
      );
      return apiPost("/api/x/enrollments", {
        studentId,
        classroomId: enrollClassId,
        rollNo: (existing.items?.length ?? 0) + 1,
      });
    },
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["enrollments"] });
      qc.invalidateQueries({ queryKey: ["enrollments-all"] });
      qc.invalidateQueries({ queryKey: ["lookup"] });
      setEnrollOpen(false);
      setStudentId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const doAction = useMutation({
    mutationFn: (p: { id: string; action: string; classroomId?: string; status?: string }) =>
      p.action === "transfer"
        ? apiPut(`/api/x/enrollments/${p.id}`, { classroomId: p.classroomId })
        : apiPut(`/api/x/enrollments/${p.id}`, { status: p.status ? ENR_UI2SRV[p.status] ?? p.status : undefined }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["enrollments"] });
      qc.invalidateQueries({ queryKey: ["enrollments-all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>{t.selectClass}</Label>
          <Select value={classroomId} onValueChange={setClassroomId}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t.selectClass} /></SelectTrigger>
            <SelectContent>
              {meta.data?.classrooms.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setEnrollOpen(true)}><Plus className="h-4 w-4 me-1" />{t.enroll}</Button>
      </div>
      {classroomId ? (
        enrQ.isLoading ? (
          <Loading rows={6} />
        ) : (
          <DataTable
            rows={enrollments as unknown as Array<Record<string, unknown>>}
            searchable={false}
            emptyText={t.noData}
            pageSize={15}
            columns={[
              { key: "rollNo", header: t.rollNo, render: (r) => n.n((r as { rollNo: number }).rollNo) },
              { key: "name", header: t.student, render: (r) => { const e = r as { student: { firstName: string; fatherName: string } }; return `${e.student.firstName} ${e.student.fatherName}`; } },
              { key: "studentNo", header: t.studentNo, render: (r) => <span dir="ltr">{(r as { student: { studentNo: string } }).student.studentNo}</span> },
              { key: "phone", header: t.phone, render: (r) => <span dir="ltr">{(r as { student: { guardianPhone: string } }).student.guardianPhone}</span> },
              { key: "status", header: t.status, render: (r) => <StatusBadge status={(r as { status: string }).status} /> },
              {
                key: "actions", header: t.actions,
                render: (r) => {
                  const e = r as { id: string; status: string };
                  if (e.status !== "فعال") return null;
                  return (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => doAction.mutate({ id: e.id, action: "setStatus", status: "ترک تحصیل" })}>
                        {t.left}
                      </Button>
                      <TransferDialog classrooms={meta.data?.classrooms ?? []} onTransfer={(to) => doAction.mutate({ id: e.id, action: "transfer", classroomId: to })} />
                    </div>
                  );
                },
              },
            ]}
          />
        )
      ) : (
        <p className="text-sm text-muted-foreground">{t.selectClass}</p>
      )}

      <Dialog open={enrollOpen} onOpenChange={(v) => !v && setEnrollOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t.enroll}</DialogTitle><DialogDescription>شمولیت متعلم در صنف سال جاری</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t.student}</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder={t.student} /></SelectTrigger>
                <SelectContent>
                  {(meta.data?.studentsMinimal ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}><span dir="ltr">{s.studentNo}</span> — {s.firstName} {s.fatherName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t.classroom}</Label>
              <Select value={enrollClassId} onValueChange={setEnrollClassId}>
                <SelectTrigger><SelectValue placeholder={t.selectClass} /></SelectTrigger>
                <SelectContent>
                  {meta.data?.classrooms.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollOpen(false)}>{t.cancel}</Button>
            <Button onClick={() => enroll.mutate()} disabled={!studentId || !enrollClassId}>{t.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TransferDialog({ classrooms, onTransfer }: { classrooms: { id: string; name: string }[]; onTransfer: (classroomId: string) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><ArrowLeftRight className="h-3.5 w-3.5" /></Button>
      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t.transfer}</DialogTitle></DialogHeader>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger><SelectValue placeholder={t.selectClass} /></SelectTrigger>
            <SelectContent>
              {classrooms.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={() => { onTransfer(to); setOpen(false); }} disabled={!to}>{t.confirm}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
