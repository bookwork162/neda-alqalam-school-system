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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingDown, TrendingUp, Printer, Plus, Landmark, Wallet } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/components/app/api";
import { useApp, useN, useT } from "@/components/app/store";
import { DataTable, JalaliDate, Loading, PageHeader, StatCard, StatusBadge } from "@/components/app/ui";
import { PrintOverlay, DocLetterhead, SignatureRow, SchoolHeaderInfo } from "@/components/app/printable";
import { formatAFN } from "@/lib/money";
import { currentMonthKey, monthKeyLabel, todayISO, yearMonthKeys } from "@/lib/date";

// ---------- types ----------

interface ExpenseRow {
  id: string; categoryId: string; amount: number; date: string; description: string | null; voucherNo: string | null;
  category: { id: string; name: string };
}

interface SalaryRow {
  id: string; staffId: string; academicYearId: string; monthKey: string; amount: number;
  paidDate: string | null; status: string;
  staff: { id: string; staffNo: string; name: string; position: string; baseSalary: number };
}

interface TreasuryRow {
  id: string; academicYearId: string; type: string; source: string; amount: number;
  date: string; description: string | null;
}

interface ProfitLoss {
  monthKey: string;
  revenues: { fees: number; transport: number; books: number; uniforms: number; total: number };
  expenses: { byCategory: { name: string; amount: number }[]; salaries: number; total: number };
  net: number;
}

interface Lookup {
  years: { id: string; name: string }[];
  school: SchoolHeaderInfo | null;
  expenseCategories: { id: string; name: string }[];
}

// ---------- print ----------

