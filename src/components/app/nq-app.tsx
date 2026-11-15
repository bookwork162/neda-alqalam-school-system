"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/components/app/api";
import { useApp, useHashRoute, useT } from "@/components/app/store";
import { LoginScreen } from "@/components/app/login";
import { AppShell } from "@/components/app/shell";
import { Loading } from "@/components/app/ui";
import { DashboardPage } from "@/components/app/pages/dashboard";
import { StudentsPage, StudentProfilePage } from "@/components/app/pages/students";
import { AttendancePage } from "@/components/app/pages/attendance";
import { StaffPage } from "@/components/app/pages/staff";
import { AdminPage } from "@/components/app/pages/admin";
import { FeesPage } from "@/components/app/pages/fees";
import { TransportPage } from "@/components/app/pages/transport";
import { StorePage } from "@/components/app/pages/store";
import { ExamsPage } from "@/components/app/pages/exams";
import { FinancePage } from "@/components/app/pages/finance";
import { MessagesPage } from "@/components/app/pages/messages";
import { SettingsPage } from "@/components/app/pages/settings";

function RouteOutlet({ route }: { route: string }) {
  const path = route.slice(1); // "/students/ID"
  if (path.startsWith("/students/")) {
    const id = path.split("/")[2];
    return <StudentProfilePage studentId={id} />;
  }
  switch (path) {
    case "/dashboard":
      return <DashboardPage />;
    case "/students":
      return <StudentsPage />;
    case "/attendance":
      return <AttendancePage />;
    case "/staff":
      return <StaffPage />;
    case "/admin":
      return <AdminPage />;
    case "/fees":
      return <FeesPage />;
    case "/transport":
      return <TransportPage />;
    case "/store":
      return <StorePage />;
    case "/exams":
      return <ExamsPage />;
    case "/finance":
      return <FinancePage />;
    case "/messages":
      return <MessagesPage />;
    case "/settings":
      return <SettingsPage />;
    default:
      return <DashboardPage />;
  }
}

function NqAppInner() {
  const { t } = useT();
  const user = useApp((s) => s.user);
  const setUser = useApp((s) => s.setUser);
  const authChecked = useApp((s) => s.authChecked);
  const setAuthChecked = useApp((s) => s.setAuthChecked);
  const { route } = useHashRoute();
  const queryClient = useQueryClient();

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet<{ user: null | { id: string; username: string; fullName: string; role: string; phone: string } }>("/api/auth/me");
        setUser(res.user);
      } catch {
        setUser(null);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-md px-6 space-y-3">
          <p className="text-center text-sm text-muted-foreground">{t.loading}</p>
          <Loading rows={3} />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={() => queryClient.invalidateQueries()} />;
  }

  return (
    <AppShell route={route}>
      <RouteOutlet route={route} />
    </AppShell>
  );
}

export function NqApp() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <NqAppInner />
    </QueryClientProvider>
  );
}
