// ============================================================
// /api/x/[...slug] — ONE catch-all API for مکتب خصوصی نداالقلم
// Contract: see /agent-ctx/api-contract.md
// Auth: every endpoint requires session cookie (nq_session).
// 401 {error:"unauthenticated"} / 403 {error:"forbidden"}
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser, hashPassword, requireUser, type AuthUser, type Role } from "@/lib/auth";
import { computeForEnrollment, getMoeRules, levelOf } from "@/lib/moe";
import {
  currentMonthKey,
  jalaliMonthDates,
  lastMonthKeys,
  monthKeyLabel,
  monthKeyRange,
  toISODate,
  todayJalali,
} from "@/lib/date";

// ---------- tiny helpers ----------

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

function err(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Turns thrown NextResponse (from requireUser) into a returnable response, or 500s. */
function handleCatch(e: unknown): NextResponse {
  if (e instanceof Response) return e as NextResponse;
  const msg = e instanceof Error ? e.message : String(e);
  console.error("API /api/x error:", msg);
  return err(msg || "خطای سرور", 500);
}

function qs(req: NextRequest): URLSearchParams {
  return req.nextUrl.searchParams;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function dateOf(v: unknown, fallback: Date = new Date()): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v) {
    const d = new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
}

function monthRangeFor(monthKey: string): { start: Date; end: Date } {
  const { start, end } = monthKeyRange(monthKey);
  return { start: new Date(`${start}T00:00:00.000Z`), end: new Date(`${end}T23:59:59.999Z`) };
}

// ---------- auth / roles ----------

const ALL: Role[] = ["ADMIN", "OWNER", "FINANCE", "TEACHER", "STAFF"];
const ACCOUNTING: Role[] = ["ADMIN", "FINANCE", "OWNER"]; // money-related read
const FINWRITE: Role[] = ["ADMIN", "FINANCE"]; // money-related write
const TEACHING: Role[] = ["ADMIN", "TEACHER", "STAFF"]; // attendance

async function audit(
  userId: string | undefined,
  action: string,
  entity: string,
  entityId: string | undefined,
  detail: unknown = {},
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: userId ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        detail: JSON.stringify(detail ?? {}),
      },
    });
  } catch {
    /* audit must never break the request */
  }
}

// ---------- prisma model introspection for generic CRUD ----------

type ScalarMeta = { type: string };

const modelCache = new Map<string, Map<string, ScalarMeta>>();

function scalarFields(modelName: string): Map<string, ScalarMeta> {
  const cached = modelCache.get(modelName);
  if (cached) return cached;
  const map = new Map<string, ScalarMeta>();
  // dmmf model names are PascalCase while resource keys are camelCase
  const dmName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === dmName);
  if (m) {
    for (const f of m.fields) {
      if (f.kind === "scalar") map.set(f.name, { type: f.type });
    }
  }
  modelCache.set(modelName, map);
  return map;
}

/** Pick only scalar fields from a body and coerce them to prisma-compatible values. */
function coerceData(modelName: string, body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, meta] of scalarFields(modelName)) {
    if (!(name in body)) continue;
    let v = body[name];
    if (v === undefined) continue;
    if (v === null) {
      out[name] = null;
      continue;
    }
    switch (meta.type) {
      case "DateTime":
        out[name] = dateOf(v);
        break;
      case "Int":
        out[name] = typeof v === "string" ? parseInt(v, 10) || 0 : Math.round(num(v));
        break;
      case "Float":
        out[name] = num(v);
        break;
      case "Boolean":
        out[name] = v === true || v === "true" || v === 1 || v === "1";
        break;
      default:
        out[name] = typeof v === "object" ? JSON.stringify(v) : String(v);
    }
  }
  return out;
}

function delegate(model: string): PrismaModelDelegate {
  return (db as unknown as Record<string, PrismaModelDelegate>)[model];
}

