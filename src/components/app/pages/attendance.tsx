"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Save, MessageSquare, Printer } from "lucide-react";
import { apiGet, apiPost } from "@/components/app/api";
import { useApp, useN, useT } from "@/components/app/store";
import { DataTable, JalaliDate, Loading, PageHeader } from "@/components/app/ui";
import { PrintOverlay, DocLetterhead, SchoolHeaderInfo } from "@/components/app/printable";
import { jalaliMonthName, lastMonthKeys, todayISO, jalaliMonthDates } from "@/lib/date";

interface LookupResponse {
  classrooms: { id: string; name: string; grade: number }[];
  school: { name: string } | null;
  templates: { id: string; key: string; category: string; bodyDr: string }[];
}

type Status = "حاضر" | "غایب" | "مریض" | "رخصتی";
const STATUSES: Status[] = ["حاضر", "غایب", "مریض", "رخصتی"];
const STATUS_COLORS: Record<string, string> = {
  "حاضر": "bg-emerald-600 text-white",
  "غایب": "bg-red-600 text-white",
  "مریض": "bg-amber-500 text-white",
  "رخصتی": "bg-gray-500 text-white",
};

function JalaliMonthSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const keys = useMemo(() => lastMonthKeys(12).reverse(), []);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
      <SelectContent>
        {keys.map((k) => (
          <SelectItem key={k} value={k}>{jalaliMonthName(k)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AttendancePage() {
  const { t } = useT();
  const user = useApp((s) => s.user);
  const canStaff = user?.role === "ADMIN";
  return (
    <div className="space-y-4">
      <PageHeader title={t.studentAttendance} />
      <Tabs defaultValue="daily">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="daily">حاضری روزانه</TabsTrigger>
          <TabsTrigger value="month">{t.monthlySheet}</TabsTrigger>
          <TabsTrigger value="report">راپور ماهانه</TabsTrigger>
          {canStaff && <TabsTrigger value="staff">{t.staffAttendance}</TabsTrigger>}
        </TabsList>
        <TabsContent value="daily" className="mt-4"><DailyAttendance /></TabsContent>
        <TabsContent value="month" className="mt-4"><MonthlySheet /></TabsContent>
        <TabsContent value="report" className="mt-4"><MonthlyReport /></TabsContent>
        {canStaff && <TabsContent value="staff" className="mt-4"><StaffAttendance /></TabsContent>}
      </Tabs>
    </div>
  );
}

function DailyAttendance() {
  const { t } = useT();
  const qc = useQueryClient();
  const [classroomId, setClassroomId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [records, setRecords] = useState<Record<string, { status: string; note: string }>>({});
  const [gridKey, setGridKey] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const meta = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<LookupResponse>("/api/x/lookup") });
  const grid = useQuery({
    queryKey: ["att-grid", classroomId, date],
    queryFn: async () => {
      const res = await apiGet<{
        date: string;
        rows: { enrollmentId: string; studentNo: string; name: string; fatherName: string; rollNo: number; status: string | null; note: string | null }[];
      }>(`/api/x/attendance/grid?kind=student&classroomId=${classroomId}&date=${date}`);
      const enrollments = (res.rows ?? []).map((r) => ({
        id: r.enrollmentId,
        rollNo: r.rollNo,
        studentName: r.name,
        studentNo: r.studentNo,
        guardianPhone: "",
      }));
      const recs: Record<string, { status: string; note: string }> = {};
      for (const r of res.rows ?? []) {
        if (r.status) recs[r.enrollmentId] = { status: r.status, note: r.note ?? "" };
      }
      setRecords(recs);
      setGridKey(`${classroomId}|${date}`);
      return { enrollments, rows: res.rows ?? [] };
    },
    enabled: classroomId !== "",
  });

  // enrollment list (student ids + guardian phones) for notify-absent
  const enrQ = useQuery({
    queryKey: ["enr-list", classroomId],
    queryFn: () =>
      apiGet<{ items: { id: string; student: { id: string; firstName: string; guardianPhone: string | null } }[] }>(
        `/api/x/enrollments?classroomId=${classroomId}&status=active`,
      ),
    enabled: classroomId !== "",
  });

  const save = useMutation({
    mutationFn: () =>
      apiPost("/api/x/attendance/bulk", {
        kind: "student",
        date,
        classroomId,
        rows:
          grid.data?.enrollments.map((e) => ({
            enrollmentId: e.id,
            status: records[e.id]?.status ?? "حاضر",
            note: records[e.id]?.note || undefined,
          })) ?? [],
      }),
    onSuccess: () => {
      toast.success(t.savedAttendance);
      qc.invalidateQueries({ queryKey: ["att-grid"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const notify = useMutation({
    mutationFn: async () => {
      const absentRows = (grid.data?.rows ?? []).filter((r) => r.status === "غایب");
      const tpl = (meta.data?.templates ?? []).find((x) => x.key === "attendance_absent")?.bodyDr ?? "";
      if (!tpl) throw new Error(t.notFound);
      const className = meta.data?.classrooms.find((c) => c.id === classroomId)?.name ?? "";
      const schoolName = meta.data?.school?.name ?? "مکتب خصوصی نداالقلم";
      let count = 0;
      for (const r of absentRows) {
        const enr = (enrQ.data?.items ?? []).find((e) => e.id === r.enrollmentId);
        const phone = enr?.student.guardianPhone;
        if (!enr || !phone) continue;
        const body = tpl
          .split("{{نام}}").join(enr.student.firstName)
          .split("{{صنف}}").join(className)
          .split("{{مکتب}}").join(schoolName);
        await apiPost("/api/x/notifications", {
          category: "حاضری",
          audience: "والدین",
          studentId: enr.student.id,
          classroomId,
          phone,
          body,
        });
        count++;
      }
      return count;
    },
    onSuccess: (count) => {
      toast.success(`${t.notifyAbsentParents}: ${count}`);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = (id: string, s: Status) => setRecords((r) => ({ ...r, [id]: { status: s, note: r[id]?.note ?? "" } }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>{t.selectClass}</Label>
          <Select value={classroomId} onValueChange={setClassroomId}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t.selectClass} /></SelectTrigger>
            <SelectContent>
              {meta.data?.classrooms.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t.date}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" className="w-40" />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !classroomId}>
          <Save className="h-4 w-4 me-1" /> {t.bulkSave}
        </Button>
        <Button variant="outline" onClick={() => notify.mutate()} disabled={!classroomId}>
          <MessageSquare className="h-4 w-4 me-1" /> {t.notifyAbsentParents}
        </Button>
        <Button variant="outline" onClick={() => setReportOpen(true)} disabled={!classroomId}>
          <Printer className="h-4 w-4 me-1" /> {t.print}
        </Button>
      </div>

      {!classroomId ? (
        <p className="text-sm text-muted-foreground">{t.selectClass}</p>
      ) : grid.isLoading ? (
        <Loading rows={6} />
      ) : grid.data && grid.data.enrollments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.emptyGrid}</p>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60">
                <th className="p-2 text-start">#</th>
                <th className="p-2 text-start">{t.student}</th>
                {STATUSES.map((s) => (
                  <th key={s} className="p-2">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.data?.enrollments.map((e, i) => (
                <tr key={e.id} className="border-t">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2">{e.studentName}</td>
                  {STATUSES.map((s) => {
                    const cur = records[e.id]?.status ?? "حاضر";
                    return (
                      <td key={s} className="p-1.5 text-center">
                        <button
                          className={`rounded px-2.5 py-1 text-xs transition-colors ${cur === s ? STATUS_COLORS[s] : "bg-muted text-muted-foreground hover:bg-accent"}`}
                          onClick={() => setStatus(e.id, s)}
                          aria-label={`${e.studentName} ${s}`}
                        >
                          {s}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reportOpen && grid.data && (
        <PrintOverlay title="چیتۂ حاضری روزانه" onClose={() => setReportOpen(false)}>
          <DailySheetPrint classroomName={meta.data?.classrooms.find((c) => c.id === classroomId)?.name ?? ""} date={date} rows={grid.data.enrollments.map((e, i) => ({ i: i + 1, name: e.studentName, status: records[e.id]?.status ?? "حاضر" }))} school={null} />
        </PrintOverlay>
      )}
    </div>
  );
}

function DailySheetPrint({
  classroomName, date, rows, school,
}: {
  classroomName: string;
  date: string;
  rows: { i: number; name: string; status: string }[];
  school: SchoolHeaderInfo | null;
}) {
  return (
    <div>
      <DocLetterhead school={school} />
      <div className="text-center font-bold mb-2">چیتۂ حاضری روزانه — صنف {classroomName}</div>
      <table>
        <thead>
          <tr><th>#</th><th>نام متعلم</th><th>وضعیت</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.i}>
              <td>{r.i}</td>
              <td>{r.name}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-xs">تاریخ: {date}</div>
      <div className="flex justify-between mt-8 text-xs">
        <span>امضای معلم: ...............................</span>
        <span>امضای مدیر: ...............................</span>
      </div>
    </div>
  );
}

function MonthlySheet() {
  const { t } = useT();
  const qc = useQueryClient();
  const [enrollmentId, setEnrollmentId] = useState("");
  const [monthKey, setMonthKey] = useState(() => lastMonthKeys(1)[0]);
  const [entries, setEntries] = useState<Record<string, string>>({});

  const meta = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<LookupResponse>("/api/x/lookup") });
  // pick classroom then enrollment
  const [classroomId, setClassroomId] = useState("");
  const enrList = useQuery({
    queryKey: ["enr-list", classroomId],
    queryFn: () =>
      apiGet<{ items: { id: string; rollNo: number; student: { firstName: string; fatherName: string } }[] }>(
        `/api/x/enrollments?classroomId=${classroomId}&status=active`,
      ),
    enabled: classroomId !== "",
  });

  const sheet = useQuery({
    queryKey: ["att-month", enrollmentId, monthKey],
    queryFn: async () => {
      const res = await apiGet<{ monthKey: string; days: { date: string; status: string | null }[] }>(
        `/api/x/attendance/month?enrollmentId=${enrollmentId}&monthKey=${monthKey}`,
      );
      const recs: Record<string, string> = {};
      for (const d of res.days ?? []) {
        if (d.status) recs[d.date] = d.status;
      }
      setEntries(recs);
      const enr = (enrList.data?.items ?? []).find((e) => e.id === enrollmentId);
      return {
        enrollment: enr
          ? {
              studentName: `${enr.student.firstName} ${enr.student.fatherName}`,
              classroomName: meta.data?.classrooms.find((c) => c.id === classroomId)?.name ?? "",
            }
          : null,
      };
    },
    enabled: enrollmentId !== "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(entries)
        .filter(([, status]) => STATUSES.includes(status as Status))
        .map(([d, status]) => ({ date: d, status }));
      let saved = 0;
      for (const row of rows) {
        const res = await apiPost<{ saved: number }>("/api/x/attendance/bulk", {
          kind: "student",
          date: row.date,
          rows: [{ enrollmentId, status: row.status }],
        });
        saved += res.saved;
      }
      return saved;
    },
    onSuccess: () => {
      toast.success(t.savedAttendance);
      qc.invalidateQueries({ queryKey: ["att-month"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allDates = jalaliMonthDates(monthKey);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>{t.selectClass}</Label>
          <Select value={classroomId} onValueChange={(v) => { setClassroomId(v); setEnrollmentId(""); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder={t.selectClass} /></SelectTrigger>
            <SelectContent>
              {meta.data?.classrooms.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t.student}</Label>
          <Select value={enrollmentId} onValueChange={setEnrollmentId}>
            <SelectTrigger className="w-52"><SelectValue placeholder={t.student} /></SelectTrigger>
            <SelectContent>
              {(enrList.data?.items ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.rollNo} — {e.student.firstName} {e.student.fatherName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t.month}</Label>
          <JalaliMonthSelect value={monthKey} onChange={setMonthKey} />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !enrollmentId}>
          <Save className="h-4 w-4 me-1" /> {t.bulkSave}
        </Button>
      </div>

      {!enrollmentId ? (
        <p className="text-sm text-muted-foreground">{t.student} {t.select}</p>
      ) : sheet.isLoading ? (
        <Loading rows={5} />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {sheet.data?.enrollment?.studentName} — {sheet.data?.enrollment?.classroomName} — {jalaliMonthName(monthKey)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {allDates.map((d) => {
                const isSchoolDay = ![5, 6].includes(new Date(d + "T12:00:00Z").getUTCDay());
                if (!isSchoolDay) return null;
                const cur = entries[d] ?? "";
                return (
                  <div key={d} className="rounded border p-2 space-y-1.5">
                    <div className="text-[11px] text-muted-foreground"><JalaliDate iso={d} /></div>
                    <div className="flex flex-wrap gap-1">
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          className={`rounded px-1.5 py-0.5 text-[10px] ${cur === s ? STATUS_COLORS[s] : "bg-muted hover:bg-accent"}`}
                          onClick={() => setEntries((e) => ({ ...e, [d]: s }))}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MonthlyReport() {
  const { t } = useT();
  const n = useN();
  const [classroomId, setClassroomId] = useState("");
  const [monthKey, setMonthKey] = useState(lastMonthKeys(1)[0]);
  const meta = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<LookupResponse>("/api/x/lookup") });
  const report = useQuery({
    queryKey: ["att-report", classroomId, monthKey],
    queryFn: async () => {
      const res = await apiGet<{
        monthKey: string;
        items: {
          id: string; studentNo: string; name: string; fatherName: string;
          classroom: { id: string; name: string; grade: number } | null;
          present: number; absent: number; sick: number; leave: number; total: number; percent: number;
        }[];
      }>(`/api/x/reports/attendance?kind=student&monthKey=${monthKey}`);
      const rows = (res.items ?? [])
        .filter((i) => (i.classroom?.id ?? "") === classroomId)
        .map((i) => ({
          enrollmentId: i.id,
          rollNo: 0,
          studentNo: i.studentNo,
          studentName: `${i.name} ${i.fatherName}`,
          present: i.present,
          absent: i.absent,
          sick: i.sick,
          leave: i.leave,
          percent: i.percent,
        }));
      return { report: rows, monthName: jalaliMonthName(monthKey), totalDays: 0 };
    },
    enabled: classroomId !== "",
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>{t.selectClass}</Label>
          <Select value={classroomId} onValueChange={setClassroomId}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t.selectClass} /></SelectTrigger>
            <SelectContent>
              {meta.data?.classrooms.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t.month}</Label>
          <JalaliMonthSelect value={monthKey} onChange={setMonthKey} />
        </div>
      </div>
      {!classroomId ? (
        <p className="text-sm text-muted-foreground">{t.selectClass}</p>
      ) : report.isLoading ? (
        <Loading rows={6} />
      ) : (
        <DataTable
          rows={(report.data?.report ?? []) as unknown as Array<Record<string, unknown>>}
          searchable={false}
          emptyText={t.noData}
          pageSize={15}
          columns={[
            {
              key: "rollNo", header: t.rollNo,
              render: (r) => {
                const x = r as { rollNo: number; studentNo: string };
                return x.rollNo ? n.n(x.rollNo) : <span dir="ltr">{x.studentNo}</span>;
              },
            },
            { key: "studentName", header: t.student, render: (r) => (r as { studentName: string }).studentName },
            { key: "present", header: t.presentDays, render: (r) => n.n((r as { present: number }).present) },
            { key: "absent", header: t.absentDays, render: (r) => n.n((r as { absent: number }).absent) },
            { key: "sick", header: t.sick, render: (r) => n.n((r as { sick: number }).sick) },
            { key: "leave", header: t.leave, render: (r) => n.n((r as { leave: number }).leave) },
            {
              key: "percent", header: t.attendancePercent,
              render: (r) => {
                const p = (r as { percent: number }).percent;
                return <span className={p >= 85 ? "text-emerald-700 font-bold" : p >= 60 ? "text-amber-700" : "text-red-700"}>{n.n(p)}{t.percentSign}</span>;
              },
            },
          ]}
        />
      )}
    </div>
  );
}

function StaffAttendance() {
  const { t } = useT();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [records, setRecords] = useState<Record<string, { status: string; note: string }>>({});
  const staffStatuses = ["حاضر", "غایب", "رخصتی", "ماموریت"];
  const grid = useQuery({
    queryKey: ["staff-att", date],
    queryFn: async () => {
      const res = await apiGet<{
        rows: { staffId: string; staffNo: string; name: string; position: string; status: string | null; note: string | null }[];
      }>(`/api/x/attendance/grid?kind=staff&date=${date}`);
      const staff = (res.rows ?? []).map((r) => ({ id: r.staffId, name: r.name, position: r.position }));
      const recs: Record<string, { status: string; note: string }> = {};
      for (const r of res.rows ?? []) {
        if (r.status) recs[r.staffId] = { status: r.status, note: r.note ?? "" };
      }
      setRecords(recs);
      return { staff };
    },
  });
  const save = useMutation({
    mutationFn: () =>
      apiPost("/api/x/attendance/bulk", {
        kind: "staff",
        date,
        rows: (grid.data?.staff ?? []).map((s) => ({ staffId: s.id, status: records[s.id]?.status ?? "حاضر" })),
      }),
    onSuccess: () => {
      toast.success(t.savedAttendance);
      qc.invalidateQueries({ queryKey: ["staff-att"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>{t.date}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" className="w-40" />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4 me-1" /> {t.bulkSave}
        </Button>
      </div>
      {grid.isLoading ? (
        <Loading rows={6} />
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60">
                <th className="p-2 text-start">{t.staff}</th>
                <th className="p-2 text-start">{t.position}</th>
                {staffStatuses.map((s) => (
                  <th key={s} className="p-2">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.data?.staff.map((s) => {
                const cur = records[s.id]?.status ?? "حاضر";
                return (
                  <tr key={s.id} className="border-t">
                    <td className="p-2">{s.name}</td>
                    <td className="p-2 text-xs text-muted-foreground">{s.position}</td>
                    {staffStatuses.map((st) => (
                      <td key={st} className="p-1.5 text-center">
                        <button
                          className={`rounded px-2.5 py-1 text-xs ${cur === st ? STATUS_COLORS[st] ?? "bg-teal-600 text-white" : "bg-muted hover:bg-accent"}`}
                          onClick={() => setRecords((r) => ({ ...r, [s.id]: { status: st, note: r[s.id]?.note ?? "" } }))}
                        >
                          {st}
                        </button>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
