"use client";

import { ReactNode, useState } from "react";
import { GraduationCap, LayoutDashboard, Users, CalendarCheck, UserCog, Building2, Wallet, Bus, BookOpen, ClipboardList, Landmark, MessageSquare, Settings as SettingsIcon, LogOut, Languages, KeyRound, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useApp, useT } from "@/components/app/store";
import { LOCALES } from "@/lib/i18n";
import { toast } from "sonner";
import { apiPost, apiPut } from "@/components/app/api";

export interface NavItem {
  hash: string;
  labelKey: "dashboard" | "students" | "studentAttendance" | "staff" | "adminManagement" | "fees" | "transport" | "store" | "exams" | "finance" | "messages" | "settings";
  icon: ReactNode;
  roles: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { hash: "#/dashboard", labelKey: "dashboard", icon: <LayoutDashboard className="h-4 w-4" />, roles: ["ADMIN", "OWNER", "FINANCE", "TEACHER", "STAFF"] },
  { hash: "#/students", labelKey: "students", icon: <Users className="h-4 w-4" />, roles: ["ADMIN", "OWNER", "FINANCE", "TEACHER", "STAFF"] },
  { hash: "#/attendance", labelKey: "studentAttendance", icon: <CalendarCheck className="h-4 w-4" />, roles: ["ADMIN", "TEACHER", "STAFF"] },
  { hash: "#/staff", labelKey: "staff", icon: <UserCog className="h-4 w-4" />, roles: ["ADMIN", "OWNER"] },
  { hash: "#/admin", labelKey: "adminManagement", icon: <Building2 className="h-4 w-4" />, roles: ["ADMIN", "STAFF", "OWNER"] },
  { hash: "#/fees", labelKey: "fees", icon: <Wallet className="h-4 w-4" />, roles: ["ADMIN", "FINANCE", "OWNER"] },
  { hash: "#/transport", labelKey: "transport", icon: <Bus className="h-4 w-4" />, roles: ["ADMIN", "FINANCE", "OWNER"] },
  { hash: "#/store", labelKey: "store", icon: <BookOpen className="h-4 w-4" />, roles: ["ADMIN", "FINANCE", "OWNER"] },
  { hash: "#/exams", labelKey: "exams", icon: <ClipboardList className="h-4 w-4" />, roles: ["ADMIN", "TEACHER", "OWNER"] },
  { hash: "#/finance", labelKey: "finance", icon: <Landmark className="h-4 w-4" />, roles: ["ADMIN", "FINANCE", "OWNER"] },
  { hash: "#/messages", labelKey: "messages", icon: <MessageSquare className="h-4 w-4" />, roles: ["ADMIN", "STAFF", "FINANCE", "OWNER"] },
  { hash: "#/settings", labelKey: "settings", icon: <SettingsIcon className="h-4 w-4" />, roles: ["ADMIN", "OWNER"] },
];

function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const user = useApp((s) => s.user);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const saveProfile = async () => {
    try {
      await apiPost("/api/auth/profile", { fullName, phone });
      toast.success(t.saved);
      onClose();
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  };
  const changePassword = async () => {
    try {
      await apiPost("/api/auth/change-password", { currentPassword, newPassword });
      toast.success(t.saved);
      setCurrentPassword("");
      setNewPassword("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.profile} — {user?.username}</DialogTitle>
          <DialogDescription>{user?.role}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t.fullName}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.phone}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
          </div>
          <Button size="sm" onClick={saveProfile}>{t.save}</Button>
          <hr />
          <div className="space-y-1.5">
            <Label>{t.password}</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label>{t.changePassword}</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} dir="ltr" placeholder="min 6 chars" />
          </div>
          <Button size="sm" variant="outline" onClick={changePassword}>
            <KeyRound className="h-4 w-4 me-1" /> {t.changePassword}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AppShell({ route, children }: { route: string; children: ReactNode }) {
  const { t, locale, setLocale } = useT();
  const user = useApp((s) => s.user);
  const setUser = useApp((s) => s.setUser);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const role = user?.role ?? "STAFF";
  const items = NAV_ITEMS.filter((i) => i.roles.includes(role));

  const logout = async () => {
    await apiPost("/api/auth/logout", {});
    setUser(null);
    toast.success(t.logout);
  };

  const activeItem = items.find((i) => route.startsWith(i.hash));

  const navList = (
    <nav className="space-y-1 p-3" aria-label="main navigation">
      {items.map((i) => (
        <a
          key={i.hash}
          href={i.hash}
          onClick={() => setMobileNavOpen(false)}
          className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
            activeItem?.hash === i.hash ? "bg-primary/10 text-primary font-semibold" : "text-foreground/80"
          }`}
        >
          {i.icon}
          <span>{t[i.labelKey]}</span>
        </a>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur print-hide">
        <div className="flex items-center gap-3 px-3 sm:px-4 h-14">
          <div className="md:hidden">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="menu">
                  {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
              </SheetTrigger>
              <SheetContent side={locale === "en" ? "left" : "right"} className="w-64 p-0">
                <SheetTitle className="px-3 pt-4 text-sm flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  {t.appName}
                </SheetTitle>
                {navList}
              </SheetContent>
            </Sheet>
          </div>
          <a href="#/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="rounded-lg bg-primary/10 text-primary p-1.5">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-sm leading-tight truncate">{t.schoolName}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{t.schoolSub}</div>
            </div>
          </a>
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-1 rounded-md border p-0.5">
            {LOCALES.map((l) => (
              <Button
                key={l.code}
                size="sm"
                variant={locale === l.code ? "default" : "ghost"}
                className="h-7 px-2 text-xs"
                onClick={() => setLocale(l.code)}
                aria-label={`switch language ${l.label}`}
              >
                <Languages className="h-3 w-3 me-1" />
                {l.label}
              </Button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full focus:outline-none" aria-label="user menu">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                    {(user?.fullName ?? "?").slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden md:inline text-xs font-medium">{user?.fullName}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">
                {user?.fullName} — {user?.role}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                <KeyRound className="h-4 w-4 me-2" /> {t.profile} / {t.changePassword}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut className="h-4 w-4 me-2" /> {t.logout}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden md:block w-56 shrink-0 border-e bg-sidebar print-hide">
          <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto nq-scroll">
            {navList}
          </div>
        </aside>
        <main className="flex-1 min-w-0 p-3 sm:p-5 print-hide">{children}</main>
      </div>

      <footer className="border-t py-3 text-center text-[11px] text-muted-foreground mt-auto print-hide">
        {t.schoolName} — {t.creditAuthor} — {t.creditPhone}
      </footer>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