type PrismaModelDelegate = {
  findMany: (args?: unknown) => Promise<unknown[]>;
  findUnique: (args: unknown) => Promise<unknown>;
  findFirst: (args?: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  upsert: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
  count: (args?: unknown) => Promise<number>;
  aggregate: (args: unknown) => Promise<Record<string, { sum?: number | null; count?: number | null }>>;
  groupBy: (args: unknown) => Promise<Record<string, unknown>[]>;
  deleteMany: (args?: unknown) => Promise<{ count: number }>;
};

// ---------- resource registry ----------

interface ResourceDef {
  model: string;
  read: Role[];
  write: Role[];
  softDelete?: boolean;
}

const RESOURCES: Record<string, ResourceDef> = {
  students: { model: "student", read: ALL, write: ["ADMIN", "STAFF"], softDelete: true },
  staff: { model: "staff", read: ["ADMIN", "OWNER"], write: ["ADMIN"], softDelete: true },
  classrooms: { model: "classroom", read: ALL, write: ["ADMIN"] },
  subjects: { model: "subject", read: ALL, write: ["ADMIN"] },
  classSubjects: { model: "classSubject", read: ALL, write: ["ADMIN"] },
  years: { model: "academicYear", read: ALL, write: ["ADMIN"] },
  branches: { model: "branch", read: ["ADMIN", "OWNER"], write: ["ADMIN"] },
  enrollments: { model: "enrollment", read: ALL, write: ["ADMIN", "STAFF"] },
  feeStructures: { model: "feeStructure", read: ACCOUNTING, write: FINWRITE },
  invoices: { model: "feeInvoice", read: ACCOUNTING, write: FINWRITE },
  payments: { model: "feePayment", read: ACCOUNTING, write: FINWRITE },
  handovers: { model: "moneyHandover", read: ACCOUNTING, write: FINWRITE },
  transportEnrollments: { model: "transportEnrollment", read: ACCOUNTING, write: FINWRITE },
  transportPayments: { model: "transportPayment", read: ACCOUNTING, write: FINWRITE },
  transportExpenses: { model: "transportExpense", read: ACCOUNTING, write: FINWRITE },
  items: { model: "item", read: ALL, write: FINWRITE },
  purchases: { model: "purchase", read: ACCOUNTING, write: FINWRITE },
  sales: { model: "sale", read: ACCOUNTING, write: FINWRITE },
  expenseCategories: { model: "expenseCategory", read: ALL, write: FINWRITE },
  expenses: { model: "expense", read: ACCOUNTING, write: FINWRITE },
  salaries: { model: "salaryPayment", read: ACCOUNTING, write: FINWRITE },
  notifications: { model: "notification", read: ["ADMIN", "FINANCE", "STAFF"], write: ["ADMIN", "FINANCE", "STAFF"] },
  templates: { model: "messageTemplate", read: ALL, write: ["ADMIN"] },
  users: { model: "user", read: ["ADMIN"], write: ["ADMIN"] },
  settings: { model: "setting", read: ALL, write: ["ADMIN"] },
  exams: { model: "exam", read: ["ADMIN", "TEACHER", "OWNER"], write: ["ADMIN"] },
  treasury: { model: "treasuryTransaction", read: ACCOUNTING, write: FINWRITE },
  audit: { model: "auditLog", read: ["ADMIN", "OWNER"], write: [] },
  staffDocuments: { model: "staffDocument", read: ["ADMIN", "OWNER"], write: ["ADMIN"] },
};

const INCLUDES: Record<string, Record<string, unknown>> = {
  students: {
    enrollments: {
      include: { classroom: { select: { id: true, name: true, grade: true, section: true, level: true } } },
    },
  },
  classrooms: { academicYear: true, homeroomStaff: { select: { id: true, name: true } } },
  classSubjects: {
    subject: { select: { id: true, nameDr: true, namePs: true, nameEn: true } },
    classroom: { select: { id: true, name: true, grade: true, section: true } },
    staff: { select: { id: true, name: true, position: true } },
  },
  enrollments: {
    student: { select: { id: true, studentNo: true, firstName: true, fatherName: true, gender: true, status: true, guardianPhone: true } },
    classroom: { select: { id: true, name: true, grade: true, section: true, level: true } },
    academicYear: { select: { id: true, name: true } },
  },
  invoices: {
    enrollment: { include: { student: { select: { id: true, studentNo: true, firstName: true, fatherName: true, guardianPhone: true } } } },
    classroom: { select: { id: true, name: true, grade: true, section: true } },
    payments: true,
  },
  payments: {
    invoice: {
      include: {
        enrollment: { include: { student: { select: { id: true, studentNo: true, firstName: true, fatherName: true } } } },
        classroom: { select: { id: true, name: true, grade: true } },
      },
    },
  },
  handovers: { academicYear: { select: { id: true, name: true } } },
  transportEnrollments: {
    student: { select: { id: true, studentNo: true, firstName: true, fatherName: true, guardianPhone: true } },
    academicYear: { select: { id: true, name: true } },
  },
  transportPayments: {
    transportEnrollment: { include: { student: { select: { id: true, studentNo: true, firstName: true, fatherName: true } } } },
  },
  purchases: { item: { select: { id: true, name: true, type: true, purchasePrice: true, salePrice: true } } },
  sales: {
    item: { select: { id: true, name: true, type: true, salePrice: true } },
    student: { select: { id: true, studentNo: true, firstName: true, fatherName: true } },
  },
  expenses: { category: { select: { id: true, name: true } } },
  salaries: {
    staff: { select: { id: true, staffNo: true, name: true, position: true, baseSalary: true } },
    academicYear: { select: { id: true, name: true } },
  },
  notifications: {
    student: { select: { id: true, studentNo: true, firstName: true, fatherName: true } },
    staff: { select: { id: true, name: true } },
    classroom: { select: { id: true, name: true } },
  },
  exams: {
    classroom: { select: { id: true, name: true, grade: true, section: true, level: true } },
    academicYear: { select: { id: true, name: true } },
  },
  feeStructures: { academicYear: { select: { id: true, name: true } } },
};

// ---------- list filters ----------

function invoiceStatus(inv: { amount: number; discount: number; paidAmount: number }): string {
  const due = Math.max(0, inv.amount - (inv.discount ?? 0));
  const paid = inv.paidAmount ?? 0;
  if (paid <= 0) return "unpaid";
  if (paid >= due - 0.001) return "paid";
  return "partial";
}

function buildWhere(resource: string, q: URLSearchParams): Record<string, unknown> {
  const w: Record<string, unknown> = {};
  const str = (k: string) => (q.get(k) || "").trim();
  switch (resource) {
    case "students": {
      if (str("status")) w.status = str("status");
      if (str("gender")) w.gender = str("gender");
      if (str("classroomId")) w.enrollments = { some: { classroomId: str("classroomId") } };
      if (str("q")) {
        const s = str("q");
        w.OR = ["firstName", "fatherName", "grandFatherName", "studentNo", "tazkiraNo", "guardianPhone"].map(
          (f) => ({ [f]: { contains: s } }),
        );
      }
      break;
    }
    case "staff": {
      if (str("position")) w.position = str("position");
      if (str("status")) w.status = str("status");
      if (str("q")) {
        const s = str("q");
        w.OR = ["name", "fatherName", "staffNo", "phone"].map((f) => ({ [f]: { contains: s } }));
      }
      break;
    }
    case "invoices": {
      if (str("classroomId")) w.classroomId = str("classroomId");
      if (str("monthKey")) w.monthKey = str("monthKey");
      if (str("academicYearId")) w.academicYearId = str("academicYearId");
      break;
    }
    case "payments": {
      const inv: Record<string, unknown> = {};
      if (str("monthKey")) inv.monthKey = str("monthKey");
      if (str("classroomId")) inv.classroomId = str("classroomId");
      if (Object.keys(inv).length > 0) w.invoice = inv;
      break;
    }
    case "treasury": {
      if (str("type")) w.type = str("type");
      if (str("source")) w.source = str("source");
      if (str("academicYearId")) w.academicYearId = str("academicYearId");
      if (str("monthKey")) {
        const r = monthRangeFor(str("monthKey"));
        w.date = { gte: r.start, lte: r.end };
      }
      break;
    }
    case "expenses": {
      if (str("categoryId")) w.categoryId = str("categoryId");
      if (str("monthKey")) {
        const r = monthRangeFor(str("monthKey"));
        w.date = { gte: r.start, lte: r.end };
      }
      if (str("from") || str("to")) {
        w.date = {
          gte: str("from") ? new Date(`${str("from")}T00:00:00.000Z`) : undefined,
          lte: str("to") ? new Date(`${str("to")}T23:59:59.999Z`) : undefined,
        };
      }
      break;
    }
    case "sales": {
      if (str("itemId")) w.itemId = str("itemId");
      if (str("type")) w.item = { type: str("type") };
      if (str("monthKey")) {
        const r = monthRangeFor(str("monthKey"));
        w.date = { gte: r.start, lte: r.end };
      }
      break;
    }
    case "purchases": {
      if (str("itemId")) w.itemId = str("itemId");
      if (str("type")) w.item = { type: str("type") };
      if (str("monthKey")) {
        const r = monthRangeFor(str("monthKey"));
        w.date = { gte: r.start, lte: r.end };
      }
      break;
    }
    case "salaries": {
      if (str("monthKey")) w.monthKey = str("monthKey");
      if (str("staffId")) w.staffId = str("staffId");
      if (str("status")) w.status = str("status");
      if (str("academicYearId")) w.academicYearId = str("academicYearId");
      break;
    }
    case "exams": {
      if (str("classroomId")) w.classroomId = str("classroomId");
      if (str("academicYearId")) w.academicYearId = str("academicYearId");
      if (str("type")) w.type = str("type");
      break;
    }
    case "notifications": {
      if (str("status")) w.status = str("status");
      if (str("category")) w.category = str("category");
      if (str("audience")) w.audience = str("audience");
      if (str("studentId")) w.studentId = str("studentId");
      if (str("monthKey")) {
        const r = monthRangeFor(str("monthKey"));
        w.createdAt = { gte: r.start, lte: r.end };
      }
      break;
    }
    case "enrollments": {
      if (str("classroomId")) w.classroomId = str("classroomId");
      if (str("studentId")) w.studentId = str("studentId");
      if (str("academicYearId")) w.academicYearId = str("academicYearId");
      if (str("status")) w.status = str("status");
      break;
    }
    case "classrooms": {
      if (str("academicYearId")) w.academicYearId = str("academicYearId");
      if (str("grade")) w.grade = parseInt(str("grade"), 10) || undefined;
      if (str("level")) w.level = str("level");
      break;
    }
    case "transportEnrollments": {
      if (str("studentId")) w.studentId = str("studentId");
      if (str("academicYearId")) w.academicYearId = str("academicYearId");
      if (str("active")) w.active = str("active") === "true";
      break;
    }
    case "transportPayments": {
      if (str("monthKey")) w.monthKey = str("monthKey");
      if (str("transportEnrollmentId")) w.transportEnrollmentId = str("transportEnrollmentId");
      break;
    }
    case "handovers": {
      if (str("status")) w.status = str("status");
      if (str("academicYearId")) w.academicYearId = str("academicYearId");
      break;
    }
    case "feeStructures": {
      if (str("academicYearId")) w.academicYearId = str("academicYearId");
      if (str("gradeBand")) w.gradeBand = str("gradeBand");
      break;
    }
    case "classSubjects": {
      if (str("classroomId")) w.classroomId = str("classroomId");
      if (str("subjectId")) w.subjectId = str("subjectId");
      if (str("staffId")) w.staffId = str("staffId");
      break;
    }
    case "years": {
      if (str("isCurrent")) w.isCurrent = str("isCurrent") === "true";
      break;
    }
    case "items": {
      if (str("type")) w.type = str("type");
      break;
    }
    default:
      break;
  }
  return w;
}

const ORDER_BY: Record<string, unknown> = {
  students: { studentNo: "asc" },
  staff: { staffNo: "asc" },
  classrooms: [{ grade: "asc" }, { section: "asc" }],
  subjects: { nameDr: "asc" },
  invoices: [{ monthKey: "desc" }, { createdAt: "desc" }],
  payments: { date: "desc" },
  treasury: { date: "desc" },
  expenses: { date: "desc" },
  sales: { date: "desc" },
  purchases: { date: "desc" },
  salaries: [{ monthKey: "desc" }, { staffId: "asc" }],
  exams: { examDate: "desc" },
  notifications: { createdAt: "desc" },
  handovers: { createdAt: "desc" },
  enrollments: { rollNo: "asc" },
  audit: { createdAt: "desc" },
  settings: { key: "asc" },
  users: { username: "asc" },
  templates: { key: "asc" },
  expenseCategories: { name: "asc" },
  subjects: { nameDr: "asc" },
  items: [{ type: "asc" }, { name: "asc" }],
  feeStructures: { gradeBand: "asc" },
  transportExpenses: { date: "desc" },
  transportEnrollments: { id: "desc" },
  transportPayments: { date: "desc" },
  branches: { name: "asc" },
  classSubjects: { id: "asc" },
  years: { name: "desc" },
};

// ---------- sequence helpers (receipts, studentNo) ----------

async function nextSeqNo(
  prefix: string,
  yearName: string,
  exists: (no: string) => Promise<boolean>,
): Promise<string> {
  const base = prefix ? `${prefix}-${yearName}-` : `${yearName}-`;
  let n = 1;
  for (let i = 0; i < 9999; i++) {
    const candidate = `${base}${String(n).padStart(4, "0")}`;
    if (await exists(candidate)) {
      n++;
      continue;
    }
    return candidate;
  }
  return `${base}${Date.now()}`;
}

async function nextFeeReceipt(yearName: string): Promise<string> {
  return nextSeqNo("RS", yearName, async (no) => (await db.feePayment.findUnique({ where: { receiptNo: no } })) !== null);
}

async function nextSaleReceipt(yearName: string): Promise<string> {
  return nextSeqNo("SL", yearName, async (no) => (await db.sale.findUnique({ where: { receiptNo: no } })) !== null);
}

async function nextTransportReceipt(yearName: string): Promise<string> {
  return nextSeqNo("TP", yearName, async (no) => (await db.transportPayment.findUnique({ where: { receiptNo: no } })) !== null);
}

async function nextHandoverReceipt(yearName: string): Promise<string> {
  return nextSeqNo("HT", yearName, async (no) => (await db.moneyHandover.findUnique({ where: { receiptNo: no } })) !== null);
}

async function nextStudentNo(): Promise<string> {
  const jy = todayJalali().jy;
  const yearName = String(jy);
  return nextSeqNo("", yearName, async (no) => (await db.student.findUnique({ where: { studentNo: no } })) !== null);
}

// ---------- current academic year ----------

async function currentYear(): Promise<{ id: string; name: string; startDate: Date; endDate: Date; isCurrent: boolean } | null> {
  const school = await db.school.findFirst();
  if (school?.currentYearId) {
    const y = await db.academicYear.findUnique({ where: { id: school.currentYearId } });
    if (y) return y;
  }
  return (
    (await db.academicYear.findFirst({ where: { isCurrent: true } })) ??
    (await db.academicYear.findFirst({ orderBy: { name: "desc" } }))
  );
}

// ---------- treasury helper ----------

async function addTreasury(opts: {
  academicYearId: string;
  type: string;
  source: string;
  amount: number;
  date: Date;
  refModel?: string;
  refId?: string;
  description?: string;
  createdByUserId?: string;
}): Promise<void> {
  if (opts.amount === 0) return;
  await db.treasuryTransaction.create({
    data: {
      academicYearId: opts.academicYearId,
      type: opts.type,
      source: opts.source,
      amount: Math.abs(opts.amount),
      date: opts.date,
      refModel: opts.refModel ?? null,
      refId: opts.refId ?? null,
      description: opts.description ?? null,
      createdByUserId: opts.createdByUserId ?? null,
    },
  });
}

async function moneyAudit(userId: string, entity: string, entityId: string, amount: number, extra: Record<string, unknown> = {}) {
  await audit(userId, "money", entity, entityId, { amount, ...extra });
}

// ---------- settings helper ----------

async function settingsObject(): Promise<Record<string, unknown>> {
  const rows = await db.setting.findMany();
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}

// ============================================================
// LOOKUP
// ============================================================

async function lookupHandler(): Promise<NextResponse> {
  const [years, classrooms, subjects, staffList, studentsMinimal, feeStructures, expenseCategories, items, school, branches, templates] =
    await Promise.all([
      db.academicYear.findMany({ orderBy: { name: "desc" } }),
      db.classroom.findMany({
        orderBy: [{ grade: "asc" }, { section: "asc" }],
        select: { id: true, name: true, grade: true, section: true, level: true, academicYearId: true },
      }),
      db.subject.findMany({ orderBy: { nameDr: "asc" } }),
      db.staff.findMany({
        where: { status: "active" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, position: true, subjectSpecialty: true },
      }),
      db.student.findMany({
        where: { status: "active" },
        orderBy: { studentNo: "asc" },
        select: { id: true, studentNo: true, firstName: true, fatherName: true, gender: true },
      }),
      db.feeStructure.findMany({ orderBy: { gradeBand: "asc" } }),
      db.expenseCategory.findMany({ orderBy: { name: "asc" } }),
      db.item.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }),
      db.school.findFirst(),
      db.branch.findMany(),
      db.messageTemplate.findMany({ orderBy: { key: "asc" } }),
    ]);
  return json({
    years,
    classrooms,
    subjects,
    staff: staffList,
    studentsMinimal,
    feeStructures,
    expenseCategories,
    items,
    school,
    branches,
    settings: await settingsObject(),
    templates,
  });
}

