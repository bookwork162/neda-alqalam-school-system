"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { BookOpen, Printer, Plus, Pencil, TrendingDown, TrendingUp, Wallet, TriangleAlert } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/components/app/api";
import { useApp, useN, useT } from "@/components/app/store";
import { DataTable, JalaliDate, Loading, PageHeader, StatCard } from "@/components/app/ui";
import { PrintOverlay, DocLetterhead, SignatureRow, SchoolHeaderInfo } from "@/components/app/printable";
import { formatAFN } from "@/lib/money";
import { todayISO } from "@/lib/date";

// ---------- types ----------

interface ItemRow {
  id: string; type: string; name: string; size: string | null;
  purchasePrice: number; salePrice: number; stockQty: number;
}

interface PurchaseRow {
  id: string; itemId: string; qty: number; unitPrice: number; total: number; date: string; supplier: string | null; note: string | null;
  item: { id: string; name: string; type: string; purchasePrice: number; salePrice: number };
}

interface SaleRow {
  id: string; studentId: string | null; itemId: string; qty: number; unitPrice: number; total: number; date: string; receiptNo: string;
  item: { id: string; name: string; type: string; salePrice: number };
  student: { id: string; studentNo: string; firstName: string; fatherName: string } | null;
}

interface StoreReport {
  type: string;
  revenue: number;
  purchases: number;
  profit: number;
  byItem: { name: string; sold: number; revenue: number }[];
}

interface Lookup {
  school: SchoolHeaderInfo | null;
  items: ItemRow[];
  studentsMinimal: { id: string; studentNo: string; firstName: string; fatherName: string }[];
}

// ---------- print ----------

function SaleReceiptPrint({
  school, data,
}: {
  school: SchoolHeaderInfo | null;
  data: { receiptNo: string; date: string; itemName: string; qty: number; unitPrice: number; total: number; studentName: string };
}) {
  const n = useN();
  return (
    <div>
      <DocLetterhead school={school} />
      <div className="text-center font-bold mb-3">رسید فروش اجناس</div>
      <table className="w-full text-xs border" dir="rtl">
        <tbody>
          <tr><td className="bg-gray-50 font-semibold w-40 p-1.5 border">نمبر رسید</td><td className="p-1.5 border" dir="ltr">{data.receiptNo}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">تاریخ</td><td className="p-1.5 border">{n.eastern(data.date)}</td></tr>
          {data.studentName && (
            <tr><td className="bg-gray-50 font-semibold p-1.5 border">متعلم</td><td className="p-1.5 border">{data.studentName}</td></tr>
          )}
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">جنس</td><td className="p-1.5 border">{data.itemName}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">تعداد</td><td className="p-1.5 border">{n.eastern(data.qty)}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">قیمت واحد</td><td className="p-1.5 border">{formatAFN(data.unitPrice)}</td></tr>
          <tr><td className="bg-gray-50 font-semibold p-1.5 border">مجموع</td><td className="p-1.5 border font-bold">{formatAFN(data.total)}</td></tr>
        </tbody>
      </table>
      <SignatureRow left="امضای فروشنده" right="امضای خریدار" />
    </div>
  );
}

