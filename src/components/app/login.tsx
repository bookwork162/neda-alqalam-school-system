"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, LogIn } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/components/app/api";
import { useApp, useT } from "@/components/app/store";
import { LOCALES } from "@/lib/i18n";
import { BookOpen, Wallet, Users, ClipboardList } from "lucide-react";

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const { t, locale, setLocale } = useT();
  const setUser = useApp((s) => s.setUser);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username || !password) {
      toast.error(t.invalidCredentials);
      return;
    }
    setBusy(true);
    try {
      const res = await apiPost<{ user: { id: string; username: string; fullName: string; role: string; phone: string } }>(
        "/api/auth/login",
        { username, password },
      );
      setUser(res.user);
      toast.success(`${t.welcome}، ${res.user.fullName}`);
      onLogin();
    } catch (e) {
      toast.error(e instanceof Error && e.message === "invalid" ? t.invalidCredentials : t.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-4" dir="auto">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6 items-stretch">
        <Card className="border-emerald-100">
          <CardHeader className="text-center">
            <div className="mx-auto rounded-full bg-primary/10 text-primary p-4 w-fit">
              <GraduationCap className="h-10 w-10" />
            </div>
            <CardTitle className="text-2xl font-extrabold mt-2">{t.schoolName}</CardTitle>
            <p className="text-xs text-muted-foreground">{t.schoolSub}</p>
            <p className="text-sm text-muted-foreground mt-3">{t.loginWelcome}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">{t.username}</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="admin"
                dir="ltr"
                className="text-start"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t.password}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="••••••••"
                dir="ltr"
                className="text-start"
              />
            </div>
            <Button className="w-full" onClick={submit} disabled={busy}>
              <LogIn className="h-4 w-4 me-2" />
              {busy ? t.loading : t.loginBtn}
            </Button>
            <div className="flex items-center justify-center gap-1.5">
              {LOCALES.map((l) => (
                <Button
                  key={l.code}
                  size="sm"
                  variant={locale === l.code ? "default" : "ghost"}
                  onClick={() => setLocale(l.code)}
                >
                  {l.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-emerald-100 bg-emerald-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">{t.demoCredentials}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono" dir="ltr">
                <div className="rounded border bg-white p-2"><b>admin</b> / admin123</div>
                <div className="rounded border bg-white p-2"><b>owner</b> / owner123</div>
                <div className="rounded border bg-white p-2"><b>finance</b> / finance123</div>
                <div className="rounded border bg-white p-2"><b>teacher</b> / teacher123</div>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { icon: <Users className="h-4 w-4" />, label: t.students },
              { icon: <BookOpen className="h-4 w-4" />, label: t.exams },
              { icon: <Wallet className="h-4 w-4" />, label: t.finance },
              { icon: <ClipboardList className="h-4 w-4" />, label: t.studentAttendance },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border bg-white p-3 text-muted-foreground">
                <span className="text-primary">{f.icon}</span>
                {f.label}
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            {t.creditAuthor} — {t.creditPhone} — {t.creditEmail}
          </p>
        </div>
      </div>
    </div>
  );
}