// ============================================================
// STUDENT DETAIL  GET students/:id
// ============================================================

async function studentDetail(id: string): Promise<NextResponse> {
  const student = (await db.student.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: { classroom: { select: { id: true, name: true, grade: true, section: true, level: true } } },
        orderBy: { enrolledAt: "desc" },
      },
    },
  })) as Record<string, unknown> | null;
  if (!student) return err("not found", 404);

  const enrollmentIds = (student.enrollments as Record<string, unknown>[]).map((e) => e.id as string);

  const invoices = await db.feeInvoice.findMany({
    where: { enrollmentId: { in: enrollmentIds } },
    include: { payments: { orderBy: { date: "asc" } }, classroom: { select: { id: true, name: true } } },
    orderBy: { monthKey: "asc" },
  });

  const attendances = await db.studentAttendance.findMany({
    where: { enrollmentId: { in: enrollmentIds } },
    select: { status: true },
  });
  const statCounts = { total: attendances.length, present: 0, absent: 0, sick: 0, leave: 0 };
  for (const a of attendances) {
    if (a.status === "حاضر") statCounts.present++;
    else if (a.status === "غایب") statCounts.absent++;
    else if (a.status === "مریض") statCounts.sick++;
    else if (a.status === "رخصتی") statCounts.leave++;
  }
  const attendanceStats = {
    ...statCounts,
    percent: statCounts.total > 0 ? Math.round((statCounts.present / statCounts.total) * 1000) / 10 : 0,
  };

  const summaries = await db.studentAnnualSummary.findMany({
    where: { enrollmentId: { in: enrollmentIds } },
    include: { enrollment: { include: { classroom: { select: { id: true, name: true, grade: true } } } } },
    orderBy: { academicYearId: "asc" },
  });
  const results = await db.subjectResult.findMany({
    where: { enrollmentId: { in: enrollmentIds } },
    include: { subject: { select: { id: true, nameDr: true, nameEn: true } } },
  });
  const summariesWithResults = summaries.map((s) => ({
    ...s,
    results: results.filter((r) => r.enrollmentId === s.enrollmentId && r.academicYearId === s.academicYearId),
  }));

  const transportEnrollment = await db.transportEnrollment.findFirst({
    where: { studentId: id },
    include: { payments: { orderBy: { monthKey: "asc" } } },
    orderBy: { id: "desc" },
  });

  return json({
    student,
    enrollments: student.enrollments,
    invoices,
    attendanceStats,
    summaries: summariesWithResults,
    transport: { enrollment: transportEnrollment, payments: transportEnrollment?.payments ?? [] },
  });
}

// ============================================================
// STAFF DETAIL  GET staff/:id
// ============================================================

async function staffDetail(id: string): Promise<NextResponse> {
  const staff = await db.staff.findUnique({ where: { id } });
  if (!staff) return err("not found", 404);
  const [documents, attendance, salaries, classSubjects] = await Promise.all([
    db.staffDocument.findMany({ where: { staffId: id }, orderBy: { title: "asc" } }),
    db.staffAttendance.findMany({ where: { staffId: id }, orderBy: { date: "desc" }, take: 30 }),
    db.salaryPayment.findMany({
      where: { staffId: id },
      orderBy: { monthKey: "desc" },
      include: { academicYear: { select: { id: true, name: true } } },
    }),
    db.classSubject.findMany({
      where: { staffId: id },
      include: { classroom: { select: { id: true, name: true, grade: true } }, subject: { select: { id: true, nameDr: true } } },
    }),
  ]);
  return json({ staff, documents, attendance, salaries, classSubjects });
}

// ============================================================
// ATTENDANCE
// ============================================================

function normalizeDay(v: string | null | undefined): Date {
  const iso = toISODate(v || new Date());
  return new Date(`${iso}T00:00:00.000Z`);
}

async function attendanceBulk(user: AuthUser, body: Record<string, unknown>): Promise<NextResponse> {
  const kind = String(body.kind ?? "student");
  const day = normalizeDay(typeof body.date === "string" ? body.date : undefined);
  const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
  if (rows.length === 0) return err("rows خالی است");

  let saved = 0;
  if (kind === "staff") {
    for (const row of rows) {
      const staffId = String(row.staffId ?? "");
      if (!staffId) continue;
      const data = { staffId, date: day, status: String(row.status ?? "حاضر"), note: row.note ? String(row.note) : null };
      await db.staffAttendance.upsert({
        where: { staffId_date: { staffId, date: day } },
        create: data,
        update: { status: data.status, note: data.note },
      });
      saved++;
    }
  } else {
    for (const row of rows) {
      const enrollmentId = String(row.enrollmentId ?? "");
      if (!enrollmentId) continue;
      const data = { enrollmentId, date: day, status: String(row.status ?? "حاضر"), note: row.note ? String(row.note) : null };
      await db.studentAttendance.upsert({
        where: { enrollmentId_date: { enrollmentId, date: day } },
        create: data,
        update: { status: data.status, note: data.note },
      });
      saved++;
    }
  }
  await audit(user.id, "bulk", kind === "staff" ? "StaffAttendance" : "StudentAttendance", undefined, { saved, date: toISODate(day) });
  return json({ saved });
}

async function attendanceGrid(q: URLSearchParams): Promise<NextResponse> {
  const kind = q.get("kind") || "student";
  const day = normalizeDay(q.get("date"));
  if (kind === "staff") {
    const staffList = await db.staff.findMany({ where: { status: "active" }, orderBy: { name: "asc" } });
    const records = await db.staffAttendance.findMany({ where: { date: day } });
    const byStaff = new Map(records.map((r) => [r.staffId, r]));
    return json({
      rows: staffList.map((s) => {
        const rec = byStaff.get(s.id);
        return { staffId: s.id, staffNo: s.staffNo, name: s.name, position: s.position, status: rec?.status ?? null, note: rec?.note ?? null };
      }),
    });
  }
  const classroomId = q.get("classroomId");
  if (!classroomId) return err("classroomId لازم است");
  const enrollments = await db.enrollment.findMany({
    where: { classroomId, status: "active" },
    include: { student: { select: { studentNo: true, firstName: true, fatherName: true } } },
    orderBy: { rollNo: "asc" },
  });
  const ids = enrollments.map((e) => e.id);
  const records = await db.studentAttendance.findMany({ where: { enrollmentId: { in: ids }, date: day } });
  const byEnrollment = new Map(records.map((r) => [r.enrollmentId, r]));
  return json({
    date: toISODate(day),
    rows: enrollments.map((e) => {
      const rec = byEnrollment.get(e.id);
      return {
        enrollmentId: e.id,
        studentNo: e.student.studentNo,
        name: e.student.firstName,
        fatherName: e.student.fatherName,
        rollNo: e.rollNo,
        status: rec?.status ?? null,
        note: rec?.note ?? null,
      };
    }),
  });
}

async function attendanceMonth(q: URLSearchParams): Promise<NextResponse> {
  const monthKey = q.get("monthKey");
  if (!monthKey) return err("monthKey لازم است");
  const days = jalaliMonthDates(monthKey);
  const staffId = q.get("staffId");
  if (staffId) {
    const records = await db.staffAttendance.findMany({
      where: { staffId, date: { gte: new Date(`${days[0]}T00:00:00.000Z`), lte: new Date(`${days[days.length - 1]}T23:59:59.999Z`) } },
    });
    const byDate = new Map(records.map((r) => [toISODate(r.date), r]));
    return json({ monthKey, days: days.map((date) => ({ date, status: byDate.get(date)?.status ?? null })) });
  }
  const enrollmentId = q.get("enrollmentId");
  if (!enrollmentId) return err("enrollmentId لازم است");
  const records = await db.studentAttendance.findMany({
    where: {
      enrollmentId,
      date: { gte: new Date(`${days[0]}T00:00:00.000Z`), lte: new Date(`${days[days.length - 1]}T23:59:59.999Z`) },
    },
  });
  const byDate = new Map(records.map((r) => [toISODate(r.date), r]));
  return json({ monthKey, days: days.map((date) => ({ date, status: byDate.get(date)?.status ?? null })) });
}

// ============================================================
// FEES
// ============================================================

async function feeStructureUpsert(body: Record<string, unknown>, id?: string): Promise<NextResponse> {
  if (id) {
    const data = coerceData("FeeStructure", body);
    const item = await db.feeStructure.update({ where: { id }, data });
    return json({ item });
  }
  const academicYearId = String(body.academicYearId ?? "");
  const gradeBand = String(body.gradeBand ?? "");
  const monthlyAmount = num(body.monthlyAmount);
  if (!academicYearId || !gradeBand) return err("academicYearId و gradeBand لازم است");
  const item = await db.feeStructure.upsert({
    where: { academicYearId_gradeBand: { academicYearId, gradeBand } },
    create: { academicYearId, gradeBand, monthlyAmount },
    update: { monthlyAmount },
  });
  return json({ item });
}

