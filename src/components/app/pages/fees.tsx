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
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Wallet, Printer, BadgeCheck, Send } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/components/app/api";
import { useApp, useN, useT } from "@/components/app/store";
import { DataTable, JalaliDate, Loading, PageHeader, StatCard, StatusBadge } from "@/components/app/ui";
import { PrintOverlay, DocLetterhead, SignatureRow, SchoolHeaderInfo } from "@/components/app/printable";
import { formatAFN } from "@/lib/money";
import { currentMonthKey, monthKeyLabel, todayISO, yearMonthKeys } from "@/lib/date";

// ---------- types ----------

interface InvoiceRow {
  id: string; enrollmentId: string; classroomId: string; monthKey: string;
  amount: number; discount: number; paidAmount: number; due: number; remaining: number;
  status: "unpaid" | "partial" | "paid"; createdAt: string;
  enrollment: { id: string; student: { id: string; studentNo: string; firstName: string; fatherName: string; guardianPhone: string | null } };
  classroom: { id: string; name: string; grade: number };
  payments: { id: string; receiptNo: string; amount: number; date: string; method: string }[];
}

interface PaymentRow {
  id: string; invoiceId: string; amount: number; date: string; method: string; receiptNo: string;
  invoice: {
    id: string; monthKey: string; amount: number;
    enrollment: { student: { studentNo: string; firstName: string; fatherName: string } };
    classroom: { name: string };
  };
}

interface HandoverRow {
  id: string; periodFrom: string; periodTo: string; amount: number; receiptNo: string;
  status: string; confirmedAt: string | null; note: string | null; createdAt: string;
  academicYear: { id: string; name: string };
}

interface FeeStructureRow {
  id: string; academicYearId: string; gradeBand: string; monthlyAmount: number;
  academicYear?: { id: string; name: string };
}

interface Lookup {
  years: { id: string; name: string }[];
  classrooms: { id: string; name: string; grade: number }[];
  school: SchoolHeaderInfo | null;
  feeStructures: FeeStructureRow[];
  templates: { id: string; key: string; category: string; bodyDr: string; bodyPs: string; bodyEn: string }[];
  settings: Record<string, unknown>;
}

interface ReceiptData {
  receiptNo: string;
  studentName: string;
  studentNo: string;
  classroom: string;
  monthKey: string;
  amount: number;
  method: string;
  date: string;
}

interface HandoverPrintData {
  receiptNo: string;
  periodFrom: string;
  periodTo: string;
  amount: number;
  note?: string | null;
}

// ---------- shared helpers ----------

function statusLabelDr(s: string, t: { paid: string; partial: string; unpaid: string }): string {
  if (s === "paid") return t.paid;
  if (s === "partial") return t.partial;
  return t.unpaid;
}

function statusBadgeClass(s: string): string {
  if (s === "paid") return "پرداخت‌شده";
  if (s === "partial") return "جزئی";
  return "پرداخت‌نشده";
}

// ---------- printables ----------

function FeeReceiptPrint({ school, data }: { school: SchoolHeaderInfo | null; data: ReceiptData }) {
  const n = useN();
  return (
    <div>
      <DocLetterhead school={school} />
      <div className="text-center font-bold mb-3">رسید وصول فیس</div>
      <table className="w-full text-xs border" dir="rtl">
        <tbody>
          <tr><td className="bg-gray-50 font-semibold w-40 p-1.5 border">نمبر رسید</td><td className="p-1.5 border" dir="ltr">{data.receiptNo}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">متعلم</td><td className="p-1.5 border">{data.studentName} {data.studentNo ? `(نمبر: ${data.studentNo})` : ""}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">صنف</td><td className="p-1.5 border">{data.classroom}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">ماه</td><td className="p-1.5 border">{monthKeyLabel(data.monthKey)}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">مبلغ وصولی</td><td className="p-1.5 border font-bold">{formatAFN(data.amount)}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">طریقه پرداخت</td><td className="p-1.5 border">{data.method}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">تاریخ</td><td className="p-1.5 border">{n.eastern(data.date)}</td></tr>
        </tbody>
      </table>
      <SignatureRow left="امضای دریافت‌کننده" right="امضای ولی" />
    </div>
  );
}

