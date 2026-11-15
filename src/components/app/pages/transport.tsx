"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Bus, Printer, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { apiGet, apiPost } from "@/components/app/api";
import { useApp, useN, useT } from "@/components/app/store";
import { DataTable, JalaliDate, Loading, PageHeader, StatCard } from "@/components/app/ui";
import { PrintOverlay, DocLetterhead, SignatureRow, SchoolHeaderInfo } from "@/components/app/printable";
import { formatAFN } from "@/lib/money";
import { currentMonthKey, monthKeyLabel, todayISO, yearMonthKeys } from "@/lib/date";

// ---------- types ----------

interface TransportEnrollmentRow {
  id: string; studentId: string; academicYearId: string; routeName: string | null;
  monthlyFee: number; active: boolean;
  student: { id: string; studentNo: string; firstName: string; fatherName: string };
}

interface TransportPaymentRow {
  id: string; transportEnrollmentId: string; monthKey: string; amount: number; date: string; receiptNo: string;
  transportEnrollment: {
    id: string; routeName: string | null; monthlyFee: number;
    student: { id: string; studentNo: string; firstName: string; fatherName: string };
  };
}

interface TransportExpenseRow {
  id: string; date: string; category: string; amount: number; note: string | null;
}

interface TransportReport {
  monthKey: string;
  revenue: number;
  expenses: { id: string; date: string; category: string; amount: number; note: string | null }[];
  expenseTotal: number;
  profit: number;
  perClass: { className: string; revenue: number }[];
}

interface Lookup {
  years: { id: string; name: string }[];
  school: SchoolHeaderInfo | null;
  studentsMinimal: { id: string; studentNo: string; firstName: string; fatherName: string }[];
}

const TRANSPORT_CATEGORIES = ["سوخت", "تعمیرات", "معاش راننده", "دیگر"];

// ---------- print ----------

function TransportReceiptPrint({ school, data }: { school: SchoolHeaderInfo | null; data: { receiptNo: string; studentName: string; routeName: string; monthKey: string; amount: number; date: string } }) {
  const n = useN();
  return (
    <div>
      <DocLetterhead school={school} />
      <div className="text-center font-bold mb-3">رسید پرداخت فیس ترانسپورت</div>
      <table className="w-full text-xs border" dir="rtl">
        <tbody>
          <tr><td className="bg-gray-50 font-semibold w-40 p-1.5 border">نمبر رسید</td><td className="p-1.5 border" dir="ltr">{data.receiptNo}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">متعلم</td><td className="p-1.5 border">{data.studentName}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">مسیر</td><td className="p-1.5 border">{data.routeName || "—"}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">ماه</td><td className="p-1.5 border">{monthKeyLabel(data.monthKey)}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">مبلغ</td><td className="p-1.5 border font-bold">{formatAFN(data.amount)}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">تاریخ</td><td className="p-1.5 border">{n.eastern(data.date)}</td></tr>
        </tbody>
      </table>
      <SignatureRow left="امضای دریافت‌کننده" right="امضای ولی" />
    </div>
  );
}