async function feeGenerate(user: AuthUser, body: Record<string, unknown>): Promise<NextResponse> {
  const classroomId = String(body.classroomId ?? "");
  const monthKey = String(body.monthKey ?? "");
  if (!classroomId || !monthKey) return err("classroomId و monthKey لازم است");
  const classroom = await db.classroom.findUnique({ where: { id: classroomId } });
  if (!classroom) return err("صنف پیدا نشد", 404);
  const band = classroom.grade <= 3 ? "1-3" : classroom.grade <= 6 ? "4-6" : classroom.grade <= 9 ? "7-9" : "10-12";
  const structure = await db.feeStructure.findUnique({
    where: { academicYearId_gradeBand: { academicYearId: classroom.academicYearId, gradeBand: band } },
  });
  const amount = structure?.monthlyAmount ?? num(body.amount, 0);
  if (amount <= 0) return err("FeeStructure برای این صنف تنظیم نشده است");

  const enrollments = await db.enrollment.findMany({ where: { classroomId, status: "active" } });
  const existing = await db.feeInvoice.findMany({
    where: { classroomId, monthKey },
    select: { enrollmentId: true },
  });
  const have = new Set(existing.map((e) => e.enrollmentId));
  let created = 0;
  let skipped = 0;
  for (const e of enrollments) {
    if (have.has(e.id)) {
      skipped++;
      continue;
    }
    await db.feeInvoice.create({
      data: {
        enrollmentId: e.id,
        classroomId,
        academicYearId: classroom.academicYearId,
        monthKey,
        amount,
        note: null,
      },
    });
    created++;
  }
  await audit(user.id, "generate", "FeeInvoice", classroomId, { monthKey, created, skipped, amount });
  return json({ created, skipped });
}

async function feePaymentCreate(user: AuthUser, body: Record<string, unknown>): Promise<NextResponse> {
  const invoiceId = String(body.invoiceId ?? "");
  const amount = num(body.amount);
  if (!invoiceId || amount <= 0) return err("invoiceId و amount لازم است");
  const invoice = await db.feeInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return err("فاکتور پیدا نشد", 404);
  const yearName = (invoice.monthKey.split("-")[0] ?? "1405").replace(/[^0-9]/g, "") || "1405";
  const receiptNo = await nextFeeReceipt(yearName);
  const payDate = dateOf(body.date);
  const payment = await db.feePayment.create({
    data: {
      invoiceId,
      amount,
      date: payDate,
      method: String(body.method ?? "نقدی"),
      receiptNo,
      createdByUserId: user.id,
      note: body.note ? String(body.note) : null,
    },
  });
  const discount = num(body.discount, 0);
  await db.feeInvoice.update({
    where: { id: invoiceId },
    data: { paidAmount: invoice.paidAmount + amount, discount: discount > 0 ? invoice.discount + discount : invoice.discount },
  });
  await addTreasury({
    academicYearId: invoice.academicYearId,
    type: "دخل",
    source: "فیس",
    amount,
    date: payDate,
    refModel: "FeePayment",
    refId: payment.id,
    description: `فیس ${invoice.monthKey} رسید ${receiptNo}`,
    createdByUserId: user.id,
  });
  await moneyAudit(user.id, "FeePayment", payment.id, amount, { receiptNo, invoiceId, monthKey: invoice.monthKey });
  return json({ payment, receiptNo });
}

async function handoverCreate(user: AuthUser, body: Record<string, unknown>): Promise<NextResponse> {
  const periodFrom = String(body.periodFrom ?? "");
  const periodTo = String(body.periodTo ?? periodFrom);
  if (!periodFrom) return err("periodFrom لازم است");
  const year = await currentYear();
  if (!year) return err("سال تعلیمی تنظیم نشده", 400);
  const payments = await db.feePayment.findMany({
    where: { invoice: { monthKey: { gte: periodFrom, lte: periodTo } } },
    select: { amount: true },
  });
  const amount = payments.reduce((s, p) => s + p.amount, 0);
  const receiptNo = await nextHandoverReceipt(year.name);
  const handover = await db.moneyHandover.create({
    data: {
      academicYearId: year.id,
      periodFrom,
      periodTo,
      amount,
      receiptNo,
      createdByUserId: user.id,
      status: "در انتظار",
      note: body.note ? String(body.note) : null,
    },
  });
  await addTreasury({
    academicYearId: year.id,
    type: "تجری",
    source: "تسلیمی",
    amount,
    date: new Date(),
    refModel: "MoneyHandover",
    refId: handover.id,
    description: `تسلیمی عواید فیس ${periodFrom} تا ${periodTo} رسید ${receiptNo}`,
    createdByUserId: user.id,
  });
  await moneyAudit(user.id, "MoneyHandover", handover.id, amount, { receiptNo, periodFrom, periodTo });
  return json({ handover });
}

async function handoverConfirm(user: AuthUser, id: string): Promise<NextResponse> {
  const handover = await db.moneyHandover.update({
    where: { id },
    data: { status: "تسلیم‌شده", confirmedAt: new Date() },
  });
  await audit(user.id, "confirm", "MoneyHandover", id, { amount: handover.amount, receiptNo: handover.receiptNo });
  return json({ item: handover });
}

// ============================================================
// EXAMS
// ============================================================

async function examDetail(id: string): Promise<NextResponse> {
  const exam = await db.exam.findUnique({
    where: { id },
    include: { classroom: { select: { id: true, name: true, grade: true, section: true, level: true } } },
  });
  if (!exam) return err("not found", 404);
  const classSubjects = await db.classSubject.findMany({
    where: { classroomId: exam.classroomId },
    include: { subject: { select: { id: true, nameDr: true } } },
    orderBy: { subjectId: "asc" },
  });
  const enrollments = await db.enrollment.findMany({
    where: { classroomId: exam.classroomId, status: "active" },
    include: { student: { select: { studentNo: true, firstName: true, fatherName: true } } },
    orderBy: { rollNo: "asc" },
  });
  const marks = await db.examMark.findMany({ where: { examId: id } });
  const byEnrollment = new Map<string, Record<string, number>>();
  for (const m of marks) {
    const rec = byEnrollment.get(m.enrollmentId) ?? {};
    rec[m.classSubjectId] = m.marks;
    byEnrollment.set(m.enrollmentId, rec);
  }
  return json({
    exam,
    rows: enrollments.map((e) => ({
      enrollmentId: e.id,
      studentNo: e.student.studentNo,
      name: e.student.firstName,
      fatherName: e.student.fatherName,
      rollNo: e.rollNo,
      marks: byEnrollment.get(e.id) ?? {},
    })),
    classSubjects: classSubjects.map((cs) => ({ id: cs.id, subjectId: cs.subjectId, subjectName: cs.subject.nameDr })),
  });
}

async function examMarksUpsert(user: AuthUser, id: string, body: Record<string, unknown>): Promise<NextResponse> {
  const exam = await db.exam.findUnique({ where: { id } });
  if (!exam) return err("not found", 404);
  const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
  let saved = 0;
  for (const row of rows) {
    const enrollmentId = String(row.enrollmentId ?? "");
    const classSubjectId = String(row.classSubjectId ?? "");
    if (!enrollmentId || !classSubjectId) continue;
    if (row.marks === null || row.marks === undefined || row.marks === "") {
      await db.examMark.deleteMany({ where: { examId: id, enrollmentId, classSubjectId } });
      saved++;
      continue;
    }
    const marks = Math.max(0, Math.min(num(row.marks), exam.maxPerSubject));
    await db.examMark.upsert({
      where: { examId_enrollmentId_classSubjectId: { examId: id, enrollmentId, classSubjectId } },
      create: { examId: id, enrollmentId, classSubjectId, marks },
      update: { marks },
    });
    saved++;
  }
  await audit(user.id, "marks", "Exam", id, { saved });
  return json({ saved });
}

async function examCompute(user: AuthUser, id: string): Promise<NextResponse> {
  const exam = await db.exam.findUnique({ where: { id } });
  if (!exam) return err("not found", 404);
  const classroom = await db.classroom.findUnique({ where: { id: exam.classroomId } });
  if (!classroom) return err("صنف پیدا نشد", 404);

  const classSubjects = await db.classSubject.findMany({ where: { classroomId: classroom.id } });
  const subjectIds = classSubjects.map((cs) => cs.subjectId);

  // All exams of this classroom contribute their marks to the annual total.
  const exams = await db.exam.findMany({
    where: { classroomId: classroom.id, academicYearId: classroom.academicYearId },
    select: { id: true },
  });
  const examIds = exams.map((e) => e.id);
  const allMarks = examIds.length > 0 ? await db.examMark.findMany({ where: { examId: { in: examIds } } }) : [];

  const enrollments = await db.enrollment.findMany({
    where: { classroomId: classroom.id, status: "active" },
  });
  const rules = await getMoeRules();
  // Finalize promotion status only when the annual (سالانه) exam has been held.
  const annualHeld = (
    await db.exam.findFirst({
      where: { classroomId: classroom.id, type: "سالانه", status: "برگزارشده" },
      select: { id: true },
    })
  ) !== null;

  const computed: { enrollmentId: string; average: number }[] = [];
  for (const enrollment of enrollments) {
    const marks = allMarks.filter((m) => m.enrollmentId === enrollment.id);
    const outcome = computeForEnrollment(
      marks.map((m) => ({ classSubjectId: m.classSubjectId, marks: m.marks })),
      classSubjects.map((c) => ({ id: c.id, subjectId: c.subjectId })),
      rules,
      classroom.grade,
      annualHeld,
    );
    for (const sr of outcome.subjectResults) {
      const cs = classSubjects.find((c) => c.subjectId === sr.subjectId);
      if (!cs) continue;
      await db.subjectResult.upsert({
        where: { enrollmentId_academicYearId_subjectId: { enrollmentId: enrollment.id, academicYearId: classroom.academicYearId, subjectId: sr.subjectId } },
        create: {
          academicYearId: classroom.academicYearId,
          enrollmentId: enrollment.id,
          subjectId: sr.subjectId,
          total: sr.total,
          grade: sr.grade,
          passed: sr.passed,
        },
        update: { total: sr.total, grade: sr.grade, passed: sr.passed },
      });
    }
    await db.studentAnnualSummary.upsert({
      where: { enrollmentId_academicYearId: { enrollmentId: enrollment.id, academicYearId: classroom.academicYearId } },
      create: {
        academicYearId: classroom.academicYearId,
        enrollmentId: enrollment.id,
        total: outcome.total,
        average: outcome.average,
        rank: 0,
        status: outcome.status,
      },
      update: { total: outcome.total, average: outcome.average, status: outcome.status },
    });
    computed.push({ enrollmentId: enrollment.id, average: outcome.average });
  }

  // Rank by average desc among active enrollments
  computed.sort((a, b) => b.average - a.average);
  for (let i = 0; i < computed.length; i++) {
    await db.studentAnnualSummary.updateMany({
      where: { enrollmentId: computed[i].enrollmentId, academicYearId: classroom.academicYearId },
      data: { rank: i + 1 },
    });
  }
  await audit(user.id, "compute", "Exam", id, { computed: computed.length });
  return json({ computed: computed.length });
}

