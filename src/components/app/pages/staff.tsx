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
import { toast } from "sonner";
import { UserPlus, Printer, Plus, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/components/app/api";
import { useN, useT } from "@/components/app/store";
import { DataTable, JalaliDate, Loading, PageHeader, StatusBadge } from "@/components/app/ui";
import { PrintOverlay, DocLetterhead, SchoolHeaderInfo } from "@/components/app/printable";
import { formatAFN } from "@/lib/money";

interface StaffRow {
  id: string; staffNo: string; name: string; fatherName: string; position: string;
  subjectSpecialty: string; educationDegree: string; tazkiraNo: string; phone: string;
  hireDate: string; baseSalary: number; photoUrl: string; status: string;
}

interface StaffProfileResponse {
  staff: StaffRow;
  documents: { id: string; title: string; fileName: string; note: string }[];
  attendance: { id: string; date: string; status: string }[];
  salaries: { id: string; monthKey: string; amount: number; paidDate: string | null; status: string }[];
}

const POSITIONS = ["معلم", "مدیر", "حسابدار", "اداری", "خدمات"];

interface LookupResponse {
  school: import("@/components/app/printable").SchoolHeaderInfo | null;
}

/** server stores active/left; UI shows فعال/غیرفعال */
const STAFF_ST_SRV2UI: Record<string, string> = { active: "فعال", left: "غیرفعال" };
const STAFF_ST_UI2SRV: Record<string, string> = { "فعال": "active", "غیرفعال": "left" };

export function StaffPage() {
  const { t } = useT();
  const n = useN();
  const qc = useQueryClient();
  const [regOpen, setRegOpen] = useState(false);
  const [positionFilter, setPositionFilter] = useState("all");
  const staffQ = useQuery({
    queryKey: ["staff", positionFilter],
    queryFn: () =>
      apiGet<{ items: Record<string, unknown>[]; total: number }>(
        `/api/x/staff?take=500${positionFilter !== "all" ? `&position=${positionFilter}` : ""}`,
      ),
  });
  const staffRows = (staffQ.data?.items ?? []).map((s) => ({
    ...s,
    status: STAFF_ST_SRV2UI[String(s.status)] ?? String(s.status),
  })) as unknown as StaffRow[];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.staff}
        subtitle={`${n.n(staffQ.data?.total ?? 0)} ${t.staffCount}`}
        actions={
          <Button onClick={() => setRegOpen(true)}>
            <UserPlus className="h-4 w-4 me-1" /> {t.new} {t.staff}
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Select value={positionFilter} onValueChange={setPositionFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t.position} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.all}</SelectItem>
            {POSITIONS.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {staffQ.isLoading ? (
        <Loading rows={6} />
      ) : (
        <DataTable
          rows={staffRows as unknown as Array<Record<string, unknown>>}
          searchPlaceholder={`${t.search}: ${t.name} / ${t.staffNo}`}
          searchKeys={["name", "staffNo", "fatherName", "phone"]}
          emptyText={t.noData}
          pageSize={12}
          columns={[
            { key: "staffNo", header: t.staffNo, render: (r) => <span dir="ltr">{(r as StaffRow).staffNo}</span> },
            { key: "name", header: t.name, render: (r) => <span className="font-medium">{(r as StaffRow).name}</span> },
            { key: "position", header: t.position, render: (r) => (r as StaffRow).position },
            { key: "specialty", header: t.specialty, render: (r) => (r as StaffRow).subjectSpecialty || "—" },
            { key: "phone", header: t.phone, render: (r) => <span dir="ltr">{(r as StaffRow).phone}</span> },
            { key: "salary", header: t.baseSalary, render: (r) => formatAFN((r as StaffRow).baseSalary) },
            { key: "status", header: t.status, render: (r) => <StatusBadge status={(r as StaffRow).status} /> },
            { key: "actions", header: t.actions, render: (r) => <StaffProfileButtons staffId={(r as StaffRow).id} /> },
          ]}
        />
      )}
      <RegisterStaffDialog open={regOpen} onClose={() => setRegOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["staff"] })} />
    </div>
  );
}