function TransportReportPrint({ school, report }: { school: SchoolHeaderInfo | null; report: TransportReport }) {
  return (
    <div>
      <DocLetterhead school={school} />
      <div className="text-center font-bold mb-3">گذارش ترانسپورت — {monthKeyLabel(report.monthKey)}</div>
      <div className="grid grid-cols-3 gap-3 text-xs mb-3">
        <div className="border p-2 text-center"><div className="text-muted-foreground">عواید</div><b>{formatAFN(report.revenue)}</b></div>
        <div className="border p-2 text-center"><div className="text-muted-foreground">مصارف</div><b>{formatAFN(report.expenseTotal)}</b></div>
        <div className={`border p-2 text-center ${report.profit >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
          <div className="text-muted-foreground">مفاد / نقص</div><b>{formatAFN(report.profit)}</b>
        </div>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-1">صنف</th>
            <th className="border p-1">عواید</th>
          </tr>
        </thead>
        <tbody>
          {report.perClass.map((c, i) => (
            <tr key={i}>
              <td className="border p-1">{c.className}</td>
              <td className="border p-1 text-end">{formatAFN(c.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="font-bold border-b mt-3 mb-1 text-xs">مصارف</div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-1">تاریخ</th>
            <th className="border p-1">کتگوری</th>
            <th className="border p-1">مبلغ</th>
          </tr>
        </thead>
        <tbody>
          {report.expenses.map((e) => (
            <tr key={e.id}>
              <td className="border p-1">{e.date.slice(0, 10)}</td>
              <td className="border p-1">{e.category}</td>
              <td className="border p-1 text-end">{formatAFN(e.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SignatureRow left="امضای حسابدار" right="امضای مدیر" />
    </div>
  );
}

// ---------- dialogs ----------

function EnrollTransportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const yearId = lookup.data?.years[0]?.id ?? "";
  const [studentId, setStudentId] = useState("");
  const [routeName, setRouteName] = useState("");
  const [monthlyFee, setMonthlyFee] = useState(500);

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/x/transportEnrollments", { studentId, routeName, monthlyFee, academicYearId: yearId, active: true }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["transport-enrollments"] });
      setStudentId(""); setRouteName("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.transportEnroll}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t.student}</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder={t.selectStudent} /></SelectTrigger>
              <SelectContent>
                {(lookup.data?.studentsMinimal ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.firstName} {s.fatherName} — <span dir="ltr">{s.studentNo}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t.route}</Label>
            <Input value={routeName} onChange={(e) => setRouteName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t.monthlyFee}</Label>
            <Input type="number" dir="ltr" value={monthlyFee} onChange={(e) => setMonthlyFee(parseInt(e.target.value) || 0)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !studentId}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransportPayDialog({ open, onClose, onPaid }: { open: boolean; onClose: () => void; onPaid: (p: TransportPaymentRow) => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const jy = parseInt(lookup.data?.years[0]?.name ?? "1405", 10) || 1405;
  const months = yearMonthKeys(jy);
  const enrollQ = useQuery({
    queryKey: ["transport-enrollments"],
    queryFn: () => apiGet<{ items: TransportEnrollmentRow[]; total: number }>("/api/x/transportEnrollments?active=true"),
  });
  const [teId, setTeId] = useState("");
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [amount, setAmount] = useState(0);

  const create = useMutation({
    mutationFn: () =>
      apiPost<{ item: TransportPaymentRow }>("/api/x/transportPayments", {
        transportEnrollmentId: teId, monthKey, amount, date: todayISO(),
      }),
    onSuccess: (res) => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["transport-payments"] });
      qc.invalidateQueries({ queryKey: ["profit-loss"] });
      onPaid(res.item);
      setTeId(""); setAmount(0);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.recordPayment}</DialogTitle>
          <DialogDescription>{t.transportPayments}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t.transportEnroll}</Label>
            <Select
              value={teId}
              onValueChange={(v) => {
                setTeId(v);
                const te = (enrollQ.data?.items ?? []).find((e) => e.id === v);
                setAmount(te?.monthlyFee ?? 0);
              }}
            >
              <SelectTrigger><SelectValue placeholder={t.select} /></SelectTrigger>
              <SelectContent>
                {(enrollQ.data?.items ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.student.firstName} {e.student.fatherName} {e.routeName ? `— ${e.routeName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t.month}</Label>
              <Select value={monthKey} onValueChange={setMonthKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t.amount}</Label>
              <Input type="number" dir="ltr" value={amount} onChange={(e) => setAmount(parseInt(e.target.value) || 0)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !teId || amount <= 0}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransportExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [category, setCategory] = useState(TRANSPORT_CATEGORIES[0]);
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");

  const create = useMutation({
    mutationFn: () => apiPost("/api/x/transportExpenses", { category, amount, date, note }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["transport-expenses"] });
      qc.invalidateQueries({ queryKey: ["transport-report"] });
      qc.invalidateQueries({ queryKey: ["profit-loss"] });
      setAmount(0); setNote("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.transportExpenses}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t.category}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRANSPORT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t.amount}</Label>
              <Input type="number" dir="ltr" value={amount} onChange={(e) => setAmount(parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label>{t.date}</Label>
              <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t.note}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || amount <= 0}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- main page ----------

export function TransportPage() {
  const { t } = useT();
  const n = useN();
  const qc = useQueryClient();
  const user = useApp((s) => s.user);
  const isOwner = (user?.role ?? "STAFF") === "OWNER";

  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const jy = parseInt(lookup.data?.years[0]?.name ?? "1405", 10) || 1405;
  const months = yearMonthKeys(jy);
  const [monthFilter, setMonthFilter] = useState(currentMonthKey());

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [receipt, setReceipt] = useState<TransportPaymentRow | null>(null);
  const [reportPrint, setReportPrint] = useState(false);

  const enrollmentsQ = useQuery({
    queryKey: ["transport-enrollments"],
    queryFn: () => apiGet<{ items: TransportEnrollmentRow[]; total: number }>("/api/x/transportEnrollments"),
  });

  const paymentsQ = useQuery({
    queryKey: ["transport-payments", monthFilter],
    queryFn: () => apiGet<{ items: TransportPaymentRow[]; total: number }>(`/api/x/transportPayments?monthKey=${monthFilter}`),
  });

  const expensesQ = useQuery({
    queryKey: ["transport-expenses"],
    queryFn: () => apiGet<{ items: TransportExpenseRow[]; total: number }>("/api/x/transportExpenses"),
  });

  const reportQ = useQuery({
    queryKey: ["transport-report", monthFilter],
    queryFn: () => apiGet<TransportReport>(`/api/x/reports/transport?monthKey=${monthFilter}`),
  });

  return (
    <div className="space-y-4">
      <PageHeader title={t.transport} subtitle={t.route} />
      <Tabs defaultValue="enrollments">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="enrollments">{t.transportStudentsTab}</TabsTrigger>
          <TabsTrigger value="payments">{t.payments}</TabsTrigger>
          <TabsTrigger value="expenses">{t.transportExpenses}</TabsTrigger>
          <TabsTrigger value="report">{t.reportTab}</TabsTrigger>
        </TabsList>

        {/* ---- enrollments ---- */}
        <TabsContent value="enrollments" className="mt-3 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setEnrollOpen(true)} disabled={isOwner}>
              <Plus className="h-4 w-4 me-1" /> {t.transportEnroll}
            </Button>
          </div>
          {enrollmentsQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={(enrollmentsQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
              searchPlaceholder={`${t.search}: ${t.student}`}
              searchKeys={["studentName"]}
              emptyText={t.noData}
              pageSize={10}
              columns={[
                {
                  key: "student", header: t.student,
                  render: (r) => {
                    const e = r as unknown as TransportEnrollmentRow;
                    return (
                      <div>
                        <div className="font-medium">{e.student.firstName} {e.student.fatherName}</div>
                        <div className="text-[11px] text-muted-foreground" dir="ltr">{e.student.studentNo}</div>
                      </div>
                    );
                  },
                },
                { key: "route", header: t.route, render: (r) => (r as unknown as TransportEnrollmentRow).routeName || "—" },
                { key: "fee", header: t.monthlyFee, render: (r) => formatAFN((r as unknown as TransportEnrollmentRow).monthlyFee) },
                {
                  key: "status", header: t.status,
                  render: (r) => (
                    <span className={`text-xs font-medium ${(r as unknown as TransportEnrollmentRow).active ? "text-emerald-700" : "text-muted-foreground"}`}>
                      {(r as unknown as TransportEnrollmentRow).active ? t.active : t.inactive}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- payments ---- */}
        <TabsContent value="payments" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">{t.month}</Label>
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setPayOpen(true)} disabled={isOwner}>
              <Plus className="h-4 w-4 me-1" /> {t.recordPayment}
            </Button>
          </div>
          {paymentsQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={(paymentsQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
              searchPlaceholder={`${t.search}: ${t.receiptNo}`}
              searchKeys={["receiptNo"]}
              emptyText={t.noData}
              pageSize={10}
              columns={[
                { key: "receiptNo", header: t.receiptNo, render: (r) => <span dir="ltr">{(r as unknown as TransportPaymentRow).receiptNo}</span> },
                { key: "date", header: t.date, render: (r) => <JalaliDate iso={(r as unknown as TransportPaymentRow).date} /> },
                {
                  key: "student", header: t.student,
                  render: (r) => {
                    const p = r as unknown as TransportPaymentRow;
                    return `${p.transportEnrollment.student.firstName} ${p.transportEnrollment.student.fatherName}`;
                  },
                },
                { key: "route", header: t.route, render: (r) => (r as unknown as TransportPaymentRow).transportEnrollment.routeName || "—" },
                { key: "month", header: t.month, render: (r) => monthKeyLabel((r as unknown as TransportPaymentRow).monthKey) },
                { key: "amount", header: t.amount, render: (r) => <b>{formatAFN((r as unknown as TransportPaymentRow).amount)}</b> },
                {
                  key: "actions", header: t.actions,
                  render: (r) => (
                    <Button size="sm" variant="outline" onClick={() => setReceipt(r as unknown as TransportPaymentRow)}>
                      <Printer className="h-4 w-4 me-1" /> {t.printReceipt}
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- expenses ---- */}
        <TabsContent value="expenses" className="mt-3 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setExpenseOpen(true)} disabled={isOwner}>
              <Plus className="h-4 w-4 me-1" /> {t.expensesShort}
            </Button>
          </div>
          {expensesQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={(expensesQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
              searchable={false}
              emptyText={t.noData}
              pageSize={10}
              columns={[
                { key: "date", header: t.date, render: (r) => <JalaliDate iso={(r as unknown as TransportExpenseRow).date} /> },
                { key: "category", header: t.category, render: (r) => (r as unknown as TransportExpenseRow).category },
                { key: "amount", header: t.amount, render: (r) => <b>{formatAFN((r as unknown as TransportExpenseRow).amount)}</b> },
                { key: "note", header: t.note, render: (r) => (r as unknown as TransportExpenseRow).note || "—" },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- report ---- */}
        <TabsContent value="report" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setReportPrint(true)} disabled={!reportQ.data}>
              <Printer className="h-4 w-4 me-1" /> {t.printReport}
            </Button>
          </div>
          {reportQ.isLoading || !reportQ.data ? (
            <Loading rows={4} />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard title={t.revenue} value={formatAFN(reportQ.data.revenue)} icon={<TrendingUp className="h-4 w-4" />} />
                <StatCard title={t.expensesShort} value={formatAFN(reportQ.data.expenseTotal)} icon={<TrendingDown className="h-4 w-4" />} />
                <StatCard
                  title={t.profitLoss}
                  value={formatAFN(reportQ.data.profit)}
                  icon={<Wallet className="h-4 w-4" />}
                  hint={reportQ.data.profit >= 0 ? t.revenue : t.expensesShort}
                />
              </div>
              <div className="rounded-md border max-h-96 overflow-y-auto nq-scroll">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="text-start p-2">{t.classroomName}</th>
                      <th className="text-start p-2">{t.revenue}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportQ.data.perClass.map((c, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2">{c.className}</td>
                        <td className="p-2 font-medium">{formatAFN(c.revenue)}</td>
                      </tr>
                    ))}
                    {reportQ.data.perClass.length === 0 && (
                      <tr><td colSpan={2} className="p-4 text-center text-muted-foreground">{t.noData}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <EnrollTransportDialog open={enrollOpen} onClose={() => setEnrollOpen(false)} />
      <TransportPayDialog open={payOpen} onClose={() => setPayOpen(false)} onPaid={(p) => setReceipt(p)} />
      <TransportExpenseDialog open={expenseOpen} onClose={() => setExpenseOpen(false)} />

      {receipt && (
        <PrintOverlay title={t.printReceipt} onClose={() => setReceipt(null)}>
          <TransportReceiptPrint
            school={lookup.data?.school ?? null}
            data={{
              receiptNo: receipt.receiptNo,
              studentName: `${receipt.transportEnrollment.student.firstName} ${receipt.transportEnrollment.student.fatherName}`,
              routeName: receipt.transportEnrollment.routeName ?? "",
              monthKey: receipt.monthKey,
              amount: receipt.amount,
              date: typeof receipt.date === "string" ? receipt.date.slice(0, 10) : todayISO(),
            }}
          />
        </PrintOverlay>
      )}
      {reportPrint && reportQ.data && (
        <PrintOverlay title={t.monthlyReport} onClose={() => setReportPrint(false)}>
          <TransportReportPrint school={lookup.data?.school ?? null} report={reportQ.data} />
        </PrintOverlay>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Bus className="h-3.5 w-3.5" /> {t.transportPayments}: {n.n(paymentsQ.data?.total ?? 0)}
      </div>
    </div>
  );
}