// ============================================================
// REPORTS
// ============================================================

async function reportProfitLoss(q: URLSearchParams): Promise<NextResponse> {
  const monthKey = q.get("monthKey") || currentMonthKey();
  const r = monthRangeFor(monthKey);

  const [feePayments, transportPayments, sales, expenses, salaryPayments] = await Promise.all([
    db.feePayment.findMany({ where: { invoice: { monthKey } }, select: { amount: true } }),
    db.transportPayment.findMany({ where: { monthKey }, select: { amount: true } }),
    db.sale.findMany({ where: { date: { gte: r.start, lte: r.end } }, include: { item: { select: { type: true } } } }),
    db.expense.findMany({ where: { date: { gte: r.start, lte: r.end } }, include: { category: { select: { name: true } } } }),
    db.salaryPayment.findMany({ where: { monthKey, status: "پرداخت‌شده" }, select: { amount: true } }),
  ]);

  const fees = feePayments.reduce((s, p) => s + p.amount, 0);
  const transport = transportPayments.reduce((s, p) => s + p.amount, 0);
  let books = 0;
  let uniforms = 0;
  for (const sale of sales) {
    if (sale.item.type === "یونیفورم") uniforms += sale.total;
    else books += sale.total;
  }
  const byCategoryMap = new Map<string, number>();
  for (const e of expenses) {
    const name = e.category.name;
    byCategoryMap.set(name, (byCategoryMap.get(name) ?? 0) + e.amount);
  }
  const byCategory = Array.from(byCategoryMap.entries()).map(([name, amount]) => ({ name, amount }));
  const salaries = salaryPayments.reduce((s, p) => s + p.amount, 0);
  const revenueTotal = fees + transport + books + uniforms;
  const expenseTotal = byCategory.reduce((s, e) => s + e.amount, 0) + salaries;
  return json({
    monthKey,
    revenues: { fees, transport, books, uniforms, total: revenueTotal },
    expenses: { byCategory, salaries, total: expenseTotal },
    net: revenueTotal - expenseTotal,
  });
}

async function reportFees(q: URLSearchParams): Promise<NextResponse> {
  const w = buildWhere("invoices", q);
  const invoices = (await db.feeInvoice.findMany({
    where: w,
    include: INCLUDES.invoices,
    orderBy: { createdAt: "desc" },
  })) as Record<string, unknown>[];
  const status = (q.get("status") || "").trim();
  let items = invoices.map((inv) => ({
    ...inv,
    due: Math.max(0, (inv.amount as number) - ((inv.discount as number) ?? 0)),
    remaining: Math.max(0, (inv.amount as number) - ((inv.discount as number) ?? 0) - ((inv.paidAmount as number) ?? 0)),
    status: invoiceStatus(inv as never),
  }));
  if (status) items = items.filter((i) => i.status === status);
  const totals = {
    billed: items.reduce((s, i) => s + (i.amount as number), 0),
    paid: items.reduce((s, i) => s + ((i.paidAmount as number) ?? 0), 0),
    remaining: items.reduce((s, i) => s + (i.remaining as number), 0),
  };
  return json({ items, totals });
}

async function reportTransport(q: URLSearchParams): Promise<NextResponse> {
  const monthKey = q.get("monthKey") || currentMonthKey();
  const r = monthRangeFor(monthKey);
  const payments = await db.transportPayment.findMany({
    where: { monthKey },
    include: {
      transportEnrollment: {
        include: {
          student: { include: { enrollments: { include: { classroom: { select: { id: true, name: true } } } } } },
        },
      },
    },
  });
  const expenses = await db.transportExpense.findMany({ where: { date: { gte: r.start, lte: r.end } }, orderBy: { date: "asc" } });
  const revenue = payments.reduce((s, p) => s + p.amount, 0);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const perClassMap = new Map<string, number>();
  for (const p of payments) {
    const cls = p.transportEnrollment.student?.enrollments?.[0]?.classroom?.name ?? "—";
    perClassMap.set(cls, (perClassMap.get(cls) ?? 0) + p.amount);
  }
  return json({
    monthKey,
    revenue,
    expenses,
    expenseTotal,
    profit: revenue - expenseTotal,
    perClass: Array.from(perClassMap.entries()).map(([className, revenue]) => ({ className, revenue })),
  });
}

async function reportStore(q: URLSearchParams): Promise<NextResponse> {
  const type = q.get("type") || "کتاب";
  const [sales, purchases] = await Promise.all([
    db.sale.findMany({ where: { item: { type } }, include: { item: { select: { id: true, name: true } } } }),
    db.purchase.findMany({ where: { item: { type } }, select: { total: true } }),
  ]);
  const revenue = sales.reduce((s, x) => s + x.total, 0);
  const purchaseTotal = purchases.reduce((s, x) => s + x.total, 0);
  const byItemMap = new Map<string, { name: string; sold: number; revenue: number }>();
  for (const sale of sales) {
    const rec = byItemMap.get(sale.item.name) ?? { name: sale.item.name, sold: 0, revenue: 0 };
    rec.sold += sale.qty;
    rec.revenue += sale.total;
    byItemMap.set(sale.item.name, rec);
  }
  return json({
    type,
    revenue,
    purchases: purchaseTotal,
    profit: revenue - purchaseTotal,
    byItem: Array.from(byItemMap.values()),
  });
}

async function reportAttendance(q: URLSearchParams): Promise<NextResponse> {
  const monthKey = q.get("monthKey") || currentMonthKey();
  const kind = q.get("kind") || "student";
  const dates = jalaliMonthDates(monthKey);
  if (dates.length === 0) return err("monthKey نامعتبر است");
  const range = { gte: new Date(`${dates[0]}T00:00:00.000Z`), lte: new Date(`${dates[dates.length - 1]}T23:59:59.999Z`) };
  if (kind === "staff") {
    const staffList = await db.staff.findMany({ where: { status: "active" }, orderBy: { name: "asc" } });
    const records = await db.staffAttendance.findMany({ where: { staffId: { in: staffList.map((s) => s.id) }, date: range } });
    const items = staffList.map((s) => {
      const mine = records.filter((r) => r.staffId === s.id);
      const count = (st: string) => mine.filter((r) => r.status === st).length;
      const total = mine.length;
      const present = count("حاضر");
      return {
        id: s.id,
        staffNo: s.staffNo,
        name: s.name,
        position: s.position,
        present,
        absent: count("غایب"),
        leave: count("رخصتی"),
        mission: count("ماموریت"),
        total,
        percent: total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
      };
    });
    return json({ monthKey, kind, items });
  }
  const enrollments = await db.enrollment.findMany({
    where: { status: "active" },
    include: {
      student: { select: { id: true, studentNo: true, firstName: true, fatherName: true } },
      classroom: { select: { id: true, name: true, grade: true } },
    },
  });
  const records = await db.studentAttendance.findMany({
    where: { enrollmentId: { in: enrollments.map((e) => e.id) }, date: range },
  });
  const items = enrollments.map((e) => {
    const mine = records.filter((r) => r.enrollmentId === e.id);
    const count = (st: string) => mine.filter((r) => r.status === st).length;
    const total = mine.length;
    const present = count("حاضر");
    return {
      id: e.id,
      studentNo: e.student.studentNo,
      name: e.student.firstName,
      fatherName: e.student.fatherName,
      classroom: e.classroom.name,
      present,
      absent: count("غایب"),
      sick: count("مریض"),
      leave: count("رخصتی"),
      total,
      percent: total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
    };
  });
  return json({ monthKey, kind, items });
}

// ============================================================
// DASHBOARD
// ============================================================