function StaffProfileButtons({ staffId }: { staffId: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t.profile}</Button>
      <StaffProfileDialog staffId={staffId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function RegisterStaffDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [form, setForm] = useState({ name: "", fatherName: "", position: "معلم", subjectSpecialty: "", educationDegree: "", tazkiraNo: "", phone: "", hireDate: "", baseSalary: 8000 });
  const create = useMutation({
    mutationFn: () => apiPost("/api/x/staff", form),
    onSuccess: () => {
      toast.success(t.saved);
      setForm({ name: "", fatherName: "", position: "معلم", subjectSpecialty: "", educationDegree: "", tazkiraNo: "", phone: "", hireDate: "", baseSalary: 8000 });
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto nq-scroll">
        <DialogHeader>
          <DialogTitle>{t.new} {t.staff}</DialogTitle>
          <DialogDescription>{t.staffNo} به‌صورت خودکار جور می‌شود</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label>{t.name}</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="space-y-1"><Label>{t.fatherName}</Label><Input value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} /></div>
          <div className="space-y-1">
            <Label>{t.position}</Label>
            <Select value={form.position} onValueChange={(v) => set("position", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>{t.specialty}</Label><Input value={form.subjectSpecialty} onChange={(e) => set("subjectSpecialty", e.target.value)} /></div>
          <div className="space-y-1"><Label>{t.educationDegree}</Label><Input value={form.educationDegree} onChange={(e) => set("educationDegree", e.target.value)} /></div>
          <div className="space-y-1"><Label>{t.tazkiraNo}</Label><Input value={form.tazkiraNo} onChange={(e) => set("tazkiraNo", e.target.value)} dir="ltr" /></div>
          <div className="space-y-1"><Label>{t.phone}</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} dir="ltr" /></div>
          <div className="space-y-1"><Label>{t.hireDate}</Label><Input type="date" value={form.hireDate} onChange={(e) => set("hireDate", e.target.value)} dir="ltr" /></div>
          <div className="space-y-1"><Label>{t.baseSalary}</Label><Input type="number" value={form.baseSalary} onChange={(e) => set("baseSalary", parseInt(e.target.value) || 0)} dir="ltr" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.name}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StaffProfileDialog({ staffId, open, onClose }: { staffId: string; open: boolean; onClose: () => void }) {
  const { t } = useT();
  const n = useN();
  const qc = useQueryClient();
  const [printOpen, setPrintOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docFileName, setDocFileName] = useState("");
  const meta = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<LookupResponse>("/api/x/lookup") });
  const q = useQuery({
    queryKey: ["staff-profile", staffId],
    queryFn: () =>
      apiGet<StaffProfileResponse & { staff: { status: string } }>(`/api/x/staff/${staffId}`).then((res) => ({
        ...res,
        staff: { ...res.staff, status: STAFF_ST_SRV2UI[res.staff.status] ?? res.staff.status },
      })),
    enabled: open,
  });
  const [form, setForm] = useState<Partial<StaffRow>>({});

  const save = useMutation({
    mutationFn: () => {
      const { id: _id, ...rest } = form;
      void _id;
      return apiPut(`/api/x/staff/${staffId}`, {
        ...rest,
        status: STAFF_ST_UI2SRV[String(form.status ?? "")] ?? form.status,
      });
    },
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["staff-profile", staffId] });
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addDoc = useMutation({
    mutationFn: () => apiPost("/api/x/staffDocuments", { staffId, title: docTitle, fileName: docFileName || undefined }),
    onSuccess: () => {
      toast.success(t.saved);
      setDocTitle("");
      setDocFileName("");
      qc.invalidateQueries({ queryKey: ["staff-profile", staffId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delDoc = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/x/staffDocuments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-profile", staffId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const staff = q.data?.staff;
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto nq-scroll">
        <DialogHeader>
          <DialogTitle>{t.staffProfile} — {staff?.name ?? ""}</DialogTitle>
          <DialogDescription dir="ltr">{staff?.staffNo}</DialogDescription>
        </DialogHeader>
        {q.isLoading || !staff ? (
          <Loading rows={5} />
        ) : (
          <Tabs defaultValue="info">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="info">{t.info}</TabsTrigger>
              <TabsTrigger value="attendance">{t.attendanceTab}</TabsTrigger>
              <TabsTrigger value="salaries">{t.salaries}</TabsTrigger>
              <TabsTrigger value="docs">{t.documents}</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="mt-3 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>{t.name}</Label><Input defaultValue={staff.name} onChange={(e) => set("name", e.target.value)} /></div>
                <div className="space-y-1"><Label>{t.fatherName}</Label><Input defaultValue={staff.fatherName} onChange={(e) => set("fatherName", e.target.value)} /></div>
                <div className="space-y-1">
                  <Label>{t.position}</Label>
                  <Select defaultValue={staff.position} onValueChange={(v) => set("position", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>{t.specialty}</Label><Input defaultValue={staff.subjectSpecialty} onChange={(e) => set("subjectSpecialty", e.target.value)} /></div>
                <div className="space-y-1"><Label>{t.educationDegree}</Label><Input defaultValue={staff.educationDegree} onChange={(e) => set("educationDegree", e.target.value)} /></div>
                <div className="space-y-1"><Label>{t.phone}</Label><Input defaultValue={staff.phone} onChange={(e) => set("phone", e.target.value)} dir="ltr" /></div>
                <div className="space-y-1"><Label>{t.baseSalary}</Label><Input type="number" defaultValue={staff.baseSalary} onChange={(e) => set("baseSalary", parseInt(e.target.value) || 0)} dir="ltr" /></div>
                <div className="space-y-1">
                  <Label>{t.status}</Label>
                  <Select defaultValue={staff.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="فعال">{t.active}</SelectItem>
                      <SelectItem value="غیرفعال">{t.inactive}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>{t.save}</Button>
                <Button variant="outline" onClick={() => setPrintOpen(true)}><Printer className="h-4 w-4 me-1" /> {t.printStaffId}</Button>
              </div>
            </TabsContent>
            <TabsContent value="attendance" className="mt-3">
              <div className="max-h-72 overflow-y-auto nq-scroll">
                {q.data.attendance.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.noData}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {q.data.attendance.slice(0, 60).map((a) => (
                      <div key={a.id} className="rounded border p-2 flex items-center justify-between">
                        <JalaliDate iso={a.date} />
                        <StatusBadge status={a.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="salaries" className="mt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b"><th className="text-start py-1.5">{t.month}</th><th>{t.amount}</th><th>{t.date}</th><th>{t.status}</th></tr>
                </thead>
                <tbody>
                  {q.data.salaries.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-1.5">{s.monthKey.replace("-", "/")}</td>
                      <td className="text-center">{formatAFN(s.amount)}</td>
                      <td className="text-center">{s.paidDate ? <JalaliDate iso={s.paidDate} /> : "—"}</td>
                      <td className="text-center"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>
            <TabsContent value="docs" className="mt-3 space-y-3">
              <ul className="space-y-1.5">
                {q.data.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded border p-2 text-xs">
                    <div><b>{d.title}</b> {d.fileName && <span dir="ltr" className="text-muted-foreground">({d.fileName})</span>}</div>
                    <Button size="sm" variant="ghost" onClick={() => delDoc.mutate(d.id)}><Trash2 className="h-3.5 w-3.5 text-red-600" /></Button>
                  </li>
                ))}
                {q.data.documents.length === 0 && <p className="text-sm text-muted-foreground">{t.noData}</p>}
              </ul>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1"><Label>{t.title}</Label><Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} className="w-44" /></div>
                <div className="space-y-1"><Label>{t.fileName}</Label><Input value={docFileName} onChange={(e) => setDocFileName(e.target.value)} className="w-44" dir="ltr" /></div>
                <Button size="sm" onClick={() => addDoc.mutate()} disabled={!docTitle}><Plus className="h-4 w-4 me-1" /> {t.addDocument}</Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
        {printOpen && staff && (
          <PrintOverlay title={t.printStaffId} onClose={() => setPrintOpen(false)}>
            <StaffIdCardPrint school={meta.data?.school ?? null} staff={staff} />
          </PrintOverlay>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StaffIdCardPrint({ school, staff }: { school: SchoolHeaderInfo | null; staff: StaffRow }) {
  const n = useN();
  return (
    <div className="flex justify-center py-4">
      <div className="w-72 rounded-xl border-2 border-black overflow-hidden">
        <div className="bg-teal-800 text-white text-center py-2">
          <div className="font-bold text-sm">{school?.name ?? "مکتب خصوصی نداالقلم"}</div>
          <div className="text-[9px]">ایدی کارت کارمند</div>
        </div>
        <div className="p-3 flex gap-3">
          <div className="w-20 h-24 rounded border border-dashed flex items-center justify-center text-[9px] text-gray-500 bg-gray-50">عکس</div>
          <div className="text-[11px] space-y-1 flex-1">
            <div className="font-bold">{staff.name}</div>
            <div>{tPositionLabel(staff.position)}</div>
            {staff.subjectSpecialty && <div>{staff.subjectSpecialty}</div>}
            <div dir="ltr" className="text-start">{staff.staffNo}</div>
            <div dir="ltr" className="text-start">{staff.phone}</div>
          </div>
        </div>
        <div className="text-center text-[9px] pb-2 text-gray-600">
          معاش اساسی: {formatAFN(staff.baseSalary)} — استخدام: {n.eastern(staff.hireDate || "")}
        </div>
      </div>
    </div>
  );
}

function tPositionLabel(p: string): string {
  return p;
}