function ProfitLossPrint({ school, report }: { school: SchoolHeaderInfo | null; report: ProfitLoss }) {
  const n = useN();
  return (
    <div>
      <DocLetterhead school={school} />
      <div className="text-center font-bold mb-3">گزارش مفاد و نقص ماهانه — {monthKeyLabel(report.monthKey)}</div>
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <div className="font-bold border-b mb-1">عواید</div>
          <table className="w-full border-collapse">
            <tbody>
              <tr><td className="border p-1">فیس</td><td className="border p-1 text-end">{formatAFN(report.revenues.fees)}</td></tr>
              <tr><td className="border p-1">ترانسپورت</td><td className="border p-1 text-end">{formatAFN(report.revenues.transport)}</td></tr>
              <tr><td className="border p-1">کتاب</td><td className="border p-1 text-end">{formatAFN(report.revenues.books)}</td></tr>
              <tr><td className="border p-1">یونیفورم</td><td className="border p-1 text-end">{formatAFN(report.revenues.uniforms)}</td></tr>
              <tr className="bg-gray-100 font-bold"><td className="border p-1">مجموع عواید</td><td className="border p-1 text-end">{formatAFN(report.revenues.total)}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <div className="font-bold border-b mb-1">مصارف</div>
          <table className="w-full border-collapse">
            <tbody>
              {report.expenses.byCategory.map((c, i) => (
                <tr key={i}><td className="border p-1">{c.name}</td><td className="border p-1 text-end">{formatAFN(c.amount)}</td></tr>
              ))}
              <tr><td className="border p-1">معاشات</td><td className="border p-1 text-end">{formatAFN(report.expenses.salaries)}</td></tr>
              <tr className="bg-gray-100 font-bold"><td className="border p-1">مجموع مصارف</td><td className="border p-1 text-end">{formatAFN(report.expenses.total)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-4 text-center border-2 border-black p-2 font-bold text-sm">
        صافی ماه: <span className={report.net >= 0 ? "text-emerald-700" : "text-red-700"}>{formatAFN(report.net)}</span>
      </div>
      <SignatureRow left="امضای حسابدار" right="امضای مدیر" />
    </div>
  );
}

// ---------- dialogs ----------

function ExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [voucherNo, setVoucherNo] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/x/expenses", { categoryId, amount, date, voucherNo: voucherNo || undefined, description }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["treasury"] });
      qc.invalidateQueries({ queryKey: ["profit-loss"] });
      setAmount(0); setVoucherNo(""); setDescription("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.recordExpense}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label>{t.category}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder={t.select} /></SelectTrigger>
              <SelectContent>
                {(lookup.data?.expenseCategories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t.amount}</Label>
            <Input type="number" dir="ltr" value={amount} onChange={(e) => setAmount(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>{t.date}</Label>
            <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t.voucherNo}</Label>
            <Input value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>{t.description}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !categoryId || amount <= 0}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () => apiPost("/api/x/treasury/withdraw", { amount, description, date: todayISO() }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["treasury"] });
      setAmount(0); setDescription("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.registerWithdrawal}</DialogTitle>
          <DialogDescription>{t.withdrawal} — {t.treasury}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t.amount}</Label>
            <Input type="number" dir="ltr" value={amount} onChange={(e) => setAmount(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>{t.description}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
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

function TypeBadge({ type, labels }: { type: string; labels: { income: string; outgoing: string; withdrawal: string } }) {
  const label = type === "دخل" ? labels.income : type === "تجری" ? labels.outgoing : labels.withdrawal;
  const cls =
    type === "دخل"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : type === "تجری"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-red-100 text-red-800 border-red-200";
  return <Badge variant="outline" className={cls}>{label}</Badge>;
}

/** Pure helper (module scope) — computes running treasury balance (دخل +, تجری/بردگی −) */
function withRunningBalance(rows: TreasuryRow[]): (TreasuryRow & { balance: number })[] {
  let bal = 0;
  return rows.map((r) => {
    bal += r.type === "دخل" ? r.amount : -r.amount;
    return { ...r, balance: bal };
  });
}

// ---------- main page ----------

export function FinancePage() {
  const { t } = useT();
  const n = useN();
  const qc = useQueryClient();
  const user = useApp((s) => s.user);
  const role = user?.role ?? "STAFF";
  const isOwner = role === "OWNER"; // owner: read-only money writes (403)
  const canWithdraw = role === "OWNER" || role === "ADMIN";

  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const jy = parseInt(lookup.data?.years[0]?.name ?? "1405", 10) || 1405;
  const months = yearMonthKeys(jy);

  // expenses
  const [catFilter, setCatFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const fromQ = fromDate ? `&from=${fromDate}` : "";
  const toQ = toDate ? `&to=${toDate}` : "";
  const catQ = catFilter !== "all" ? `&categoryId=${catFilter}` : "";
  const expensesQ = useQuery({
    queryKey: ["expenses", catFilter, fromDate, toDate],
    queryFn: () => apiGet<{ items: ExpenseRow[]; total: number }>(`/api/x/expenses?1=1${catQ}${fromQ}${toQ}`),
  });
  const expenses = expensesQ.data?.items ?? [];
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const delCategory = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/x/expenseCategories/${id}`),
    onSuccess: () => {
      toast.success(t.deleted);
      qc.invalidateQueries({ queryKey: ["lookup"] });
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [newCat, setNewCat] = useState("");
  const addCategory = useMutation({
    mutationFn: () => apiPost("/api/x/expenseCategories", { name: newCat }),
    onSuccess: () => {
      toast.success(t.saved);
      setNewCat("");
      qc.invalidateQueries({ queryKey: ["lookup"] });
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const catsQ = useQuery({
    queryKey: ["expense-categories"],
    queryFn: () => apiGet<{ items: { id: string; name: string }[]; total: number }>("/api/x/expenseCategories"),
  });

  // salaries
  const [monthFilter, setMonthFilter] = useState(currentMonthKey());
  const salariesQ = useQuery({
    queryKey: ["salaries", monthFilter],
    queryFn: () => apiGet<{ items: SalaryRow[]; total: number }>(`/api/x/salaries?monthKey=${monthFilter}`),
  });
  const salaries = salariesQ.data?.items ?? [];
  const salariesTotal = salaries.reduce((s, x) => s + x.amount, 0);
  const salariesPaid = salaries.filter((x) => x.status === "پرداخت‌شده").reduce((s, x) => s + x.amount, 0);
  const generateSalaries = useMutation({
    mutationFn: () => apiPost<{ created: number }>("/api/x/salaries/generate", { monthKey: monthFilter }),
    onSuccess: (res) => {
      toast.success(`${t.saved}: ${n.n(res.created)}`);
      qc.invalidateQueries({ queryKey: ["salaries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const paySalary = useMutation({
    mutationFn: (id: string) => apiPost(`/api/x/salaries/${id}/pay`, { paidDate: todayISO() }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["salaries"] });
      qc.invalidateQueries({ queryKey: ["treasury"] });
      qc.invalidateQueries({ queryKey: ["profit-loss"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // treasury
  const [treasuryType, setTreasuryType] = useState("all");
  const [treasuryMonth, setTreasuryMonth] = useState("all");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const typeQ = treasuryType !== "all" ? `&type=${encodeURIComponent(treasuryType)}` : "";
  const tMonthQ = treasuryMonth !== "all" ? `&monthKey=${treasuryMonth}` : "";
  const treasuryQ = useQuery({
    queryKey: ["treasury", treasuryType, treasuryMonth],
    queryFn: () => apiGet<{ items: TreasuryRow[]; total: number }>(`/api/x/treasury?1=1${typeQ}${tMonthQ}`),
  });
  const treasuryRows = [...(treasuryQ.data?.items ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const treasuryWithBalance = withRunningBalance(treasuryRows);
  const totalIncome = treasuryRows.filter((r) => r.type === "دخل").reduce((s, r) => s + r.amount, 0);
  const totalOutgoing = treasuryRows.filter((r) => r.type !== "دخل").reduce((s, r) => s + r.amount, 0);

  // profit/loss
  const [plMonth, setPlMonth] = useState(currentMonthKey());
  const plQ = useQuery({
    queryKey: ["profit-loss", plMonth],
    queryFn: () => apiGet<ProfitLoss>(`/api/x/reports/profit-loss?monthKey=${plMonth}`),
  });
  const [plPrint, setPlPrint] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeader title={t.finance} subtitle={t.profitLoss} />
      <Tabs defaultValue="expenses">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="expenses">{t.expenses}</TabsTrigger>
          <TabsTrigger value="categories">{t.categoriesTab}</TabsTrigger>
          <TabsTrigger value="salaries">{t.salaries}</TabsTrigger>
          <TabsTrigger value="treasury">{t.treasury}</TabsTrigger>
          <TabsTrigger value="profit">{t.profitLoss}</TabsTrigger>
        </TabsList>

        {/* ---- expenses ---- */}
        <TabsContent value="expenses" className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder={t.category} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                {(lookup.data?.expenseCategories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-1">
              <Label className="text-xs">{t.dateFrom}</Label>
              <Input type="date" dir="ltr" className="w-40" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.dateTo}</Label>
              <Input type="date" dir="ltr" className="w-40" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <Button onClick={() => setExpenseOpen(true)} disabled={isOwner}>
              <Plus className="h-4 w-4 me-1" /> {t.recordExpense}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard title={t.grossExpense} value={formatAFN(expensesTotal)} icon={<TrendingDown className="h-4 w-4" />} />
            <StatCard title={t.recordExpense} value={`${n.n(expenses.length)}`} icon={<Wallet className="h-4 w-4" />} />
            <StatCard title={t.expenseCategories} value={`${n.n(catsQ.data?.total ?? 0)}`} icon={<Landmark className="h-4 w-4" />} />
          </div>
          {expensesQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={expenses as unknown as Array<Record<string, unknown>>}
              searchPlaceholder={`${t.search}: ${t.description}`}
              searchKeys={["description", "voucherNo"]}
              emptyText={t.noData}
              pageSize={12}
              columns={[
                { key: "date", header: t.date, render: (r) => <JalaliDate iso={(r as unknown as ExpenseRow).date} /> },
                { key: "category", header: t.category, render: (r) => (r as unknown as ExpenseRow).category.name },
                { key: "description", header: t.description, render: (r) => (r as unknown as ExpenseRow).description || "—" },
                { key: "voucherNo", header: t.voucherNo, render: (r) => <span dir="ltr">{(r as unknown as ExpenseRow).voucherNo || "—"}</span> },
                { key: "amount", header: t.amount, render: (r) => <b>{formatAFN((r as unknown as ExpenseRow).amount)}</b> },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- categories ---- */}
        <TabsContent value="categories" className="mt-3 space-y-3">
          <div className="flex gap-2 items-end">
            <div className="space-y-1">
              <Label>{t.category}</Label>
              <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} className="w-56" />
            </div>
            <Button onClick={() => addCategory.mutate()} disabled={addCategory.isPending || !newCat.trim() || isOwner}>
              <Plus className="h-4 w-4 me-1" /> {t.add}
            </Button>
          </div>
          {catsQ.isLoading ? (
            <Loading rows={4} />
          ) : (
            <DataTable
              rows={(catsQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
              searchable={false}
              emptyText={t.noData}
              pageSize={10}
              columns={[
                { key: "name", header: t.category, render: (r) => <span className="font-medium">{(r as unknown as { name: string }).name}</span> },
                {
                  key: "actions", header: t.actions,
                  render: (r) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={isOwner}
                      onClick={() => delCategory.mutate((r as unknown as { id: string }).id)}
                    >
                      {t.delete}
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- salaries ---- */}
        <TabsContent value="salaries" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => generateSalaries.mutate()} disabled={generateSalaries.isPending || isOwner}>
              {t.payrollGenerate}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard title={t.total} value={formatAFN(salariesTotal)} icon={<Wallet className="h-4 w-4" />} />
            <StatCard title={t.salaryPaid} value={formatAFN(salariesPaid)} icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard title={t.balance} value={formatAFN(salariesTotal - salariesPaid)} icon={<TrendingDown className="h-4 w-4" />} />
          </div>
          {salariesQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={salaries as unknown as Array<Record<string, unknown>>}
              searchable={false}
              emptyText={t.noData}
              pageSize={12}
              columns={[
                {
                  key: "staff", header: t.fullName,
                  render: (r) => {
                    const s = r as unknown as SalaryRow;
                    return (
                      <div>
                        <div className="font-medium">{s.staff.name}</div>
                        <div className="text-[11px] text-muted-foreground" dir="ltr">{s.staff.staffNo}</div>
                      </div>
                    );
                  },
                },
                { key: "position", header: t.position, render: (r) => (r as unknown as SalaryRow).staff.position },
                { key: "month", header: t.month, render: (r) => monthKeyLabel((r as unknown as SalaryRow).monthKey) },
                { key: "amount", header: t.amount, render: (r) => <b>{formatAFN((r as unknown as SalaryRow).amount)}</b> },
                { key: "status", header: t.status, render: (r) => <StatusBadge status={(r as unknown as SalaryRow).status} /> },
                { key: "paidDate", header: t.payDate, render: (r) => <JalaliDate iso={(r as unknown as SalaryRow).paidDate} /> },
                {
                  key: "actions", header: t.actions,
                  render: (r) => {
                    const s = r as unknown as SalaryRow;
                    if (s.status === "پرداخت‌شده" || isOwner) return <span className="text-xs text-muted-foreground">—</span>;
                    return (
                      <Button size="sm" onClick={() => paySalary.mutate(s.id)} disabled={paySalary.isPending}>
                        {t.paySalary}
                      </Button>
                    );
                  },
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- treasury ---- */}
        <TabsContent value="treasury" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <Select value={treasuryType} onValueChange={setTreasuryType}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                <SelectItem value="دخل">{t.income}</SelectItem>
                <SelectItem value="تجری">{t.outgoing}</SelectItem>
                <SelectItem value="بردگی">{t.withdrawal}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={treasuryMonth} onValueChange={setTreasuryMonth}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canWithdraw && (
              <Button variant="outline" onClick={() => setWithdrawOpen(true)}>{t.registerWithdrawal}</Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard title={t.totalIncome} value={formatAFN(totalIncome)} icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard title={t.totalExpense} value={formatAFN(totalOutgoing)} icon={<TrendingDown className="h-4 w-4" />} />
            <StatCard title={t.treasuryBalance} value={formatAFN(totalIncome - totalOutgoing)} icon={<Landmark className="h-4 w-4" />} />
          </div>
          {treasuryQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={treasuryWithBalance as unknown as Array<Record<string, unknown>>}
              searchPlaceholder={`${t.search}: ${t.source}`}
              searchKeys={["source", "description"]}
              emptyText={t.noData}
              pageSize={12}
              columns={[
                { key: "date", header: t.date, render: (r) => <JalaliDate iso={(r as unknown as TreasuryRow & { balance: number }).date} /> },
                {
                  key: "type", header: t.status,
                  render: (r) => (
                    <TypeBadge
                      type={(r as unknown as TreasuryRow & { balance: number }).type}
                      labels={{ income: t.income, outgoing: t.outgoing, withdrawal: t.withdrawal }}
                    />
                  ),
                },
                { key: "source", header: t.source, render: (r) => (r as unknown as TreasuryRow & { balance: number }).source },
                { key: "description", header: t.description, render: (r) => (r as unknown as TreasuryRow & { balance: number }).description || "—" },
                { key: "amount", header: t.amount, render: (r) => <b>{formatAFN((r as unknown as TreasuryRow & { balance: number }).amount)}</b> },
                { key: "balance", header: t.runningBalance, render: (r) => formatAFN((r as unknown as TreasuryRow & { balance: number }).balance) },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- profit/loss ---- */}
        <TabsContent value="profit" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <Select value={plMonth} onValueChange={setPlMonth}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setPlPrint(true)} disabled={!plQ.data}>
              <Printer className="h-4 w-4 me-1" /> {t.printReport}
            </Button>
          </div>
          {plQ.isLoading || !plQ.data ? (
            <Loading rows={6} />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 font-bold mb-3 text-emerald-700">
                    <TrendingUp className="h-4 w-4" /> {t.revenue}
                  </div>
                  <ul className="space-y-2 text-sm">
                    <li className="flex justify-between"><span>{t.fees}</span><b>{formatAFN(plQ.data.revenues.fees)}</b></li>
                    <li className="flex justify-between"><span>{t.transport}</span><b>{formatAFN(plQ.data.revenues.transport)}</b></li>
                    <li className="flex justify-between"><span>{t.books}</span><b>{formatAFN(plQ.data.revenues.books)}</b></li>
                    <li className="flex justify-between"><span>{t.uniforms}</span><b>{formatAFN(plQ.data.revenues.uniforms)}</b></li>
                    <li className="flex justify-between border-t pt-2"><span className="font-bold">{t.grossIncome}</span><b>{formatAFN(plQ.data.revenues.total)}</b></li>
                  </ul>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 font-bold mb-3 text-red-700">
                    <TrendingDown className="h-4 w-4" /> {t.expensesShort}
                  </div>
                  <ul className="space-y-2 text-sm">
                    {plQ.data.expenses.byCategory.map((c, i) => (
                      <li key={i} className="flex justify-between"><span>{c.name}</span><b>{formatAFN(c.amount)}</b></li>
                    ))}
                    <li className="flex justify-between"><span>{t.salaries}</span><b>{formatAFN(plQ.data.expenses.salaries)}</b></li>
                    <li className="flex justify-between border-t pt-2"><span className="font-bold">{t.grossExpense}</span><b>{formatAFN(plQ.data.expenses.total)}</b></li>
                  </ul>
                </div>
              </div>
              <Card>
                <CardContent
                  className={`p-6 text-center ${plQ.data.net >= 0 ? "bg-emerald-50" : "bg-red-50"}`}
                >
                  <div className="text-sm text-muted-foreground">{t.netBalance} — {monthKeyLabel(plMonth)}</div>
                  <div className={`text-2xl font-extrabold ${plQ.data.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {formatAFN(plQ.data.net)}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <ExpenseDialog open={expenseOpen} onClose={() => setExpenseOpen(false)} />
      {canWithdraw && <WithdrawDialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />}
      {plPrint && plQ.data && (
        <PrintOverlay title={t.monthlyReport} onClose={() => setPlPrint(false)}>
          <ProfitLossPrint school={lookup.data?.school ?? null} report={plQ.data} />
        </PrintOverlay>
      )}
    </div>
  );
}