async function dashboardHandler(): Promise<NextResponse> {
  const year = await currentYear();
  const todayIso = toISODate(new Date());
  const today = new Date(`${todayIso}T00:00:00.000Z`);
  const monthKey = currentMonthKey();

  const [students, staff, todayRecords, monthPayments, monthInvoices, treasuryRows, recentPayments] = await Promise.all([
    db.student.count({ where: { status: "active" } }),
    db.staff.count({ where: { status: "active" } }),
    db.studentAttendance.findMany({ where: { date: today }, select: { status: true } }),
    db.feePayment.findMany({ where: { invoice: { monthKey } }, select: { amount: true } }),
    db.feeInvoice.findMany({ where: { monthKey }, select: { amount: true, discount: true, paidAmount: true } }),
    db.treasuryTransaction.findMany({ where: year ? { academicYearId: year.id } : {}, select: { type: true, amount: true } }),
    db.feePayment.findMany({
      orderBy: { date: "desc" },
      take: 6,
      include: {
        invoice: {
          include: {
            enrollment: { include: { student: { select: { studentNo: true, firstName: true, fatherName: true } } } },
            classroom: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const todayPresent = todayRecords.filter((r) => r.status === "حاضر").length;
  const monthCollected = monthPayments.reduce((s, p) => s + p.amount, 0);
  const monthRemaining = monthInvoices.reduce(
    (s, inv) => s + Math.max(0, inv.amount - inv.discount - inv.paidAmount),
    0,
  );
  let treasuryBalance = 0;
  for (const t of treasuryRows) {
    if (t.type === "دخل") treasuryBalance += t.amount;
    else treasuryBalance -= t.amount; // تجری & بردگی
  }

  const months = lastMonthKeys(6);
  const allPayments = await db.feePayment.findMany({
    where: { invoice: { monthKey: { in: months } } },
    select: { amount: true, invoice: { select: { monthKey: true } } },
  });
  const monthlyCollection = months.map((mk) => ({
    monthKey: mk,
    label: monthKeyLabel(mk),
    amount: allPayments.filter((p) => p.invoice.monthKey === mk).reduce((s, p) => s + p.amount, 0),
  }));

  return json({
    students,
    staff,
    todayPresent,
    todayPresentPercent: todayRecords.length > 0 ? Math.round((todayPresent / todayRecords.length) * 1000) / 10 : 0,
    monthKey,
    monthCollected,
    monthRemaining,
    treasuryBalance,
    recentPayments: recentPayments.map((p) => ({
      id: p.id,
      amount: p.amount,
      date: p.date,
      receiptNo: p.receiptNo,
      studentName: `${p.invoice.enrollment.student.firstName} ${p.invoice.enrollment.student.fatherName}`,
      studentNo: p.invoice.enrollment.student.studentNo,
      classroom: p.invoice.classroom.name,
    })),
    monthlyCollection,
  });
}

// ============================================================
// NOTIFICATIONS
// ============================================================

function renderTemplate(body: string, vars: Record<string, string>): string {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

async function notificationCreate(user: AuthUser, body: Record<string, unknown>): Promise<NextResponse> {
  let category = String(body.category ?? "اطلاعیه");
  const audience = String(body.audience ?? "والدین");
  const templateKey = String(body.templateKey ?? "");
  let baseBody = String(body.body ?? "");
  if (templateKey && !baseBody) {
    const tpl = await db.messageTemplate.findUnique({ where: { key: templateKey } });
    if (tpl) {
      baseBody = tpl.bodyDr;
      if (!body.category) category = tpl.category;
    }
  }
  if (!baseBody) return err("body یا templateKey لازم است");

  const classroomId = body.classroomId ? String(body.classroomId) : null;
  const studentId = body.studentId ? String(body.studentId) : null;
  const staffId = body.staffId ? String(body.staffId) : null;
  const phone = body.phone ? String(body.phone) : null;
  const monthKey = String(body.monthKey ?? currentMonthKey());
  const monthLabel = monthKeyLabel(monthKey);
  const school = await db.school.findFirst();
  const classroom = classroomId ? await db.classroom.findUnique({ where: { id: classroomId } }) : null;

  // extra template vars optionally passed in the body (e.g. مبلغ)
  const extraVars: Record<string, string> = {};
  for (const k of ["مبلغ", "صنف", "مکتب"]) {
    if (body[k]) extraVars[k] = String(body[k]);
  }

  const vars = (extra: Record<string, string> = {}) => ({
    نام: extra["نام"] ?? "",
    صنف: classroom?.name ?? extra["صنف"] ?? "",
    مبلغ: extra["مبلغ"] ?? "",
    ماه: monthLabel,
    مکتب: school?.name ?? "مکتب خصوصی نداالقلم",
    ...extraVars,
    ...extra,
  });

  const created: unknown[] = [];

  // fan-out: one notification per guardian phone of a classroom
  if (audience === "والدین" && classroomId && !studentId && !phone) {
    const enrollments = await db.enrollment.findMany({
      where: { classroomId, status: "active" },
      include: { student: true },
    });
    for (const e of enrollments) {
      if (!e.student.guardianPhone) continue;
      created.push(
        await db.notification.create({
          data: {
            category,
            audience,
            studentId: e.studentId,
            classroomId,
            phone: e.student.guardianPhone,
            body: renderTemplate(baseBody, vars({ نام: e.student.firstName })),
            createdByUserId: user.id,
          },
        }),
      );
    }
  } else if (audience === "کارمندان" && !staffId && !phone) {
    const staffList = await db.staff.findMany({ where: { status: "active" } });
    for (const s of staffList) {
      if (!s.phone) continue;
      created.push(
        await db.notification.create({
          data: { category, audience, staffId: s.id, phone: s.phone, body: renderTemplate(baseBody, vars({ نام: s.name })), createdByUserId: user.id },
        }),
      );
    }
  } else {
    let rendered = baseBody;
    if (studentId) {
      const st = await db.student.findUnique({ where: { id: studentId } });
      rendered = renderTemplate(baseBody, vars({ نام: st?.firstName ?? "", صنف: classroom?.name ?? "" }));
    } else if (staffId) {
      const s = await db.staff.findUnique({ where: { id: staffId } });
      rendered = renderTemplate(baseBody, vars({ نام: s?.name ?? "" }));
    } else {
      rendered = renderTemplate(baseBody, vars());
    }
    created.push(
      await db.notification.create({
        data: {
          category,
          audience,
          studentId,
          staffId,
          classroomId,
          phone,
          body: rendered,
          createdByUserId: user.id,
        },
      }),
    );
  }
  await audit(user.id, "create", "Notification", undefined, { count: created.length, category });
  return json({ items: created, count: created.length, item: created[0] ?? null });
}

async function notificationSend(user: AuthUser, id: string): Promise<NextResponse> {
  const item = await db.notification.findUnique({ where: { id } });
  if (!item) return err("not found", 404);
  const settings = await settingsObject();
  const gatewayUrl = String(settings.smsGatewayUrl ?? "");
  const apiKey = String(settings.smsApiKey ?? "");
  if (!gatewayUrl || !apiKey || !item.phone) {
    return json({ item }); // stays in صف
  }
  let okStatus = false;
  try {
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ phone: item.phone, body: item.body }),
      signal: AbortSignal.timeout(10000),
    });
    okStatus = res.ok;
  } catch {
    okStatus = false;
  }
  const updated = await db.notification.update({
    where: { id },
    data: { status: okStatus ? "ارسال‌شده" : "ناکام", sentAt: okStatus ? new Date() : null },
  });
  await audit(user.id, "send", "Notification", id, { status: updated.status });
  return json({ item: updated });
}

async function notificationExport(q: URLSearchParams): Promise<NextResponse> {
  const w: Record<string, unknown> = {};
  if (q.get("category")) w.category = q.get("category");
  if (q.get("status")) w.status = q.get("status");
  if (q.get("monthKey")) {
    const r = monthRangeFor(q.get("monthKey") as string);
    w.createdAt = { gte: r.start, lte: r.end };
  }
  const rows = await db.notification.findMany({ where: w, orderBy: { createdAt: "asc" } });
  const csv = ["phone,body", ...rows.map((r) => `"${r.phone ?? ""}","${r.body.replace(/"/g, '""')}"`)].join("\n");
  const stamp = q.get("monthKey") || toISODate(new Date());
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="notifications-${stamp}.csv"`,
    },
  });
}

// ============================================================
// BACKUP
// ============================================================

async function backupHandler(): Promise<NextResponse> {
  const dump = {
    exportedAt: new Date().toISOString(),
    settings: await db.setting.findMany(),
    school: await db.school.findMany(),
    branches: await db.branch.findMany(),
    academicYears: await db.academicYear.findMany(),
    classrooms: await db.classroom.findMany(),
    subjects: await db.subject.findMany(),
    classSubjects: await db.classSubject.findMany(),
    students: await db.student.findMany(),
    enrollments: await db.enrollment.findMany(),
    staff: await db.staff.findMany(),
    staffDocuments: await db.staffDocument.findMany(),
    studentAttendance: await db.studentAttendance.findMany(),
    staffAttendance: await db.staffAttendance.findMany(),
    feeStructures: await db.feeStructure.findMany(),
    feeInvoices: await db.feeInvoice.findMany(),
    feePayments: await db.feePayment.findMany(),
    moneyHandovers: await db.moneyHandover.findMany(),
    transportEnrollments: await db.transportEnrollment.findMany(),
    transportPayments: await db.transportPayment.findMany(),
    transportExpenses: await db.transportExpense.findMany(),
    items: await db.item.findMany(),
    purchases: await db.purchase.findMany(),
    sales: await db.sale.findMany(),
    expenseCategories: await db.expenseCategory.findMany(),
    expenses: await db.expense.findMany(),
    salaryPayments: await db.salaryPayment.findMany(),
    exams: await db.exam.findMany(),
    examMarks: await db.examMark.findMany(),
    subjectResults: await db.subjectResult.findMany(),
    studentAnnualSummaries: await db.studentAnnualSummary.findMany(),
    notifications: await db.notification.findMany(),
    messageTemplates: await db.messageTemplate.findMany(),
    users: await db.user.findMany({ select: { id: true, username: true, fullName: true, role: true, active: true, phone: true, lastLoginAt: true, createdAt: true } }),
    auditLogs: await db.auditLog.findMany({ take: 1000, orderBy: { createdAt: "desc" } }),
    treasuryTransactions: await db.treasuryTransaction.findMany(),
  };
  const stamp = toISODate(new Date());
  return new NextResponse(JSON.stringify(dump, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="neda-alqalam-backup-${stamp}.json"`,
    },
  });
}

// ============================================================
// TREASURY / SALARIES
// ============================================================

async function treasuryWithdraw(user: AuthUser, body: Record<string, unknown>): Promise<NextResponse> {
  const amount = num(body.amount);
  if (amount <= 0) return err("amount لازم است");
  const year = await currentYear();
  if (!year) return err("سال تعلیمی تنظیم نشده", 400);
  const date = dateOf(body.date);
  const tx = await db.treasuryTransaction.create({
    data: {
      academicYearId: year.id,
      type: "بردگی",
      source: String(body.source ?? "دیگر"),
      amount,
      date,
      description: body.description ? String(body.description) : null,
      createdByUserId: user.id,
    },
  });
  await moneyAudit(user.id, "TreasuryTransaction", tx.id, amount, { type: "بردگی" });
  return json({ item: tx });
}

async function treasuryCreate(user: AuthUser, body: Record<string, unknown>): Promise<NextResponse> {
  const amount = num(body.amount);
  const type = String(body.type ?? "دخل");
  if (amount <= 0 || !["دخل", "تجری", "بردگی"].includes(type)) return err("amount و type لازم است");
  const year = await currentYear();
  if (!year) return err("سال تعلیمی تنظیم نشده", 400);
  const tx = await db.treasuryTransaction.create({
    data: {
      academicYearId: String(body.academicYearId ?? year.id),
      type,
      source: String(body.source ?? "دیگر"),
      amount,
      date: dateOf(body.date),
      refModel: body.refModel ? String(body.refModel) : null,
      refId: body.refId ? String(body.refId) : null,
      description: body.description ? String(body.description) : null,
      createdByUserId: user.id,
    },
  });
  await moneyAudit(user.id, "TreasuryTransaction", tx.id, amount, { type });
  return json({ item: tx });
}

async function salariesGenerate(user: AuthUser, body: Record<string, unknown>): Promise<NextResponse> {
  const monthKey = String(body.monthKey ?? currentMonthKey());
  const year = body.academicYearId ? { id: String(body.academicYearId) } : await currentYear();
  if (!year) return err("سال تعلیمی تنظیم نشده", 400);
  const staffList = await db.staff.findMany({ where: { status: "active" } });
  let created = 0;
  for (const s of staffList) {
    const exists = await db.salaryPayment.findUnique({
      where: { staffId_academicYearId_monthKey: { staffId: s.id, academicYearId: year.id, monthKey } },
    });
    if (exists) continue;
    await db.salaryPayment.create({
      data: { staffId: s.id, academicYearId: year.id, monthKey, amount: s.baseSalary },
    });
    created++;
  }
  await audit(user.id, "generate", "SalaryPayment", undefined, { monthKey, created });
  return json({ created });
}

async function salaryPay(user: AuthUser, id: string, body: Record<string, unknown>): Promise<NextResponse> {
  const salary = await db.salaryPayment.findUnique({ where: { id } });
  if (!salary) return err("not found", 404);
  const paidDate = dateOf(body.paidDate);
  const item = await db.salaryPayment.update({
    where: { id },
    data: { status: "پرداخت‌شده", paidDate },
  });
  await addTreasury({
    academicYearId: salary.academicYearId,
    type: "تجری",
    source: "معاشات",
    amount: salary.amount,
    date: paidDate,
    refModel: "SalaryPayment",
    refId: salary.id,
    description: `معاش ${salary.monthKey}`,
    createdByUserId: user.id,
  });
  await moneyAudit(user.id, "SalaryPayment", salary.id, salary.amount, { monthKey: salary.monthKey });
  return json({ item });
}

// ============================================================
// ENROLLMENT / USERS
// ============================================================

async function enrollStudent(user: AuthUser, studentId: string, body: Record<string, unknown>): Promise<NextResponse> {
  const classroomId = String(body.classroomId ?? "");
  const rollNo = num(body.rollNo, 0);
  if (!classroomId) return err("classroomId لازم است");
  const classroom = await db.classroom.findUnique({ where: { id: classroomId } });
  if (!classroom) return err("صنف پیدا نشد", 404);
  const uniformItems = Array.isArray(body.uniformItems) ? JSON.stringify(body.uniformItems) : body.uniformItems ? String(body.uniformItems) : null;
  const item = await db.enrollment.upsert({
    where: { studentId_academicYearId: { studentId, academicYearId: classroom.academicYearId } },
    create: {
      studentId,
      classroomId,
      academicYearId: classroom.academicYearId,
      rollNo: Math.round(rollNo),
      status: "active",
      uniformItems,
    },
    update: { classroomId, rollNo: Math.round(rollNo), status: "active", uniformItems },
  });
  await audit(user.id, "enroll", "Enrollment", item.id, { studentId, classroomId, rollNo });
  return json({ item });
}

async function userResetPassword(user: AuthUser, id: string, body: Record<string, unknown>): Promise<NextResponse> {
  const password = String(body.password ?? "");
  if (password.length < 6) return err("پلمب باید حداقل ۶ حرف باشد");
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return err("not found", 404);
  await db.user.update({ where: { id }, data: { passwordHash: hashPassword(password) } });
  await audit(user.id, "reset-password", "User", id, { username: target.username });
  return json({ ok: true });
}

// ============================================================
// GENERIC CRUD
// ============================================================

function sanitizeUser(obj: unknown): Record<string, unknown> {
  const { passwordHash, ...rest } = obj as Record<string, unknown>;
  return rest;
}

async function listResource(resource: string, q: URLSearchParams): Promise<NextResponse> {
  const def = RESOURCES[resource];
  const w = buildWhere(resource, q);
  const defaultTake = resource === "audit" ? 200 : 1000;
  const take = Math.min(parseInt(q.get("take") || String(defaultTake), 10) || defaultTake, 2000);
  const skip = Math.max(parseInt(q.get("skip") || "0", 10) || 0, 0);
  const include = INCLUDES[resource];
  const orderBy = ORDER_BY[resource] ?? { createdAt: "desc" };
  const d = delegate(def.model);

  const [rows, total] = await Promise.all([
    d.findMany({ where: w, include, orderBy, take, skip }),
    d.count({ where: w }),
  ]);
  let items = rows as Record<string, unknown>[];
  if (resource === "invoices") {
    items = items.map((inv) => ({
      ...inv,
      due: Math.max(0, (inv.amount as number) - ((inv.discount as number) ?? 0)),
      remaining: Math.max(0, (inv.amount as number) - ((inv.discount as number) ?? 0) - ((inv.paidAmount as number) ?? 0)),
      status: invoiceStatus(inv as never),
    }));
    const statusFilter = (q.get("status") || "").trim();
    if (statusFilter) items = items.filter((i) => i.status === statusFilter);
  }
  if (resource === "users") items = items.map(sanitizeUser);
  return json({ items, total: items.length });
}

async function createResource(user: AuthUser, resource: string, body: Record<string, unknown>): Promise<NextResponse> {
  const def = RESOURCES[resource];
  const model = def.model;
  let data = coerceData(model, body);

  switch (model) {
    case "user": {
      const password = String((body.password as string) ?? "");
      if (password.length < 6) return err("پلمب باید حداقل ۶ حرف باشد");
      data.passwordHash = hashPassword(password);
      break;
    }
    case "student": {
      if (!data.studentNo) data.studentNo = await nextStudentNo();
      if (data.status === undefined) data.status = "active";
      if (data.gender === undefined) data.gender = "ذکور";
      break;
    }
    case "staff": {
      if (!data.staffNo) {
        data.staffNo = await nextSeqNo(
          "ST",
          String(todayJalali().jy),
          async (no) => (await db.staff.findUnique({ where: { staffNo: no } })) !== null,
        );
      }
      if (data.hireDate === undefined) data.hireDate = new Date();
      if (data.baseSalary === undefined) data.baseSalary = 8000;
      break;
    }
    case "classroom": {
      if (data.academicYearId === undefined) {
        const y = await currentYear();
        if (!y) return err("سال تعلیمی تنظیم نشده", 400);
        data.academicYearId = y.id;
      }
      if (data.grade !== undefined && (!data.name || data.level === undefined)) {
        const grade = Number(data.grade);
        if (!data.name) data.name = `صنف ${grade} - ${data.section ?? "الف"}`;
        if (data.level === undefined) data.level = levelOf(grade);
      }
      break;
    }
    case "sale": {
      if (!data.receiptNo) {
        const y = await currentYear();
        data.receiptNo = await nextSaleReceipt(y?.name ?? String(todayJalali().jy));
      }
      if (data.date === undefined) data.date = new Date();
      if (data.total === undefined) data.total = num(data.qty) * num(data.unitPrice);
      break;
    }
    case "purchase": {
      if (data.date === undefined) data.date = new Date();
      if (data.total === undefined) data.total = num(data.qty) * num(data.unitPrice);
      break;
    }
    case "expense":
    case "transportExpense": {
      if (data.date === undefined) data.date = new Date();
      break;
    }
    case "transportPayment": {
      const year = await currentYear();
      if (data.date === undefined) data.date = new Date();
      if (!data.receiptNo) data.receiptNo = await nextTransportReceipt(year?.name ?? String(todayJalali().jy));
      if (data.amount === undefined && data.transportEnrollmentId) {
        const te = await db.transportEnrollment.findUnique({ where: { id: String(data.transportEnrollmentId) } });
        if (te) data.amount = te.monthlyFee;
      }
      break;
    }
    case "enrollment": {
      if (data.academicYearId === undefined) {
        const y = await currentYear();
        if (!y) return err("سال تعلیمی تنظیم نشده", 400);
        data.academicYearId = y.id;
      }
      break;
    }
    case "setting": {
      if (data.value !== undefined && typeof data.value !== "string") data.value = JSON.stringify(data.value);
      break;
    }
    default:
      break;
  }

  const item = (await delegate(model).create({ data })) as { id?: string };
  // ---- post-create hooks: stock updates + treasury entries (with refId) ----
  const year = await currentYear();
  switch (model) {
    case "sale": {
      const saleItem = await db.item.findUnique({ where: { id: String(data.itemId) } });
      if (saleItem) {
        await db.item.update({
          where: { id: saleItem.id },
          data: { stockQty: { decrement: Math.round(num(data.qty)) } },
        });
        if (year) {
          await addTreasury({
            academicYearId: year.id,
            type: "دخل",
            source: saleItem.type === "یونیفورم" ? "یونیفورم" : "کتاب",
            amount: num(data.total),
            date: data.date as Date,
            refModel: "Sale",
            refId: item.id,
            description: `فروش ${saleItem.name} رسید ${data.receiptNo ?? ""}`,
            createdByUserId: user.id,
          });
        }
      }
      break;
    }
    case "purchase": {
      const purchaseItem = await db.item.findUnique({ where: { id: String(data.itemId) } });
      if (purchaseItem) {
        await db.item.update({
          where: { id: purchaseItem.id },
          data: {
            stockQty: { increment: Math.round(num(data.qty)) },
            purchasePrice: num(data.unitPrice) || undefined,
          },
        });
        if (year) {
          await addTreasury({
            academicYearId: year.id,
            type: "تجری",
            source: purchaseItem.type === "یونیفورم" ? "یونیفورم" : "کتاب",
            amount: num(data.total),
            date: data.date as Date,
            refModel: "Purchase",
            refId: item.id,
            description: `خرید ${purchaseItem.name}`,
            createdByUserId: user.id,
          });
        }
      }
      break;
    }
    case "expense": {
      if (year) {
        await addTreasury({
          academicYearId: year.id,
          type: "تجری",
          source: "مصارف",
          amount: num(data.amount),
          date: data.date as Date,
          refModel: "Expense",
          refId: item.id,
          description: data.description ? String(data.description) : undefined,
          createdByUserId: user.id,
        });
      }
      break;
    }
    case "transportExpense": {
      if (year) {
        await addTreasury({
          academicYearId: year.id,
          type: "تجری",
          source: "ترانسپورت",
          amount: num(data.amount),
          date: data.date as Date,
          refModel: "TransportExpense",
          refId: item.id,
          description: data.note ? String(data.note) : undefined,
          createdByUserId: user.id,
        });
      }
      break;
    }
    case "transportPayment": {
      if (year) {
        await addTreasury({
          academicYearId: year.id,
          type: "دخل",
          source: "ترانسپورت",
          amount: num(data.amount),
          date: data.date as Date,
          refModel: "TransportPayment",
          refId: item.id,
          description: `ترانسپورت ${data.monthKey ?? ""} رسید ${data.receiptNo ?? ""}`,
          createdByUserId: user.id,
        });
      }
      break;
    }
    default:
      break;
  }

  await audit(user.id, "create", model, item?.id, pickAuditDetail(body));
  return json({ item: model === "user" ? sanitizeUser(item) : item });
}

async function updateResource(user: AuthUser, resource: string, id: string, body: Record<string, unknown>): Promise<NextResponse> {
  const def = RESOURCES[resource];
  const model = def.model;
  let data = coerceData(model, body);

  // restricted updates
  if (model === "user") delete data.passwordHash;
  if (model === "feePayment") data = { note: data.note, method: data.method, date: data.date };

  if (model === "setting" && data.value !== undefined && typeof data.value !== "string") {
    data.value = JSON.stringify(data.value);
  }
  const item = await delegate(model).update({ where: { id }, data });
  await audit(user.id, "update", model, id, pickAuditDetail(body));
  return json({ item: model === "user" ? sanitizeUser(item) : item });
}

async function deleteResource(user: AuthUser, resource: string, id: string): Promise<NextResponse> {
  const def = RESOURCES[resource];
  const model = def.model;
  if (resource === "payments" || resource === "treasury" || resource === "audit") {
    return err("حذف این ریکارد مجاز نیست", 403);
  }
  if (model === "user") {
    if (id === user.id) return err("نمی‌توانید حساب خود را حذف کنید", 400);
    const admins = await db.user.count({ where: { role: "ADMIN", active: true } });
    const target = await db.user.findUnique({ where: { id } });
    if (target?.role === "ADMIN" && admins <= 1) return err("آخرین مدیر قابل حذف نیست", 400);
    await db.user.delete({ where: { id } });
    await audit(user.id, "delete", "User", id, {});
    return json({ ok: true });
  }
  if (def.softDelete) {
    const item = await delegate(model).update({ where: { id }, data: { status: "left" } });
    await audit(user.id, "delete", model, id, { soft: true });
    return json({ item });
  }
  await delegate(model).delete({ where: { id } });
  await audit(user.id, "delete", model, id, {});
  return json({ ok: true });
}

function pickAuditDetail(body: Record<string, unknown>): Record<string, unknown> {
  const keys = ["amount", "receiptNo", "monthKey", "name", "username", "type", "status"];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in body) out[k] = body[k];
  return out;
}

