"use client";

import { ReactNode, useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useN, useT } from "@/components/app/store";
import { formatJalali, todayISO } from "@/lib/date";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ title, value, icon, hint }: { title: string; value: string; icon?: ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        {icon && <div className="rounded-lg bg-primary/10 text-primary p-2.5">{icon}</div>}
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className="text-lg font-bold truncate">{value}</div>
          {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export function Loading({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="text-center text-sm text-muted-foreground py-10">{text}</div>;
}

type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

/** Simple client-side table with search + pagination */
export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  searchable = true,
  searchPlaceholder,
  pageSize = 10,
  emptyText,
  searchKeys,
  toolbar,
  footNote,
}: {
  columns: Column<T>[];
  rows: T[];
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyText: string;
  searchKeys?: string[];
  toolbar?: ReactNode;
  footNote?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const n = useN();
  const { locale } = useT();

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const keys = searchKeys ?? Object.keys(rows[0] ?? {});
    return rows.filter((r) =>
      keys.some((k) => String(r[k] ?? "").toLowerCase().includes(q.trim().toLowerCase())),
    );
  }, [rows, q, searchKeys]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-3">
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 justify-between">
          {searchable ? (
            <div className="relative w-full max-w-xs">
              <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="ps-8"
              />
            </div>
          ) : (
            <div />
          )}
          {toolbar}
        </div>
      )}
      {pageRows.length === 0 ? (
        <EmptyState text={emptyText} />
      ) : (
        <div className="rounded-md border max-h-[70vh] overflow-y-auto nq-scroll">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className={c.className}>{c.header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row, i) => (
                <TableRow key={(row.id as string) ?? i}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>{c.render(row)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        {locale === "en" ? (
          <span>{filtered.length} rows — page {safePage} of {totalPages}</span>
        ) : (
          <span>{n.eastern(filtered.length)} ردیف — صفحه {n.eastern(safePage)} از {n.eastern(totalPages)}</span>
        )}
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {footNote}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    "پرداخت‌شده": "bg-emerald-100 text-emerald-800 border-emerald-200",
    "جزئی": "bg-amber-100 text-amber-800 border-amber-200",
    "پرداخت‌نشده": "bg-red-100 text-red-800 border-red-200",
    "فعال": "bg-emerald-100 text-emerald-800 border-emerald-200",
    "غیرفعال": "bg-gray-100 text-gray-700 border-gray-200",
    "ترک تحصیل": "bg-red-100 text-red-800 border-red-200",
    "انتقال": "bg-amber-100 text-amber-800 border-amber-200",
    "تکمیل": "bg-teal-100 text-teal-800 border-teal-200",
    "حاضر": "bg-emerald-100 text-emerald-800 border-emerald-200",
    "غایب": "bg-red-100 text-red-800 border-red-200",
    "مریض": "bg-amber-100 text-amber-800 border-amber-200",
    "رخصتی": "bg-gray-100 text-gray-700 border-gray-200",
    "ماموریت": "bg-teal-100 text-teal-800 border-teal-200",
    "عالی": "bg-emerald-100 text-emerald-800 border-emerald-200",
    "خوب": "bg-teal-100 text-teal-800 border-teal-200",
    "قابل": "bg-amber-100 text-amber-800 border-amber-200",
    "مردود": "bg-red-100 text-red-800 border-red-200",
    "ارتقا": "bg-emerald-100 text-emerald-800 border-emerald-200",
    "ارتقا مشروط": "bg-amber-100 text-amber-800 border-amber-200",
    "تکرار صنف": "bg-red-100 text-red-800 border-red-200",
    "در جریان": "bg-gray-100 text-gray-700 border-gray-200",
    "صف": "bg-amber-100 text-amber-800 border-amber-200",
    "ارسال‌شده": "bg-emerald-100 text-emerald-800 border-emerald-200",
    "ناکام": "bg-red-100 text-red-800 border-red-200",
    "در انتظار": "bg-amber-100 text-amber-800 border-amber-200",
    "تسلیم‌شده": "bg-emerald-100 text-emerald-800 border-emerald-200",
    "برگزارشده": "bg-emerald-100 text-emerald-800 border-emerald-200",
    "برنامه‌ریزی‌شده": "bg-amber-100 text-amber-800 border-amber-200",
  };
  return (
    <Badge variant="outline" className={map[status] ?? ""}>
      {status}
    </Badge>
  );
}

export function JalaliDate({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span>—</span>;
  return <span>{formatJalali(iso)}</span>;
}

export function useTodayISO(): string {
  const [iso] = useState(() => todayISO());
  return iso;
}
