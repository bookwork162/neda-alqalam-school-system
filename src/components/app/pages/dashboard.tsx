"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCog, CalendarCheck, Wallet, PiggyBank, Landmark } from "lucide-react";
import { apiGet } from "@/components/app/api";
import { useN, useT } from "@/components/app/store";
import { PageHeader, StatCard, Loading, EmptyState, JalaliDate } from "@/components/app/ui";
import { formatAFN } from "@/lib/money";

/** GET /api/x/dashboard */
interface XDashboard {
  students: number;
  staff: number;
  todayPresent: number;
  todayPresentPercent: number;
  monthKey: string;
  monthCollected: number;
  monthRemaining: number;
  treasuryBalance: number;
  recentPayments: { id: string; amount: number; date: string; receiptNo: string; studentName: string; studentNo: string; classroom: string }[];
  monthlyCollection: { monthKey: string; label: string; amount: number }[];
}

interface DashboardResponse {
  stats: {
    activeStudents: number;
    staffCount: number;
    monthKey: string;
    presentToday: number;
    todayPresentPercent: number;
    monthlyCollected: number;
    monthlyBilled: number;
    feesRemaining: number;
    treasuryBalance: number;
  };
  recentPayments: { id: string; receiptNo: string; amount: number; date: string; studentName: string; classroom: string }[];
  chart: { month: string; monthKey: string; collected: number }[];
  classCounts: { id: string; name: string; grade: number; count: number }[];
}

export function DashboardPage() {
  const { t, locale } = useT();
  const n = useN();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async (): Promise<DashboardResponse> => {
      const [d, enr, lookup] = await Promise.all([
        apiGet<XDashboard>("/api/x/dashboard"),
        apiGet<{ items: { classroomId: string }[] }>("/api/x/enrollments?take=2000"),
        apiGet<{ classrooms: { id: string; name: string; grade: number }[] }>("/api/x/lookup"),
      ]);
      const counts = new Map<string, number>();
      for (const e of enr.items ?? []) counts.set(e.classroomId, (counts.get(e.classroomId) ?? 0) + 1);
      return {
        stats: {
          activeStudents: d.students,
          staffCount: d.staff,
          monthKey: d.monthKey,
          presentToday: d.todayPresent,
          todayPresentPercent: d.todayPresentPercent,
          monthlyCollected: d.monthCollected,
          monthlyBilled: d.monthCollected + d.monthRemaining,
          feesRemaining: d.monthRemaining,
          treasuryBalance: d.treasuryBalance,
        },
        recentPayments: (d.recentPayments ?? []).map((p) => ({
          id: p.id,
          receiptNo: p.receiptNo,
          amount: p.amount,
          date: p.date,
          studentName: p.studentName,
          classroom: p.classroom,
        })),
        chart: (d.monthlyCollection ?? []).map((m) => ({
          month: m.label,
          monthKey: m.monthKey,
          collected: m.amount,
        })),
        classCounts: (lookup.classrooms ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          grade: c.grade,
          count: counts.get(c.id) ?? 0,
        })),
      };
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <PageHeader title={t.dashboard} />
        <Loading rows={6} />
      </div>
    );
  }

  const s = data.stats;
  return (
    <div className="space-y-5">
      <PageHeader
        title={t.dashboard}
        subtitle={`${t.currentYear}: ۱۴۰۵ — ${t.month}: ${s.monthKey.replace("-", "/")}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard title={t.activeStudents} value={n.n(s.activeStudents)} icon={<Users className="h-5 w-5" />} />
        <StatCard title={t.staffCount} value={n.n(s.staffCount)} icon={<UserCog className="h-5 w-5" />} />
        <StatCard
          title={t.todayAttendance}
          value={n.n(s.presentToday)}
          hint={`${t.attendancePercent}: ${n.n(s.todayPresentPercent)}${t.percentSign}`}
          icon={<CalendarCheck className="h-5 w-5" />}
        />
        <StatCard title={t.monthlyCollected} value={formatAFN(s.monthlyCollected, locale)} hint={formatAFN(s.monthlyBilled, locale)} icon={<Wallet className="h-5 w-5" />} />
        <StatCard title={t.feesRemaining} value={formatAFN(s.feesRemaining, locale)} icon={<PiggyBank className="h-5 w-5" />} />
        <StatCard title={t.treasuryBalance} value={formatAFN(s.treasuryBalance, locale)} icon={<Landmark className="h-5 w-5" />} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">{t.feeCollectionChart}</CardTitle>
          </CardHeader>
          <CardContent dir="ltr">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={60} />
                <Tooltip
                  formatter={(value: number | string) => formatAFN(Number(value), locale)}
                  contentStyle={{ fontSize: 12, fontFamily: "Vazirmatn" }}
                />
                <Bar dataKey="collected" fill="#0d9488" name={t.monthlyCollected} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t.recentPayments}</CardTitle>
          </CardHeader>
          <CardContent className="max-h-72 overflow-y-auto nq-scroll">
            {data.recentPayments.length === 0 ? (
              <EmptyState text={t.noData} />
            ) : (
              <ul className="space-y-2.5">
                {data.recentPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{p.studentName}</div>
                      <div className="text-muted-foreground">
                        {p.classroom} — <span dir="ltr">{p.receiptNo}</span>
                      </div>
                      <div className="text-muted-foreground"><JalaliDate iso={p.date} /></div>
                    </div>
                    <div className="text-start shrink-0">
                      <div className="font-bold text-primary">{formatAFN(p.amount)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t.classes} — {t.studentsCount}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {data.classCounts.map((c) => (
              <div key={c.id} className="rounded-lg border p-3 text-center">
                <div className="text-xs text-muted-foreground">{c.name}</div>
                <div className="text-lg font-bold text-primary">{n.n(c.count)}</div>
                <div className="text-[10px] text-muted-foreground">{t.studentsCount}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