// ============================================================
// DISPATCHERS
// ============================================================

type Ctx = { params: Promise<{ slug: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { slug } = await ctx.params;
    const [a, b] = slug ?? [];
    const q = qs(req);

    if (!a) return err("not found", 404);

    // endpoints open to every role
    if (a === "lookup") {
      await requireUser(req);
      return await lookupHandler();
    }
    if (a === "dashboard") {
      await requireUser(req);
      return await dashboardHandler();
    }

    // reports
    if (a === "reports") {
      const roles: Role[] = b === "attendance" ? [...ALL] : ["ADMIN", "OWNER", "FINANCE"];
      await requireUser(req, roles);
      if (b === "profit-loss") return await reportProfitLoss(q);
      if (b === "fees") return await reportFees(q);
      if (b === "transport") return await reportTransport(q);
      if (b === "store") return await reportStore(q);
      if (b === "attendance") return await reportAttendance(q);
      return err("not found", 404);
    }

    // attendance
    if (a === "attendance") {
      await requireUser(req, TEACHING);
      if (b === "grid") return await attendanceGrid(q);
      if (b === "month") return await attendanceMonth(q);
      return err("not found", 404);
    }

    // backup
    if (a === "backup") {
      await requireUser(req, ["ADMIN", "OWNER"]);
      return await backupHandler();
    }

    // notifications export
    if (a === "notifications" && b === "export") {
      await requireUser(req, ["ADMIN", "FINANCE", "STAFF"]);
      return await notificationExport(q);
    }

    // student detail
    if (a === "students" && b) {
      await requireUser(req, ALL);
      return await studentDetail(b);
    }

    // staff detail
    if (a === "staff" && b) {
      await requireUser(req, ["ADMIN", "OWNER"]);
      return await staffDetail(b);
    }

    // exam detail
    if (a === "exams" && b) {
      await requireUser(req, ["ADMIN", "TEACHER", "OWNER"]);
      return await examDetail(b);
    }

    // generic resource list / single item
    const def = RESOURCES[a];
    if (def && b) {
      await requireUser(req, def.read);
      const item = (await delegate(def.model).findUnique({ where: { id: b }, include: INCLUDES[a] })) as Record<string, unknown> | null;
      if (!item) return err("not found", 404);
      if (a === "invoices") {
        const enriched = {
          ...item,
          due: Math.max(0, (item.amount as number) - ((item.discount as number) ?? 0)),
          remaining: Math.max(0, (item.amount as number) - ((item.discount as number) ?? 0) - ((item.paidAmount as number) ?? 0)),
          status: invoiceStatus(item as never),
        };
        return json({ item: enriched });
      }
      if (a === "users") return json({ item: sanitizeUser(item) });
      return json({ item });
    }
    if (def) {
      await requireUser(req, def.read);
      return await listResource(a, q);
    }

    return err("not found", 404);
  } catch (e) {
    return handleCatch(e);
  }
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { slug } = await ctx.params;
    const [a, b, c] = slug ?? [];
    const user = await getSessionUserForWrite(req);
    const body = await safeBody(req);

    if (a === "attendance" && b === "bulk") {
      await requireUser(req, TEACHING);
      return await attendanceBulk(user, body);
    }
    if (a === "fees" && b === "structures") {
      await requireUser(req, FINWRITE);
      return await feeStructureUpsert(body);
    }
    if (a === "fees" && b === "generate") {
      await requireUser(req, FINWRITE);
      return await feeGenerate(user, body);
    }
    if (a === "fees" && b === "payments") {
      await requireUser(req, FINWRITE);
      return await feePaymentCreate(user, body);
    }
    if (a === "handovers") {
      await requireUser(req, FINWRITE);
      return await handoverCreate(user, body);
    }
    if (a === "exams" && b && c === "marks") {
      await requireUser(req, ["ADMIN", "TEACHER"]);
      return await examMarksUpsert(user, b, body);
    }
    if (a === "exams" && b && c === "compute") {
      await requireUser(req, ["ADMIN", "TEACHER"]);
      return await examCompute(user, b);
    }
    if (a === "notifications" && b && c === "send") {
      await requireUser(req, ["ADMIN", "FINANCE", "STAFF"]);
      return await notificationSend(user, b);
    }
    if (a === "notifications") {
      await requireUser(req, ["ADMIN", "FINANCE", "STAFF"]);
      return await notificationCreate(user, body);
    }
    if (a === "treasury" && b === "withdraw") {
      await requireUser(req, ["ADMIN", "OWNER"]);
      return await treasuryWithdraw(user, body);
    }
    if (a === "treasury") {
      await requireUser(req, FINWRITE);
      return await treasuryCreate(user, body);
    }
    if (a === "salaries" && b === "generate") {
      await requireUser(req, FINWRITE);
      return await salariesGenerate(user, body);
    }
    if (a === "salaries" && b && c === "pay") {
      await requireUser(req, FINWRITE);
      return await salaryPay(user, b, body);
    }
    if (a === "students" && b && c === "enroll") {
      await requireUser(req, ["ADMIN", "STAFF"]);
      return await enrollStudent(user, b, body);
    }
    if (a === "settings") {
      await requireUser(req, ["ADMIN"]);
      const key = String(body.key ?? b ?? "");
      const value = typeof body.value === "string" ? body.value : JSON.stringify(body.value ?? "");
      if (!key) return err("key لازم است");
      const item = await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
      await audit(user.id, "update", "Setting", key, { value });
      return json({ item });
    }

    // generic create
    const def = RESOURCES[a];
    if (def && !b) {
      await requireUser(req, def.write);
      return await createResource(user, a, body);
    }
    return err("not found", 404);
  } catch (e) {
    return handleCatch(e);
  }
}

