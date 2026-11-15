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
import { Download, MessageSquarePlus, Send, Trash2, Pencil } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/components/app/api";
import { useApp, useN, useT } from "@/components/app/store";
import { DataTable, JalaliDate, Loading, PageHeader, StatusBadge } from "@/components/app/ui";
import { currentMonthKey } from "@/lib/date";

// ---------- types ----------

interface NotificationRow {
  id: string; category: string; audience: string; phone: string | null; body: string;
  status: string; sentAt: string | null; createdAt: string;
  student: { id: string; studentNo: string; firstName: string; fatherName: string } | null;
  staff: { id: string; name: string } | null;
  classroom: { id: string; name: string } | null;
}

interface TemplateRow {
  id: string; key: string; category: string; bodyDr: string; bodyPs: string; bodyEn: string;
}

interface Lookup {
  classrooms: { id: string; name: string }[];
  staff: { id: string; name: string; position: string }[];
  studentsMinimal: { id: string; studentNo: string; firstName: string; fatherName: string }[];
  templates: TemplateRow[];
}

const CATEGORIES = ["حاضری", "فیس", "امتحان", "اطلاعیه", "معاش"];
const VAR_BUTTONS = ["{{نام}}", "{{صنف}}", "{{مبلغ}}", "{{ماه}}", "{{مکتب}}"];

// ---------- dialogs ----------

function ComposeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const n = useN();
  const qc = useQueryClient();
  const lookup = useQuery({ queryKey: ["lookup"], queryFn: () => apiGet<Lookup>("/api/x/lookup") });
  const [category, setCategory] = useState("اطلاعیه");
  const [audienceKind, setAudienceKind] = useState<"class" | "student" | "staff">("class");
  const [classroomId, setClassroomId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [body, setBody] = useState("");
  const [monthKey, setMonthKey] = useState(currentMonthKey());

  // fetch guardian/staff phone when a specific recipient is picked
  const studentDetail = useQuery({
    queryKey: ["msg-student", studentId],
    queryFn: () =>
      apiGet<{ student: { guardianPhone: string | null } }>(`/api/x/students/${studentId}`),
    enabled: audienceKind === "student" && !!studentId,
  });
  const staffDetail = useQuery({
    queryKey: ["msg-staff", staffId],
    queryFn: () => apiGet<{ staff: { phone: string | null } }>(`/api/x/staff/${staffId}`),
    enabled: audienceKind === "staff" && !!staffId,
  });

  const templatesForCategory = (lookup.data?.templates ?? []).filter((x) => x.category === category);

  const create = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { category, body, monthKey };
      if (audienceKind === "class") {
        payload.audience = "والدین";
        payload.classroomId = classroomId;
      } else if (audienceKind === "student") {
        payload.audience = "والدین";
        payload.classroomId = classroomId || undefined;
        payload.studentId = studentId;
        payload.phone = studentDetail.data?.student.guardianPhone ?? undefined;
      } else {
        payload.audience = "کارمندان";
        payload.staffId = staffId;
        payload.phone = staffDetail.data?.staff.phone ?? undefined;
      }
      return apiPost<{ count: number }>("/api/x/notifications", payload);
    },
    onSuccess: (res) => {
      toast.success(`${n.n(res.count)} ${t.messagesCreated}`);
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setBody(""); setStudentId(""); setStaffId("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recipientOk =
    (audienceKind === "class" && !!classroomId) ||
    (audienceKind === "student" && !!studentId) ||
    (audienceKind === "staff" && !!staffId);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto nq-scroll">
        <DialogHeader>
          <DialogTitle>{t.smsCompose}</DialogTitle>
          <DialogDescription>{t.messageBody}</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{t.category}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t.audience}</Label>
            <Select value={audienceKind} onValueChange={(v) => setAudienceKind(v as "class" | "student" | "staff")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="class">{t.audienceClass}</SelectItem>
                <SelectItem value="student">{t.audienceStudent}</SelectItem>
                <SelectItem value="staff">{t.audienceStaff}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {audienceKind !== "staff" && (
            <div className="space-y-1">
              <Label>{audienceKind === "student" ? t.classroom : t.classroom}</Label>
              <Select value={classroomId} onValueChange={setClassroomId}>
                <SelectTrigger><SelectValue placeholder={t.selectClass} /></SelectTrigger>
                <SelectContent>
                  {(lookup.data?.classrooms ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {audienceKind === "student" && (
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
          )}
          {audienceKind === "staff" && (
            <div className="space-y-1">
              <Label>{t.selectStaffMember}</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue placeholder={t.selectStaffMember} /></SelectTrigger>
                <SelectContent>
                  {(lookup.data?.staff ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.position})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {templatesForCategory.length > 0 && (
          <div className="space-y-1">
            <Label>{t.templates}</Label>
            <Select
              value=""
              onValueChange={(v) => {
                const tpl = templatesForCategory.find((x) => x.id === v);
                if (tpl) setBody(tpl.bodyDr);
              }}
            >
              <SelectTrigger><SelectValue placeholder={t.select} /></SelectTrigger>
              <SelectContent>
                {templatesForCategory.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>{tpl.key}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label>{t.messageBody}</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          <div className="flex flex-wrap gap-1.5">
            {VAR_BUTTONS.map((v) => (
              <Button key={v} size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setBody((b) => `${b}${v}`)}>
                {v}
              </Button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !body.trim() || !recipientOk}>
            <MessageSquarePlus className="h-4 w-4 me-1" /> {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateDialog({
  open, onClose, template,
}: {
  open: boolean; onClose: () => void; template: TemplateRow | null;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [category, setCategory] = useState("اطلاعیه");
  const [bodyDr, setBodyDr] = useState("");
  const [bodyPs, setBodyPs] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [lastId, setLastId] = useState("");

  if (open && template && template.id !== lastId) {
    setLastId(template.id);
    setKey(template.key);
    setCategory(template.category);
    setBodyDr(template.bodyDr);
    setBodyPs(template.bodyPs);
    setBodyEn(template.bodyEn);
  }

  const save = useMutation({
    mutationFn: () =>
      apiPut(`/api/x/templates/${template?.id}`, { key, category, bodyDr, bodyPs, bodyEn }),
    onSuccess: () => {
      toast.success(t.saved);
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["lookup"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto nq-scroll">
        <DialogHeader>
          <DialogTitle>{t.edit} — {template?.key}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t.templates} (key)</Label>
              <Input value={key} onChange={(e) => setKey(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>{t.category}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>دری</Label>
            <Textarea value={bodyDr} onChange={(e) => setBodyDr(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1">
            <Label>پشتو</Label>
            <Textarea value={bodyPs} onChange={(e) => setBodyPs(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1">
            <Label>English</Label>
            <Textarea value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} rows={3} />
          </div>
          <p className="text-xs text-muted-foreground">{t.variables}: {"{{نام}} {{صنف}} {{مبلغ}} {{ماه}} {{مکتب}}"}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !key.trim()}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- main page ----------

export function MessagesPage() {
  const { t } = useT();
  const n = useN();
  const qc = useQueryClient();
  const user = useApp((s) => s.user);
  const isOwner = (user?.role ?? "STAFF") === "OWNER"; // notifications write excludes OWNER

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);

  const catQ = categoryFilter !== "all" ? `&category=${encodeURIComponent(categoryFilter)}` : "";
  const statusQ = statusFilter !== "all" ? `&status=${encodeURIComponent(statusFilter)}` : "";
  const notificationsQ = useQuery({
    queryKey: ["notifications", categoryFilter, statusFilter],
    queryFn: () => apiGet<{ items: NotificationRow[]; total: number }>(`/api/x/notifications?1=1${catQ}${statusQ}`),
  });

  const templatesQ = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiGet<{ items: TemplateRow[]; total: number }>("/api/x/templates"),
  });

  const sendNotification = useMutation({
    mutationFn: (id: string) => apiPost<{ item: NotificationRow }>(`/api/x/notifications/${id}/send`, {}),
    onSuccess: (res) => {
      if (res.item.status === "ارسال‌شده") {
        toast.success(t.sent);
      } else if (res.item.status === "ناکام") {
        toast.error(t.failed);
      } else {
        toast.warning(t.gatewayNotSet);
      }
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNotification = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/x/notifications/${id}`),
    onSuccess: () => {
      toast.success(t.deleted);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = async () => {
    try {
      const stamp = currentMonthKey();
      const res = await fetch(`/api/x/notifications/export?1=1${catQ}&monthKey=${stamp}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `notifications-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t.exportCsv);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.messages}
        subtitle={t.parents}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4 me-1" /> {t.exportCsv}
            </Button>
            <Button onClick={() => setComposeOpen(true)} disabled={isOwner}>
              <MessageSquarePlus className="h-4 w-4 me-1" /> {t.smsCompose}
            </Button>
          </div>
        }
      />
      <Tabs defaultValue="messages">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="messages">{t.messagesTab}</TabsTrigger>
          <TabsTrigger value="templates">{t.templates}</TabsTrigger>
        </TabsList>

        {/* ---- messages ---- */}
        <TabsContent value="messages" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                <SelectItem value="صف">{t.queue}</SelectItem>
                <SelectItem value="ارسال‌شده">{t.sent}</SelectItem>
                <SelectItem value="ناکام">{t.failed}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {notificationsQ.isLoading ? (
            <Loading rows={6} />
          ) : (
            <DataTable
              rows={(notificationsQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
              searchPlaceholder={`${t.search}: ${t.phone}`}
              searchKeys={["phone", "body"]}
              emptyText={t.noData}
              pageSize={10}
              columns={[
                { key: "category", header: t.category, render: (r) => (r as unknown as NotificationRow).category },
                { key: "audience", header: t.audience, render: (r) => ((r as unknown as NotificationRow).audience === "کارمندان" ? t.employees : t.parents) },
                { key: "phone", header: t.phone, render: (r) => <span dir="ltr">{(r as unknown as NotificationRow).phone ?? "—"}</span> },
                {
                  key: "body", header: t.messageBody,
                  render: (r) => {
                    const item = r as unknown as NotificationRow;
                    return <span className="text-xs line-clamp-2 max-w-64 inline-block">{item.body}</span>;
                  },
                },
                { key: "status", header: t.status, render: (r) => <StatusBadge status={(r as unknown as NotificationRow).status} /> },
                { key: "createdAt", header: t.date, render: (r) => <JalaliDate iso={(r as unknown as NotificationRow).createdAt} /> },
                {
                  key: "actions", header: t.actions,
                  render: (r) => {
                    const item = r as unknown as NotificationRow;
                    return (
                      <div className="flex gap-1.5">
                        {item.status === "صف" && !isOwner && (
                          <Button size="sm" onClick={() => sendNotification.mutate(item.id)} disabled={sendNotification.isPending}>
                            <Send className="h-4 w-4 me-1" /> {t.send}
                          </Button>
                        )}
                        {!isOwner && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              if (window.confirm(t.confirmDelete)) deleteNotification.mutate(item.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  },
                },
              ]}
            />
          )}
          <p className="text-xs text-muted-foreground">{t.sendQueue}: {n.n((notificationsQ.data?.items ?? []).filter((x) => x.status === "صف").length)}</p>
        </TabsContent>

        {/* ---- templates ---- */}
        <TabsContent value="templates" className="mt-3 space-y-3">
          {templatesQ.isLoading ? (
            <Loading rows={4} />
          ) : (
            <DataTable
              rows={(templatesQ.data?.items ?? []) as unknown as Array<Record<string, unknown>>}
              searchable={false}
              emptyText={t.noData}
              pageSize={8}
              columns={[
                { key: "key", header: t.templates, render: (r) => <span dir="ltr" className="font-medium">{(r as unknown as TemplateRow).key}</span> },
                { key: "category", header: t.category, render: (r) => (r as unknown as TemplateRow).category },
                {
                  key: "bodyDr", header: t.templateBody,
                  render: (r) => <span className="text-xs line-clamp-2 max-w-96 inline-block">{(r as unknown as TemplateRow).bodyDr}</span>,
                },
                {
                  key: "actions", header: t.actions,
                  render: (r) => (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isOwner}
                      onClick={() => {
                        setEditingTemplate(r as unknown as TemplateRow);
                        setTemplateOpen(true);
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
      </Tabs>

      <ComposeDialog open={composeOpen} onClose={() => setComposeOpen(false)} />
      <TemplateDialog open={templateOpen} template={editingTemplate} onClose={() => setTemplateOpen(false)} />
    </div>
  );
}