function HandoverPrint({ school, data }: { school: SchoolHeaderInfo | null; data: HandoverPrintData }) {
  const n = useN();
  return (
    <div>
      <DocLetterhead school={school} />
      <div className="text-center font-bold mb-3">رسید تسلیمی عواید مکتب به صاحب مکتب</div>
      <table className="w-full text-xs border" dir="rtl">
        <tbody>
          <tr><td className="bg-gray-50 font-semibold w-40 p-1.5 border">نمبر رسید</td><td className="p-1.5 border" dir="ltr">{data.receiptNo}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">دوره تسلیمی</td><td className="p-1.5 border">{monthKeyLabel(data.periodFrom)} الی {monthKeyLabel(data.periodTo)}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">مبلغ تسلیمی</td><td className="p-1.5 border font-bold">{formatAFN(data.amount)}</td></tr>
          {data.note ? <tr><td className="bg-gray-50 font-semibold p-1.5 border">یادداشت</td><td className="p-1.5 border">{data.note}</td></tr> : null}
        </tbody>
      </table>
      <SignatureRow left="امضای مدیر مالی" right="امضای صاحب مکتب" />
    </div>
  );
}

// ---------- dialogs ----------

function CollectFeeDialog({
  open, onClose, invoice, onCollected,
}: {
  open: boolean; onClose: () => void; invoice: InvoiceRow | null; onCollected: () => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const meta = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const [amount, setAmount] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState("نقدی");
  const [date, setDate] = useState(todayISO());
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  // reset form when a new invoice is picked
  const [lastInvoiceId, setLastInvoiceId] = useState("");
  if (invoice && invoice.id !== lastInvoiceId) {
    setLastInvoiceId(invoice.id);
    setAmount(invoice.remaining);
    setDiscount(0);
    setMethod("نقدی");
    setDate(todayISO());
    setReceipt(null);
  }

  const pay = useMutation({
    mutationFn: () =>
      apiPost<{ payment: { id: string }; receiptNo: string }>("/api/x/fees/payments", {
        invoiceId: invoice?.id, amount, discount, method, date,
      }),
    onSuccess: (res) => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["fees-unpaid"] });
      qc.invalidateQueries({ queryKey: ["payments-list"] });
      if (invoice) {
        setReceipt({
          receiptNo: res.receiptNo,
          studentName: `${invoice.enrollment.student.firstName} ${invoice.enrollment.student.fatherName}`,
          studentNo: invoice.enrollment.student.studentNo,
          classroom: invoice.classroom.name,
          monthKey: invoice.monthKey,
          amount,
          method,
          date,
        });
      }
      onCollected();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.collectFee}</DialogTitle>
            <DialogDescription>
              {invoice ? `${invoice.enrollment.student.firstName} ${invoice.enrollment.student.fatherName} — ${invoice.classroom.name} — ${monthKeyLabel(invoice.monthKey)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t.amountToPay}</Label>
              <Input type="number" dir="ltr" value={amount} onChange={(e) => setAmount(parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label>{t.discount}</Label>
              <Input type="number" dir="ltr" value={discount} onChange={(e) => setDiscount(parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label>{t.method}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="نقدی">{t.cash}</SelectItem>
                  <SelectItem value="بانکی">{t.bank}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t.payDate}</Label>
              <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {invoice && (
            <p className="text-xs text-muted-foreground">
              {t.remaining}: <b>{formatAFN(invoice.remaining)}</b>
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
            <Button onClick={() => pay.mutate()} disabled={pay.isPending || amount <= 0}>
              <Wallet className="h-4 w-4 me-1" /> {t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {receipt && (
        <PrintOverlay title={t.printFeeReceipt} onClose={() => setReceipt(null)}>
          <FeeReceiptPrint school={meta.data?.school ?? null} data={receipt} />
        </PrintOverlay>
      )}
    </>
  );
}

function GenerateInvoicesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const n = useN();
  const qc = useQueryClient();
  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const jy = parseInt(lookup.data?.years[0]?.name ?? "1405", 10) || 1405;
  const months = yearMonthKeys(jy);
  const [classroomId, setClassroomId] = useState("");
  const [monthKey, setMonthKey] = useState(currentMonthKey());

  const generate = useMutation({
    mutationFn: () => apiPost<{ created: number; skipped: number }>("/api/x/fees/generate", { classroomId, monthKey }),
    onSuccess: (res) => {
      toast.success(`${t.generatedOk}: ${n.n(res.created)} — ${t.skippedExisting}: ${n.n(res.skipped)}`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.generateInvoices}</DialogTitle>
          <DialogDescription>{t.selectMonth}</DialogDescription>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending || !classroomId}>{t.confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- main page ----------

export function FeesPage() {
  const { t } = useT();
  const n = useN();
  const qc = useQueryClient();
  const user = useApp((s) => s.user);
  const role = user?.role ?? "STAFF";
  const isOwner = role === "OWNER";
  const canConfirm = role === "OWNER" || role === "ADMIN";

  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const jy = parseInt(lookup.data?.years[0]?.name ?? "1405", 10) || 1405;
  const months = yearMonthKeys(jy);

  const [classFilter, setClassFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(currentMonthKey());
  const [statusFilter, setStatusFilter] = useState("all");
  const [collectInvoice, setCollectInvoice] = useState<InvoiceRow | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [rowReceipt, setRowReceipt] = useState<ReceiptData | null>(null);
  const [handoverPrint, setHandoverPrint] = useState<HandoverPrintData | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);

  const classQ = classFilter !== "all" ? `&classroomId=${classFilter}` : "";
  const statusQ = statusFilter !== "all" ? `&status=${statusFilter}` : "";

  const invoicesQ = useQuery({
    queryKey: ["invoices", classFilter, monthFilter, statusFilter],
    queryFn: () => apiGet<{ items: InvoiceRow[]; total: number }>(`/api/x/invoices?monthKey=${monthFilter}${classQ}${statusQ}`),
  });
  const invoiceRows = (invoicesQ.data?.items ?? []).map((inv) => ({
    ...inv,
    studentName: `${inv.enrollment.student.firstName} ${inv.enrollment.student.fatherName}`,
  }));

  const paymentsQ = useQuery({
    queryKey: ["payments-list", classFilter, monthFilter],
    queryFn: () => apiGet<{ items: PaymentRow[]; total: number }>(`/api/x/payments?monthKey=${monthFilter}${classQ}`),
  });

  const unpaidQ = useQuery({
    queryKey: ["fees-unpaid", classFilter, monthFilter],
    queryFn: () =>
      apiGet<{ items: InvoiceRow[]; totals: { billed: number; paid: number; remaining: number } }>(
        `/api/x/reports/fees?status=unpaid&monthKey=${monthFilter}${classQ}`,
      ),
  });
  const unpaidRows = (unpaidQ.data?.items ?? []).map((inv) => ({
    ...inv,
    studentName: `${inv.enrollment.student.firstName} ${inv.enrollment.student.fatherName}`,
  }));

  const handoversQ = useQuery({
    queryKey: ["handovers"],
    queryFn: () => apiGet<{ items: HandoverRow[]; total: number }>("/api/x/handovers"),
  });

  const structures = lookup.data?.feeStructures ?? [];
  const [structDraft, setStructDraft] = useState<Record<string, number>>({});
  const saveStructure = useMutation({
    mutationFn: (input: { id: string; monthlyAmount: number }) =>
      apiPut(`/api/x/fees/structures/${input.id}`, { monthlyAmount: input.monthlyAmount }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["lookup"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmHandover = useMutation({
    mutationFn: (id: string) => apiPut(`/api/x/handovers/${id}/confirm`, {}),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["handovers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const notifyUnpaid = useMutation({
    mutationFn: async () => {
      const items = (unpaidQ.data?.items ?? []).filter((i) => i.enrollment.student.guardianPhone);
      const tpl = (lookup.data?.templates ?? []).find((x) => x.key === "fee_remaining");
      const body = tpl?.bodyDr ?? "";
      if (!body) throw new Error(t.notFound);
      let count = 0;
      for (const item of items.slice(0, 100)) {
        await apiPost("/api/x/notifications", {
          category: "فیس",
          audience: "والدین",
          studentId: item.enrollment.student.id,
          classroomId: item.classroom.id,
          phone: item.enrollment.student.guardianPhone,
          monthKey: item.monthKey,
          body,
          "مبلغ": String(item.remaining),
        });
        count++;
      }
      return count;
    },
    onSuccess: (count) => toast.success(`${n.n(count)} ${t.queuedCount}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const invoiceStatusCell = (s: string) => (
    <StatusBadge status={statusBadgeClass(s)} />
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.fees}
        subtitle={t.feesTab}
        actions={
          <Button onClick={() => setGenOpen(true)}>
            <Wallet className="h-4 w-4 me-1" /> {t.generateInvoices}
          </Button>
        }
      />

      <Tabs defaultValue="invoices">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="invoices">{t.invoicesTab}</TabsTrigger>
          <TabsTrigger value="payments">{t.payments}</TabsTrigger>
          <TabsTrigger value="unpaid">{t.unpaidList}</TabsTrigger>
          <TabsTrigger value="handovers">{t.handover}</TabsTrigger>
          <TabsTrigger value="setup">{t.setupFeeTab}</TabsTrigger>
        </TabsList>

        {/* ---- invoices ---- */}
        <TabsContent value="invoices" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder={t.selectClass} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                {(lookup.data?.classrooms ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                <SelectItem value="paid">{t.paid}</SelectItem>
                <SelectItem value="partial">{t.partial}</SelectItem>
                <SelectItem value="unpaid">{t.unpaid}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {invoicesQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={invoiceRows as unknown as Array<Record<string, unknown>>}
              searchPlaceholder={`${t.search}: ${t.student}`}
              searchKeys={["studentName"]}
              emptyText={t.noData}
              pageSize={12}
              columns={[
                {
                  key: "student", header: t.student,
                  render: (r) => {
                    const inv = r as unknown as InvoiceRow;
                    return (
                      <div>
                        <div className="font-medium">{inv.enrollment.student.firstName} {inv.enrollment.student.fatherName}</div>
                        <div className="text-[11px] text-muted-foreground" dir="ltr">{inv.enrollment.student.studentNo}</div>
                      </div>
                    );
                  },
                },
                { key: "class", header: t.classroomName, render: (r) => (r as unknown as InvoiceRow).classroom.name },
                { key: "month", header: t.month, render: (r) => monthKeyLabel((r as unknown as InvoiceRow).monthKey) },
                { key: "amount", header: t.amount, render: (r) => formatAFN((r as unknown as InvoiceRow).amount) },
                { key: "discount", header: t.discount, render: (r) => formatAFN((r as unknown as InvoiceRow).discount) },
                { key: "paid", header: t.paid, render: (r) => formatAFN((r as unknown as InvoiceRow).paidAmount) },
                { key: "remaining", header: t.remaining, render: (r) => <b>{formatAFN((r as unknown as InvoiceRow).remaining)}</b> },
                { key: "status", header: t.invoiceStatus, render: (r) => invoiceStatusCell((r as unknown as InvoiceRow).status) },
                {
                  key: "actions", header: t.actions,
                  render: (r) => {
                    const inv = r as unknown as InvoiceRow;
                    if (inv.remaining <= 0) return <span className="text-xs text-muted-foreground">—</span>;
                    return (
                      <Button size="sm" onClick={() => setCollectInvoice(inv)}>{t.collectFee}</Button>
                    );
                  },
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- payments ---- */}
        <TabsContent value="payments" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder={t.selectClass} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                {(lookup.data?.classrooms ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {paymentsQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={(paymentsQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
              searchPlaceholder={`${t.search}: ${t.receiptNo}`}
              searchKeys={["receiptNo"]}
              emptyText={t.noData}
              pageSize={12}
              columns={[
                { key: "receiptNo", header: t.receiptNo, render: (r) => <span dir="ltr">{(r as unknown as PaymentRow).receiptNo}</span> },
                { key: "date", header: t.date, render: (r) => <JalaliDate iso={(r as unknown as PaymentRow).date} /> },
                {
                  key: "student", header: t.student,
                  render: (r) => {
                    const p = r as unknown as PaymentRow;
                    return `${p.invoice.enrollment.student.firstName} ${p.invoice.enrollment.student.fatherName}`;
                  },
                },
                { key: "class", header: t.classroomName, render: (r) => (r as unknown as PaymentRow).invoice.classroom.name },
                { key: "month", header: t.month, render: (r) => monthKeyLabel((r as unknown as PaymentRow).invoice.monthKey) },
                { key: "amount", header: t.amount, render: (r) => <b>{formatAFN((r as unknown as PaymentRow).amount)}</b> },
                { key: "method", header: t.method, render: (r) => (r as unknown as PaymentRow).method },
                {
                  key: "actions", header: t.actions,
                  render: (r) => {
                    const p = r as unknown as PaymentRow;
                    return (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setRowReceipt({
                            receiptNo: p.receiptNo,
                            studentName: `${p.invoice.enrollment.student.firstName} ${p.invoice.enrollment.student.fatherName}`,
                            studentNo: p.invoice.enrollment.student.studentNo,
                            classroom: p.invoice.classroom.name,
                            monthKey: p.invoice.monthKey,
                            amount: p.amount,
                            method: p.method,
                            date: typeof p.date === "string" ? p.date.slice(0, 10) : todayISO(),
                          })
                        }
                      >
                        <Printer className="h-4 w-4 me-1" /> {t.printReceipt}
                      </Button>
                    );
                  },
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- unpaid ---- */}
        <TabsContent value="unpaid" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder={t.selectClass} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                {(lookup.data?.classrooms ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => notifyUnpaid.mutate()} disabled={notifyUnpaid.isPending}>
              <Send className="h-4 w-4 me-1" /> {t.notifyParentsBtn}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard title={t.billedTotal} value={formatAFN(unpaidQ.data?.totals.billed ?? 0)} icon={<Wallet className="h-4 w-4" />} />
            <StatCard title={t.collectedTotal} value={formatAFN(unpaidQ.data?.totals.paid ?? 0)} icon={<BadgeCheck className="h-4 w-4" />} />
            <StatCard title={t.balance} value={formatAFN(unpaidQ.data?.totals.remaining ?? 0)} icon={<Wallet className="h-4 w-4" />} />
          </div>
          {unpaidQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={unpaidRows as unknown as Array<Record<string, unknown>>}
              searchPlaceholder={`${t.search}: ${t.student}`}
              searchKeys={["studentName"]}
              emptyText={t.noData}
              pageSize={12}
              columns={[
                {
                  key: "student", header: t.student,
                  render: (r) => {
                    const inv = r as unknown as InvoiceRow;
                    return (
                      <div>
                        <div className="font-medium">{inv.enrollment.student.firstName} {inv.enrollment.student.fatherName}</div>
                        <div className="text-[11px] text-muted-foreground" dir="ltr">{inv.enrollment.student.studentNo}</div>
                      </div>
                    );
                  },
                },
                { key: "class", header: t.classroomName, render: (r) => (r as unknown as InvoiceRow).classroom.name },
                { key: "month", header: t.month, render: (r) => monthKeyLabel((r as unknown as InvoiceRow).monthKey) },
                { key: "due", header: t.amount, render: (r) => formatAFN((r as unknown as InvoiceRow).due) },
                { key: "phone", header: t.guardianPhone, render: (r) => <span dir="ltr">{(r as unknown as InvoiceRow).enrollment.student.guardianPhone ?? "—"}</span> },
                { key: "remaining", header: t.remaining, render: (r) => <b>{formatAFN((r as unknown as InvoiceRow).remaining)}</b> },
                {
                  key: "actions", header: t.actions,
                  render: (r) => {
                    const inv = r as unknown as InvoiceRow;
                    return (
                      <Button size="sm" variant="outline" onClick={() => setCollectInvoice(inv)}>{t.collectFee}</Button>
                    );
                  },
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- handovers ---- */}
        <TabsContent value="handovers" className="mt-3 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setHandoverOpen(true)}>{t.handoverNew}</Button>
          </div>
          {handoversQ.isLoading ? (
            <Loading rows={4} />
          ) : (
            <DataTable
              rows={(handoversQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
              searchable={false}
              emptyText={t.noData}
              pageSize={8}
              columns={[
                { key: "receiptNo", header: t.receiptNo, render: (r) => <span dir="ltr">{(r as unknown as HandoverRow).receiptNo}</span> },
                {
                  key: "period", header: t.session,
                  render: (r) => {
                    const h = r as unknown as HandoverRow;
                    return `${monthKeyLabel(h.periodFrom)} — ${monthKeyLabel(h.periodTo)}`;
                  },
                },
                { key: "amount", header: t.amountHanded, render: (r) => <b>{formatAFN((r as unknown as HandoverRow).amount)}</b> },
                { key: "createdAt", header: t.date, render: (r) => <JalaliDate iso={(r as unknown as HandoverRow).createdAt} /> },
                { key: "status", header: t.status, render: (r) => <StatusBadge status={(r as unknown as HandoverRow).status} /> },
                {
                  key: "actions", header: t.actions,
                  render: (r) => {
                    const h = r as unknown as HandoverRow;
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setHandoverPrint({ receiptNo: h.receiptNo, periodFrom: h.periodFrom, periodTo: h.periodTo, amount: h.amount, note: h.note })
                          }
                        >
                          <Printer className="h-4 w-4 me-1" /> {t.print}
                        </Button>
                        {canConfirm && h.status === "در انتظار" && (
                          <Button size="sm" onClick={() => confirmHandover.mutate(h.id)} disabled={confirmHandover.isPending}>
                            <BadgeCheck className="h-4 w-4 me-1" /> {t.confirmReceiptBtn}
                          </Button>
                        )}
                      </div>
                    );
                  },
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- fee setup ---- */}
        <TabsContent value="setup" className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">{t.feeStructure} — {t.perMonth}</p>
          <div className="rounded-md border max-h-96 overflow-y-auto nq-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-2">{t.gradeBand}</th>
                  <th className="text-start p-2">{t.monthlyAmount}</th>
                  <th className="text-start p-2">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {structures.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="p-2 font-medium" dir="ltr">{n.eastern(s.gradeBand)}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        dir="ltr"
                        className="w-32"
                        disabled={isOwner}
                        value={structDraft[s.id] ?? s.monthlyAmount}
                        onChange={(e) =>
                          setStructDraft((d) => ({ ...d, [s.id]: parseInt(e.target.value, 10) || 0 }))
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isOwner || saveStructure.isPending || (structDraft[s.id] ?? s.monthlyAmount) === s.monthlyAmount}
                        onClick={() =>
                          saveStructure.mutate({ id: s.id, monthlyAmount: structDraft[s.id] ?? s.monthlyAmount })
                        }
                      >
                        {t.save}
                      </Button>
                    </td>
                  </tr>
                ))}
                {structures.length === 0 && (
                  <tr><td colSpan={3} className="p-4 text-center text-sm text-muted-foreground">{t.noData}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {isOwner && <p className="text-xs text-muted-foreground">{t.setupFeeTab}: {t.role} OWNER</p>}
        </TabsContent>
      </Tabs>

      <CollectFeeDialog open={!!collectInvoice} invoice={collectInvoice} onClose={() => setCollectInvoice(null)} onCollected={() => setCollectInvoice(null)} />
      <GenerateInvoicesDialog open={genOpen} onClose={() => setGenOpen(false)} />

      {rowReceipt && (
        <PrintOverlay title={t.printFeeReceipt} onClose={() => setRowReceipt(null)}>
          <FeeReceiptPrint school={lookup.data?.school ?? null} data={rowReceipt} />
        </PrintOverlay>
      )}
      {handoverPrint && (
        <PrintOverlay title={t.handoverReceipt} onClose={() => setHandoverPrint(null)}>
          <HandoverPrint school={lookup.data?.school ?? null} data={handoverPrint} />
        </PrintOverlay>
      )}
      <NewHandoverDialog
        open={handoverOpen}
        onClose={() => setHandoverOpen(false)}
        onSaved={(h) => {
          qc.invalidateQueries({ queryKey: ["handovers"] });
          setHandoverPrint({ receiptNo: h.receiptNo, periodFrom: h.periodFrom, periodTo: h.periodTo, amount: h.amount, note: h.note });
        }}
      />
    </div>
  );
}

function NewHandoverDialog({
  open, onClose, onSaved,
}: {
  open: boolean; onClose: () => void; onSaved: (h: HandoverRow) => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const jy = parseInt(lookup.data?.years[0]?.name ?? "1405", 10) || 1405;
  const months = yearMonthKeys(jy);
  const [periodFrom, setPeriodFrom] = useState(months[0]?.key ?? currentMonthKey());
  const [periodTo, setPeriodTo] = useState(currentMonthKey());
  const [note, setNote] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiPost<{ handover: HandoverRow }>("/api/x/handovers", { periodFrom, periodTo, note }),
    onSuccess: (res) => {
      toast.success(t.saved);
      setNote("");
      onSaved(res.handover);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.handoverNew}</DialogTitle>
          <DialogDescription>
            {t.amountHanded}: {t.notYetHanded} — {t.from} {t.to}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{t.periodFrom}</Label>
            <Select value={periodFrom} onValueChange={setPeriodFrom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t.periodTo}</Label>
            <Select value={periodTo} onValueChange={setPeriodTo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>{t.note}</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