export async function PUT(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { slug } = await ctx.params;
    const [a, b, c] = slug ?? [];
    const user = await getSessionUserForWrite(req);
    const body = await safeBody(req);

    if (a === "handovers" && b && c === "confirm") {
      await requireUser(req, ["ADMIN", "OWNER"]);
      return await handoverConfirm(user, b);
    }
    if (a === "fees" && b === "structures" && c) {
      await requireUser(req, FINWRITE);
      return await feeStructureUpsert(body, c);
    }
    if (a === "users" && b && c === "reset") {
      await requireUser(req, ["ADMIN"]);
      return await userResetPassword(user, b, body);
    }
    if (a === "settings" && b) {
      await requireUser(req, ["ADMIN"]);
      const value = typeof body.value === "string" ? body.value : JSON.stringify(body.value ?? "");
      const item = await db.setting.upsert({ where: { key: b }, create: { key: b, value }, update: { value } });
      await audit(user.id, "update", "Setting", b, { value });
      return json({ item });
    }

    const def = RESOURCES[a];
    if (def && b) {
      await requireUser(req, def.write);
      return await updateResource(user, a, b, body);
    }
    return err("not found", 404);
  } catch (e) {
    return handleCatch(e);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { slug } = await ctx.params;
    const [a, b] = slug ?? [];
    const user = await getSessionUserForWrite(req);
    const def = RESOURCES[a];
    if (def && b) {
      await requireUser(req, def.write);
      return await deleteResource(user, a, b);
    }
    return err("not found", 404);
  } catch (e) {
    return handleCatch(e);
  }
}

/** Same as requireUser but returns the user (for write handlers that need it before role checks). */
async function getSessionUserForWrite(req: NextRequest): Promise<AuthUser> {
  const { getSessionUser } = await import("@/lib/auth");
  const u = await getSessionUser(req);
  if (!u) throw NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return u;
}

async function safeBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