function StoreReportPrint({ school, report }: { school: SchoolHeaderInfo | null; report: StoreReport }) {
  return (
    <div>
      <DocLetterhead school={school} />
      <div className="text-center font-bold mb-3">گذارش مفاد و نقص — {report.type === "یونیفورم" ? "یونیفورم" : "کتاب‌ها"}</div>
      <div className="grid grid-cols-3 gap-3 text-xs mb-3">
        <div className="border p-2 text-center"><div className="text-muted-foreground">عواید فروشات</div><b>{formatAFN(report.revenue)}</b></div>
        <div className="border p-2 text-center"><div className="text-muted-foreground">خریداری</div><b>{formatAFN(report.purchases)}</b></div>
        <div className={`border p-2 text-center ${report.profit >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
          <div className="text-muted-foreground">مفاد / نقص</div><b>{formatAFN(report.profit)}</b>
        </div>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-1">جنس</th>
            <th className="border p-1">فروخته‌شده</th>
            <th className="border p-1">عواید</th>
          </tr>
        </thead>
        <tbody>
          {report.byItem.map((c, i) => (
            <tr key={i}>
              <td className="border p-1">{c.name}</td>
              <td className="border p-1 text-center">{c.sold}</td>
              <td className="border p-1 text-end">{formatAFN(c.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SignatureRow left="امضای حسابدار" right="امضای مدیر" />
    </div>
  );
}

// ---------- dialogs ----------

function ItemDialog({
  open, onClose, editing,
}: {
  open: boolean; onClose: () => void; editing: ItemRow | null;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("کتاب");
  const [size, setSize] = useState("");
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [salePrice, setSalePrice] = useState(0);
  const [stockQty, setStockQty] = useState(0);
  const [lastId, setLastId] = useState("");

  // sync form when switching between add/edit targets
  if (open && (editing?.id ?? "") !== lastId) {
    setLastId(editing?.id ?? "");
    setName(editing?.name ?? "");
    setType(editing?.type ?? "کتاب");
    setSize(editing?.size ?? "");
    setPurchasePrice(editing?.purchasePrice ?? 0);
    setSalePrice(editing?.salePrice ?? 0);
    setStockQty(editing?.stockQty ?? 0);
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { name, type, size: size || undefined, purchasePrice, salePrice, stockQty };
      if (editing) return apiPut(`/api/x/items/${editing.id}`, body);
      return apiPost("/api/x/items", body);
    },
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["lookup"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `${t.edit} ${t.item}` : `${t.new} ${t.item}`}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label>{t.name}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t.category}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="کتاب">{t.books}</SelectItem>
                <SelectItem value="یونیفورم">{t.uniforms}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t.size}</Label>
            <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="S / M / L" dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label>{t.purchasePrice}</Label>
            <Input type="number" dir="ltr" value={purchasePrice} onChange={(e) => setPurchasePrice(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>{t.salePrice}</Label>
            <Input type="number" dir="ltr" value={salePrice} onChange={(e) => setSalePrice(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>{t.stockQty}</Label>
            <Input type="number" dir="ltr" value={stockQty} onChange={(e) => setStockQty(parseInt(e.target.value) || 0)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(todayISO());

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/x/purchases", { itemId, qty, unitPrice, supplier: supplier || undefined, date }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["lookup"] });
      qc.invalidateQueries({ queryKey: ["treasury"] });
      setItemId(""); setQty(1); setUnitPrice(0); setSupplier("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.recordPurchase}</DialogTitle>
          <DialogDescription>{t.purchase}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label>{t.item}</Label>
            <Select
              value={itemId}
              onValueChange={(v) => {
                setItemId(v);
                const it = (lookup.data?.items ?? []).find((x) => x.id === v);
                setUnitPrice(it?.purchasePrice ?? 0);
              }}
            >
              <SelectTrigger><SelectValue placeholder={t.select} /></SelectTrigger>
              <SelectContent>
                {(lookup.data?.items ?? []).map((it) => (
                  <SelectItem key={it.id} value={it.id}>{it.name} ({it.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t.quantity}</Label>
            <Input type="number" dir="ltr" value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>{t.unitPrice}</Label>
            <Input type="number" dir="ltr" value={unitPrice} onChange={(e) => setUnitPrice(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>{t.supplier}</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t.date}</Label>
            <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t.total}: {formatAFN(qty * unitPrice)}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !itemId || qty <= 0}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SaleDialog({
  open, onClose, onSold,
}: {
  open: boolean; onClose: () => void; onSold: (sale: SaleRow) => void;
}) {
  const { t } = useT();
  const n = useN();
  const qc = useQueryClient();
  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const [itemId, setItemId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [date, setDate] = useState(todayISO());

  const selectedItem = (lookup.data?.items ?? []).find((x) => x.id === itemId);
  const stockShort = !!selectedItem && qty > selectedItem.stockQty;

  const create = useMutation({
    mutationFn: () =>
      apiPost<{ item: SaleRow }>("/api/x/sales", {
        itemId, qty, unitPrice, date, studentId: studentId || undefined,
      }),
    onSuccess: (res) => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["lookup"] });
      qc.invalidateQueries({ queryKey: ["treasury"] });
      // augment the bare created row with item/student info for the receipt print
      const it = (lookup.data?.items ?? []).find((x) => x.id === itemId);
      const st = (lookup.data?.studentsMinimal ?? []).find((x) => x.id === studentId);
      onSold({
        ...res.item,
        item: it
          ? { id: it.id, name: it.name, type: it.type, salePrice: it.salePrice }
          : res.item.item,
        student: st
          ? { id: st.id, studentNo: st.studentNo, firstName: st.firstName, fatherName: st.fatherName }
          : res.item.student,
      });
      setItemId(""); setStudentId(""); setQty(1); setUnitPrice(0);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.recordSale}</DialogTitle>
          <DialogDescription>{t.sale}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label>{t.item}</Label>
            <Select
              value={itemId}
              onValueChange={(v) => {
                setItemId(v);
                const it = (lookup.data?.items ?? []).find((x) => x.id === v);
                setUnitPrice(it?.salePrice ?? 0);
                setQty(1);
              }}
            >
              <SelectTrigger><SelectValue placeholder={t.select} /></SelectTrigger>
              <SelectContent>
                {(lookup.data?.items ?? []).map((it) => (
                  <SelectItem key={it.id} value={it.id}>
                    {it.name} ({it.type}) — {t.stockQty}: {n.n(it.stockQty)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label>{t.saleToStudent}</Label>
            <Select value={studentId || "none"} onValueChange={(v) => setStudentId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t.optional} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— {t.optional} —</SelectItem>
                {(lookup.data?.studentsMinimal ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.firstName} {s.fatherName} — <span dir="ltr">{s.studentNo}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t.quantity}</Label>
            <Input type="number" dir="ltr" min={1} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>{t.unitPrice}</Label>
            <Input type="number" dir="ltr" value={unitPrice} onChange={(e) => setUnitPrice(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>{t.date}</Label>
            <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {stockShort && (
          <p className="text-xs font-medium text-red-700 flex items-center gap-1">
            <TriangleAlert className="h-3.5 w-3.5" />
            {t.insufficientStock} — {t.stockQty}: {n.n(selectedItem?.stockQty ?? 0)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t.total}: {formatAFN(qty * unitPrice)}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !itemId || qty <= 0 || stockShort}>
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- main page ----------

export function StorePage() {
  const { t } = useT();
  const n = useN();
  const qc = useQueryClient();
  const user = useApp((s) => s.user);
  const isOwner = (user?.role ?? "STAFF") === "OWNER";

  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const [typeFilter, setTypeFilter] = useState("all");
  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [lastSale, setLastSale] = useState<SaleRow | null>(null);
  const [reportType, setReportType] = useState("کتاب");
  const [reportPrint, setReportPrint] = useState(false);

  const typeQ = typeFilter !== "all" ? `&type=${encodeURIComponent(typeFilter)}` : "";
  const itemsQ = useQuery({
    queryKey: ["items", typeFilter],
    queryFn: () => apiGet<{ items: ItemRow[]; total: number }>(`/api/x/items?1=1${typeQ}`),
  });

  const purchasesQ = useQuery({
    queryKey: ["purchases"],
    queryFn: () => apiGet<{ items: PurchaseRow[]; total: number }>("/api/x/purchases"),
  });

  const salesQ = useQuery({
    queryKey: ["sales"],
    queryFn: () => apiGet<{ items: SaleRow[]; total: number }>("/api/x/sales"),
  });

  const reportQ = useQuery({
    queryKey: ["store-report", reportType],
    queryFn: () => apiGet<StoreReport>(`/api/x/reports/store?type=${encodeURIComponent(reportType)}`),
  });

  const itemsIndex = new Map((lookup.data?.items ?? []).map((it) => [it.id, it]));

  return (
    <div className="space-y-4">
      <PageHeader title={t.store} subtitle={`${t.books} / ${t.uniforms}`} />
      <Tabs defaultValue="items">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="items">{t.itemsTab}</TabsTrigger>
          <TabsTrigger value="purchases">{t.purchase}</TabsTrigger>
          <TabsTrigger value="sales">{t.salesTab}</TabsTrigger>
          <TabsTrigger value="report">{t.reportTab}</TabsTrigger>
        </TabsList>

        {/* ---- items ---- */}
        <TabsContent value="items" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                <SelectItem value="کتاب">{t.books}</SelectItem>
                <SelectItem value="یونیفورم">{t.uniforms}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                setEditingItem(null);
                setItemOpen(true);
              }}
              disabled={isOwner}
            >
              <Plus className="h-4 w-4 me-1" /> {t.add}
            </Button>
          </div>
          {itemsQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={(itemsQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
              searchPlaceholder={`${t.search}: ${t.name}`}
              searchKeys={["name", "size"]}
              emptyText={t.noData}
              pageSize={10}
              columns={[
                { key: "name", header: t.name, render: (r) => <span className="font-medium">{(r as unknown as ItemRow).name}</span> },
                { key: "type", header: t.category, render: (r) => ((r as unknown as ItemRow).type === "یونیفورم" ? t.uniforms : t.books) },
                { key: "size", header: t.size, render: (r) => (r as unknown as ItemRow).size || "—" },
                { key: "purchasePrice", header: t.purchasePrice, render: (r) => formatAFN((r as unknown as ItemRow).purchasePrice) },
                { key: "salePrice", header: t.salePrice, render: (r) => formatAFN((r as unknown as ItemRow).salePrice) },
                { key: "stockQty", header: t.stockQty, render: (r) => <b>{n.n((r as unknown as ItemRow).stockQty)}</b> },
                {
                  key: "actions", header: t.actions,
                  render: (r) => (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isOwner}
                      onClick={() => {
                        setEditingItem(r as unknown as ItemRow);
                        setItemOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4 me-1" /> {t.edit}
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- purchases ---- */}
        <TabsContent value="purchases" className="mt-3 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setPurchaseOpen(true)} disabled={isOwner}>
              <Plus className="h-4 w-4 me-1" /> {t.recordPurchase}
            </Button>
          </div>
          {purchasesQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={(purchasesQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
              searchable={false}
              emptyText={t.noData}
              pageSize={10}
              columns={[
                { key: "date", header: t.date, render: (r) => <JalaliDate iso={(r as unknown as PurchaseRow).date} /> },
                { key: "item", header: t.item, render: (r) => (r as unknown as PurchaseRow).item.name },
                { key: "qty", header: t.quantity, render: (r) => n.n((r as unknown as PurchaseRow).qty) },
                { key: "unitPrice", header: t.unitPrice, render: (r) => formatAFN((r as unknown as PurchaseRow).unitPrice) },
                { key: "total", header: t.total, render: (r) => <b>{formatAFN((r as unknown as PurchaseRow).total)}</b> },
                { key: "supplier", header: t.supplier, render: (r) => (r as unknown as PurchaseRow).supplier || "—" },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- sales ---- */}
        <TabsContent value="sales" className="mt-3 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setSaleOpen(true)} disabled={isOwner}>
              <Plus className="h-4 w-4 me-1" /> {t.recordSale}
            </Button>
          </div>
          {salesQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={(salesQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
              searchPlaceholder={`${t.search}: ${t.receiptNo}`}
              searchKeys={["receiptNo"]}
              emptyText={t.noData}
              pageSize={10}
              columns={[
                { key: "receiptNo", header: t.receiptNo, render: (r) => <span dir="ltr">{(r as unknown as SaleRow).receiptNo}</span> },
                { key: "date", header: t.date, render: (r) => <JalaliDate iso={(r as unknown as SaleRow).date} /> },
                {
                  key: "item", header: t.item,
                  render: (r) => {
                    const s = r as unknown as SaleRow;
                    return s.item?.name ?? itemsIndex.get(s.itemId)?.name ?? s.itemId;
                  },
                },
                {
                  key: "student", header: t.student,
                  render: (r) => {
                    const s = r as unknown as SaleRow;
                    return s.student ? `${s.student.firstName} ${s.student.fatherName}` : "—";
                  },
                },
                { key: "qty", header: t.quantity, render: (r) => n.n((r as unknown as SaleRow).qty) },
                { key: "unitPrice", header: t.unitPrice, render: (r) => formatAFN((r as unknown as SaleRow).unitPrice) },
                { key: "total", header: t.total, render: (r) => <b>{formatAFN((r as unknown as SaleRow).total)}</b> },
                {
                  key: "actions", header: t.actions,
                  render: (r) => (
                    <Button size="sm" variant="outline" onClick={() => setLastSale(r as unknown as SaleRow)}>
                      <Printer className="h-4 w-4 me-1" /> {t.printReceipt}
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- report ---- */}
        <TabsContent value="report" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex gap-1 rounded-md border p-0.5">
              <Button size="sm" variant={reportType === "کتاب" ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setReportType("کتاب")}>
                {t.books}
              </Button>
              <Button size="sm" variant={reportType === "یونیفورم" ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setReportType("یونیفورم")}>
                {t.uniforms}
              </Button>
            </div>
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
                <StatCard title={t.purchase} value={formatAFN(reportQ.data.purchases)} icon={<TrendingDown className="h-4 w-4" />} />
                <StatCard title={t.profitLoss} value={formatAFN(reportQ.data.profit)} icon={<Wallet className="h-4 w-4" />} />
              </div>
              <div className="rounded-md border max-h-96 overflow-y-auto nq-scroll">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="text-start p-2">{t.item}</th>
                      <th className="text-start p-2">{t.quantity}</th>
                      <th className="text-start p-2">{t.revenue}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportQ.data.byItem.map((c, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2">{c.name}</td>
                        <td className="p-2">{n.n(c.sold)}</td>
                        <td className="p-2 font-medium">{formatAFN(c.revenue)}</td>
                      </tr>
                    ))}
                    {reportQ.data.byItem.length === 0 && (
                      <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">{t.noData}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <ItemDialog open={itemOpen} editing={editingItem} onClose={() => setItemOpen(false)} />
      <PurchaseDialog open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
      <SaleDialog open={saleOpen} onClose={() => setSaleOpen(false)} onSold={(sale) => setLastSale(sale)} />

      {lastSale && (
        <PrintOverlay title={t.saleReceipt} onClose={() => setLastSale(null)}>
          <SaleReceiptPrint
            school={lookup.data?.school ?? null}
            data={{
              receiptNo: lastSale.receiptNo,
              date: typeof lastSale.date === "string" ? lastSale.date.slice(0, 10) : todayISO(),
              itemName: lastSale.item?.name ?? itemsIndex.get(lastSale.itemId)?.name ?? "",
              qty: lastSale.qty,
              unitPrice: lastSale.unitPrice,
              total: lastSale.total,
              studentName: lastSale.student ? `${lastSale.student.firstName} ${lastSale.student.fatherName}` : "",
            }}
          />
        </PrintOverlay>
      )}
      {reportPrint && reportQ.data && (
        <PrintOverlay title={t.monthlyReport} onClose={() => setReportPrint(false)}>
          <StoreReportPrint school={lookup.data?.school ?? null} report={reportQ.data} />
        </PrintOverlay>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" /> {t.itemsTab}: {n.n(lookup.data?.items.length ?? 0)}
      </div>
    </div>
  );
}
