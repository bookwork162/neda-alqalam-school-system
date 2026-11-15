"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Download, Database, Plus, KeyRound, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/components/app/api";
import { useApp, useN, useT } from "@/components/app/store";
import { DataTable, Loading, PageHeader } from "@/components/app/ui";
import { MOE_GRADE_BANDS, type GradeBand } from "@/lib/moe-constants";
import { todayISO, formatJalali } from "@/lib/date";
import { LOCALES, type Locale } from "@/lib/i18n";

// ---------- types ----------

interface UserRow {
  id: string; username: string; fullName: string; role: string; active: boolean;
  phone: string | null; lastLoginAt: string | null; createdAt: string;
}

interface BranchRow {
  id: string; schoolId: string; name: string; address: string | null;
}

interface AuditRow {
  id: string; userId: string | null; action: string; entity: string; entityId: string | null;
  detail: string | null; createdAt: string;
}

interface Lookup {
  school: { id: string; name: string; nameEn: string; licenseNo: string; phone: string; email: string; address: string } | null;
  branches: BranchRow[];
  settings: Record<string, unknown>;
}

const ROLES = ["ADMIN", "OWNER", "FINANCE", "TEACHER", "STAFF"];

// ---------- dialogs ----------

function NewUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("STAFF");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/x/users", { username, fullName, role, phone: phone || undefined, password }),
    onSuccess: () => {
      toast.success(t.created);
      qc.invalidateQueries({ queryKey: ["users"] });
      setUsername(""); setFullName(""); setPhone(""); setPassword("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.newUser}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{t.username}</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label>{t.fullName}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t.role}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t.phone}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>{t.password}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
            {password.length > 0 && password.length < 6 && (
              <p className="text-xs text-red-700">{t.passwordMin}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !username.trim() || password.length < 6}>
            <UserPlus className="h-4 w-4 me-1" /> {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ open, onClose, user }: { open: boolean; onClose: () => void; user: UserRow | null }) {
  const { t } = useT();
  const [password, setPassword] = useState("");
  const save = useMutation({
    mutationFn: () => apiPut(`/api/x/users/${user?.id}/reset`, { password }),
    onSuccess: () => {
      toast.success(t.saved);
      setPassword("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.resetPassword} — {user?.username}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label>{t.password}</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
          {password.length > 0 && password.length < 6 && <p className="text-xs text-red-700">{t.passwordMin}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || password.length < 6}>
            <KeyRound className="h-4 w-4 me-1" /> {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- main page ----------

export function SettingsPage() {
  const { t, locale, setLocale } = useT();
  const n = useN();
  const qc = useQueryClient();
  const user = useApp((s) => s.user);
  const role = user?.role ?? "STAFF";
  const isAdmin = role === "ADMIN"; // settings + users write: ADMIN only

  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const settings = lookup.data?.settings ?? {};

  // school info draft
  const str = (k: string) => (typeof settings[k] === "string" ? (settings[k] as string) : "");
  const [schoolForm, setSchoolForm] = useState<Record<string, string> | null>(null);
  const draft = schoolForm ?? {
    schoolName: str("schoolName") || lookup.data?.school?.name || "",
    schoolNameEn: str("schoolNameEn") || lookup.data?.school?.nameEn || "",
    licenseNo: str("licenseNo") || lookup.data?.school?.licenseNo || "",
    schoolPhone: str("schoolPhone") || lookup.data?.school?.phone || "",
    schoolEmail: str("schoolEmail") || lookup.data?.school?.email || "",
    schoolAddress: str("schoolAddress") || lookup.data?.school?.address || "",
  };
  const setField = (k: string, v: string) => setSchoolForm({ ...draft, [k]: v });

  const saveSetting = useMutation({
    mutationFn: async (input: { key: string; value: string }) => {
      const res = await fetch(`/api/x/settings/${encodeURIComponent(input.key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: input.value }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["lookup"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSchoolInfo = async () => {
    for (const [key, value] of Object.entries(draft)) {
      await saveSetting.mutateAsync({ key, value });
    }
  };

  // moe rules draft
  const passMarkVal = typeof settings.passMark !== "undefined" ? String(settings.passMark) : "40";
  const minAverageVal = typeof settings.minAverage !== "undefined" ? String(settings.minAverage) : "55";
  const [rulesForm, setRulesForm] = useState<Record<string, string> | null>(null);
  const rulesDraft = rulesForm ?? { passMark: passMarkVal, minAverage: minAverageVal, defaultLocale: str("defaultLocale") || "dr" };

  const savedBands: GradeBand[] = Array.isArray(settings.gradeBands)
    ? (settings.gradeBands as GradeBand[])
    : MOE_GRADE_BANDS;
  const [bandsDraft, setBandsDraft] = useState<GradeBand[] | null>(null);
  const bands = bandsDraft ?? savedBands.map((b) => ({ ...b }));

  // branches
  const [newBranch, setNewBranch] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const addBranch = useMutation({
    mutationFn: () => apiPost("/api/x/branches", { name: newBranch, address: newBranchAddress, schoolId: lookup.data?.school?.id }),
    onSuccess: () => {
      toast.success(t.saved);
      setNewBranch(""); setNewBranchAddress("");
      qc.invalidateQueries({ queryKey: ["lookup"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delBranch = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/x/branches/${id}`),
    onSuccess: () => {
      toast.success(t.deleted);
      qc.invalidateQueries({ queryKey: ["lookup"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // users
  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<{ items: UserRow[]; total: number }>("/api/x/users"),
    enabled: isAdmin,
  });
  const toggleActive = useMutation({
    mutationFn: (u: UserRow) => apiPut(`/api/x/users/${u.id}`, { active: !u.active }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);

  // backup + audit
  const auditQ = useQuery({
    queryKey: ["audit"],
    queryFn: () => apiGet<{ items: AuditRow[]; total: number }>("/api/x/audit"),
  });
  const userNameById = new Map<string, string>();
  for (const u of usersQ.data?.items ?? []) userNameById.set(u.id, u.fullName || u.username);

  const downloadBackup = async () => {
    try {
      const res = await fetch("/api/x/backup");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `neda-alqalam-backup-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t.backup);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t.settings} subtitle={t.schoolInfo} />
      <Tabs defaultValue="school">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="school">{t.schoolInfo}</TabsTrigger>
          <TabsTrigger value="rules">{t.moeRules}</TabsTrigger>
          <TabsTrigger value="users">{t.users}</TabsTrigger>
          <TabsTrigger value="backup">{t.backupAuditTab}</TabsTrigger>
        </TabsList>

        {/* ---- school info ---- */}
        <TabsContent value="school" className="mt-3 space-y-4">
          <div className="rounded-lg border p-4 space-y-3 max-w-2xl">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t.schoolName}</Label>
                <Input value={draft.schoolName} onChange={(e) => setField("schoolName", e.target.value)} disabled={!isAdmin} />
              </div>
              <div className="space-y-1">
                <Label>{t.schoolNameEn}</Label>
                <Input value={draft.schoolNameEn} onChange={(e) => setField("schoolNameEn", e.target.value)} disabled={!isAdmin} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>{t.licenseNo}</Label>
                <Input value={draft.licenseNo} onChange={(e) => setField("licenseNo", e.target.value)} disabled={!isAdmin} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>{t.schoolPhone}</Label>
                <Input value={draft.schoolPhone} onChange={(e) => setField("schoolPhone", e.target.value)} disabled={!isAdmin} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>{t.schoolEmail}</Label>
                <Input value={draft.schoolEmail} onChange={(e) => setField("schoolEmail", e.target.value)} disabled={!isAdmin} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>{t.schoolAddress}</Label>
                <Input value={draft.schoolAddress} onChange={(e) => setField("schoolAddress", e.target.value)} disabled={!isAdmin} />
              </div>
            </div>
            <Button onClick={saveSchoolInfo} disabled={!isAdmin || saveSetting.isPending}>{t.save}</Button>
          </div>

          <div className="rounded-lg border p-4 space-y-3 max-w-2xl">
            <h3 className="font-bold text-sm">{t.branches}</h3>
            <ul className="space-y-1.5">
              {(lookup.data?.branches ?? []).map((b) => (
                <li key={b.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div>
                    <b>{b.name}</b>
                    {b.address && <span className="text-muted-foreground"> — {b.address}</span>}
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={!isAdmin} onClick={() => delBranch.mutate(b.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
              {(lookup.data?.branches ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t.noData}</p>}
            </ul>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1">
                <Label>{t.branch}</Label>
                <Input value={newBranch} onChange={(e) => setNewBranch(e.target.value)} className="w-48" disabled={!isAdmin} />
              </div>
              <div className="space-y-1">
                <Label>{t.address}</Label>
                <Input value={newBranchAddress} onChange={(e) => setNewBranchAddress(e.target.value)} className="w-56" disabled={!isAdmin} />
              </div>
              <Button onClick={() => addBranch.mutate()} disabled={!isAdmin || addBranch.isPending || !newBranch.trim()}>
                <Plus className="h-4 w-4 me-1" /> {t.addBranch}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ---- moe rules + sms ---- */}
        <TabsContent value="rules" className="mt-3 space-y-4">
          <div className="rounded-lg border p-4 space-y-3 max-w-2xl">
            <h3 className="font-bold text-sm">{t.moeRules}</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t.passMark}</Label>
                <Input
                  type="number"
                  dir="ltr"
                  value={rulesDraft.passMark}
                  disabled={!isAdmin}
                  onChange={(e) => setRulesForm({ ...rulesDraft, passMark: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>{t.minAverage}</Label>
                <Input
                  type="number"
                  dir="ltr"
                  value={rulesDraft.minAverage}
                  disabled={!isAdmin}
                  onChange={(e) => setRulesForm({ ...rulesDraft, minAverage: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.gradeBands}</Label>
              {bands.map((b, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    type="number"
                    dir="ltr"
                    className="w-24"
                    value={b.min}
                    disabled={!isAdmin}
                    onChange={(e) => {
                      const next = bands.map((x, xi) => (xi === i ? { ...x, min: parseInt(e.target.value, 10) || 0 } : x));
                      setBandsDraft(next);
                    }}
                  />
                  <Input
                    className="w-40"
                    value={b.label}
                    disabled={!isAdmin}
                    onChange={(e) => {
                      const next = bands.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x));
                      setBandsDraft(next);
                    }}
                  />
                  <span className="text-xs text-muted-foreground">&ge; {n.n(b.min)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label>{t.defaultLanguage}</Label>
              <Select
                value={rulesDraft.defaultLocale}
                disabled={!isAdmin}
                onValueChange={(v) => setRulesForm({ ...rulesDraft, defaultLocale: v })}
              >
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCALES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t.language}: {locale}</p>
            </div>
            <Button
              disabled={!isAdmin || saveSetting.isPending}
              onClick={async () => {
                await saveSetting.mutateAsync({ key: "passMark", value: rulesDraft.passMark });
                await saveSetting.mutateAsync({ key: "minAverage", value: rulesDraft.minAverage });
                await saveSetting.mutateAsync({ key: "defaultLocale", value: rulesDraft.defaultLocale });
                await saveSetting.mutateAsync({ key: "gradeBands", value: JSON.stringify(bands) });
                if (LOCALES.some((l) => l.code === rulesDraft.defaultLocale)) setLocale(rulesDraft.defaultLocale as Locale);
              }}
            >
              {t.save}
            </Button>
          </div>

          <div className="rounded-lg border p-4 space-y-3 max-w-2xl">
            <h3 className="font-bold text-sm">{t.smsGateway}</h3>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{t.apiUrl}</Label>
                <SmsInput settingKey="smsGatewayUrl" disabled={!isAdmin} />
              </div>
              <div className="space-y-1">
                <Label>{t.apiKey}</Label>
                <SmsInput settingKey="smsApiKey" disabled={!isAdmin} />
              </div>
              <div className="space-y-1">
                <Label>{t.sender}</Label>
                <SmsInput settingKey="smsSender" disabled={!isAdmin} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t.smsNote}</p>
          </div>
        </TabsContent>

        {/* ---- users ---- */}
        <TabsContent value="users" className="mt-3 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setNewUserOpen(true)} disabled={!isAdmin}>
              <UserPlus className="h-4 w-4 me-1" /> {t.newUser}
            </Button>
          </div>
          {!isAdmin ? (
            <p className="text-sm text-muted-foreground">{t.role} {role} — {t.users}</p>
          ) : usersQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={(usersQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
              searchPlaceholder={`${t.search}: ${t.username}`}
              searchKeys={["username", "fullName"]}
              emptyText={t.noData}
              pageSize={10}
              columns={[
                { key: "username", header: t.username, render: (r) => <span dir="ltr" className="font-medium">{(r as unknown as UserRow).username}</span> },
                { key: "fullName", header: t.fullName, render: (r) => (r as unknown as UserRow).fullName },
                { key: "role", header: t.role, render: (r) => <span dir="ltr">{(r as unknown as UserRow).role}</span> },
                {
                  key: "active", header: t.status,
                  render: (r) => {
                    const u = r as unknown as UserRow;
                    return (
                      <Switch
                        checked={u.active}
                        disabled={u.id === user?.id}
                        onCheckedChange={() => toggleActive.mutate(u)}
                        aria-label={u.username}
                      />
                    );
                  },
                },
                {
                  key: "lastLoginAt", header: t.lastLogin,
                  render: (r) => {
                    const iso = (r as unknown as UserRow).lastLoginAt;
                    return iso ? <span className="text-xs">{formatJalali(iso, locale)}</span> : <span className="text-xs">—</span>;
                  },
                },
                {
                  key: "actions", header: t.actions,
                  render: (r) => (
                    <Button size="sm" variant="outline" onClick={() => setResetUser(r as unknown as UserRow)}>
                      <KeyRound className="h-4 w-4 me-1" /> {t.resetPassword}
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ---- backup & audit ---- */}
        <TabsContent value="backup" className="mt-3 space-y-4">
          <div className="rounded-lg border p-4 max-w-2xl space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Database className="h-4 w-4" /> {t.backup}
            </div>
            <Button onClick={downloadBackup}>
              <Download className="h-4 w-4 me-1" /> {t.downloadBackupJson}
            </Button>
            <p className="text-xs text-muted-foreground">{t.backupInfo}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">{t.auditLog}</h3>
              <Button size="sm" variant="outline" onClick={() => auditQ.refetch()}>
                <RefreshCw className="h-4 w-4 me-1" /> {t.updated}
              </Button>
            </div>
            {auditQ.isLoading ? (
              <Loading rows={6} />
            ) : (
              <DataTable
                rows={(auditQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
                searchPlaceholder={`${t.search}: ${t.auditAction}`}
                searchKeys={["action", "entity"]}
                emptyText={t.noData}
                pageSize={10}
                columns={[
                  {
                    key: "createdAt", header: t.auditTime,
                    render: (r) => <span className="text-xs">{formatJalali((r as unknown as AuditRow).createdAt, locale)}</span>,
                  },
                  {
                    key: "userId", header: t.auditUser,
                    render: (r) => {
                      const id = (r as unknown as AuditRow).userId;
                      return <span className="text-xs">{id ? userNameById.get(id) ?? <span dir="ltr">{id.slice(0, 8)}</span> : "—"}</span>;
                    },
                  },
                  { key: "action", header: t.auditAction, render: (r) => <span dir="ltr" className="text-xs">{(r as unknown as AuditRow).action}</span> },
                  { key: "entity", header: t.auditEntity, render: (r) => <span dir="ltr" className="text-xs">{(r as unknown as AuditRow).entity}</span> },
                  {
                    key: "detail", header: t.auditDetails,
                    render: (r) => {
                      const d = (r as unknown as AuditRow).detail;
                      return <span className="text-xs line-clamp-1 max-w-80 inline-block" dir="ltr">{d ?? "—"}</span>;
                    },
                  },
                ]}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>

      {isAdmin && <NewUserDialog open={newUserOpen} onClose={() => setNewUserOpen(false)} />}
      {isAdmin && <ResetPasswordDialog open={!!resetUser} user={resetUser} onClose={() => setResetUser(null)} />}
    </div>
  );
}

/** SMS gateway settings input bound to a Setting key (saves individually) */
function SmsInput({ settingKey, disabled }: { settingKey: string; disabled?: boolean }) {
  const { t } = useT();
  const qc = useQueryClient();
  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const raw = lookup.data?.settings?.[settingKey];
  const initial = typeof raw === "string" ? raw : "";
  const [value, setValue] = useState<string | null>(null);
  const shown = value ?? initial;

  const save = useMutation({
    mutationFn: () => apiPut(`/api/x/settings/${settingKey}`, { value: shown }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["lookup"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex gap-1.5 items-center">
      <Input
        value={shown}
        disabled={disabled}
        dir="ltr"
        onChange={(e) => setValue(e.target.value)}
      />
      {!disabled && value !== null && (
        <Button size="sm" variant="outline" className="h-8" onClick={() => save.mutate()} disabled={save.isPending}>
          {t.save}
        </Button>
      )}
    </div>
  );
}
