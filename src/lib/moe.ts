// قوانین وزارت معارف افغانستان — MoE (Afghanistan) grading/promotion rules.
// Pure functions here; overrides load from Setting rows (passMark, minAverage,
// gradeBands, examWeights) via getMoeRules().

import { db } from "@/lib/db";

export interface GradeBand {
  min: number;
  label: string;
}

export interface ExamTypeDefault {
  type: string;
  maxPerSubject: number;
}

export interface MoeRules {
  passMark: number;
  minAverage: number;
  gradeBands: GradeBand[];
  examTypes: ExamTypeDefault[];
  descriptiveGrades: number; // صنف 1-3 always promoted (descriptive)
}

/** امتیازات پیش‌فرض — لایحه درجه‌بندی شاگردان (defaults, settings-overrideable) */
export const GRADE_BANDS: GradeBand[] = [
  { min: 86, label: "عالی" },
  { min: 66, label: "خوب" },
  { min: 40, label: "قابل" },
  { min: 0, label: "مردود" },
];

export const EXAM_TYPES: ExamTypeDefault[] = [
  { type: "چهارونیم‌ماهه", maxPerSubject: 40 },
  { type: "سالانه", maxPerSubject: 60 },
  { type: "دو ماهه اول", maxPerSubject: 100 },
  { type: "دو ماهه دوم", maxPerSubject: 100 },
];

export const DEFAULT_MOE_RULES: MoeRules = {
  passMark: 40,
  minAverage: 55,
  gradeBands: GRADE_BANDS,
  examTypes: EXAM_TYPES,
  descriptiveGrades: 3,
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ابتدائیه 1-6 / متوسطه 7-9 / لیسه 10-12 */
export function levelOf(grade: number): string {
  if (grade <= 6) return "ابتدائیه";
  if (grade <= 9) return "متوسطه";
  return "لیسه";
}

/** Fee band of a grade */
export function bandOfGrade(grade: number): string {
  if (grade <= 3) return "1-3";
  if (grade <= 6) return "4-6";
  if (grade <= 9) return "7-9";
  return "10-12";
}

/** Load MoE rules with Setting-row overrides (passMark, minAverage, gradeBands, examWeights) */
export async function getMoeRules(): Promise<MoeRules> {
  const rules: MoeRules = { ...DEFAULT_MOE_RULES, gradeBands: [...DEFAULT_MOE_RULES.gradeBands], examTypes: [...DEFAULT_MOE_RULES.examTypes] };
  try {
    const rows = await db.setting.findMany({
      where: { key: { in: ["passMark", "minAverage", "gradeBands", "examWeights"] } },
    });
    for (const row of rows) {
      if (row.key === "passMark") {
        const v = Number(row.value);
        if (Number.isFinite(v) && v > 0) rules.passMark = v;
      } else if (row.key === "minAverage") {
        const v = Number(row.value);
        if (Number.isFinite(v) && v > 0) rules.minAverage = v;
      } else if (row.key === "gradeBands") {
        try {
          const parsed = JSON.parse(row.value) as GradeBand[];
          if (Array.isArray(parsed) && parsed.length > 0) rules.gradeBands = parsed;
        } catch {
          /* keep default */
        }
      } else if (row.key === "examWeights") {
        // note-only setting (e.g. "چهارونیم‌ماهه 40 + سالانه 60 = 100 نمره سالانه")
        try {
          const parsed = JSON.parse(row.value) as unknown;
          if (Array.isArray(parsed) && parsed.length > 0) {
            rules.examTypes = parsed as ExamTypeDefault[];
          }
        } catch {
          /* free-text note — keep defaults */
        }
      }
    }
  } catch {
    /* db not ready — return defaults */
  }
  return rules;
}

/** درجه از مجموع نمرات: 86+ عالی، 66-85 خوب، 40-65 قابل، <40 مردود */
export function gradeFor(total: number, bands: GradeBand[] = GRADE_BANDS): string {
  for (const b of bands) {
    if (total >= b.min) return b.label;
  }
  return "مردود";
}

/** @alias gradeFor */
export const gradeOf = gradeFor;

/**
 * وضعیت ارتقا per MoE rules:
 * - صنف 1-3: همیشه ارتقا (توصیفی)
 * - صنف 4-12: all subjects passed AND average ≥ minAverage → ارتقا
 * - ≤2 failed subjects → ارتقا مشروط
 * - else → تکرار صنف
 */
export function computePromotion(
  failedCount: number,
  average: number,
  grade: number,
  rules: Pick<MoeRules, "minAverage" | "descriptiveGrades"> = DEFAULT_MOE_RULES,
): string {
  if (grade <= rules.descriptiveGrades) return "ارتقا";
  if (failedCount === 0 && average >= rules.minAverage) return "ارتقا";
  if (failedCount <= 2) return "ارتقا مشروط";
  return "تکرار صنف";
}

export interface ComputeOutcome {
  subjectResults: { subjectId: string; total: number; grade: string; passed: boolean }[];
  total: number;
  average: number;
  failedCount: number;
  status: string;
}

/**
 * Compute annual results for one enrollment.
 * Annual subject total = SUM of marks across exams (چهارونیم‌ماهه/40 + سالانه/60 → /100;
 * if only some exams are marked, total = sum of the available marks).
 * `classSubjects` are the ClassSubject rows of the classroom (marks are keyed by classSubjectId).
 */
export function computeForEnrollment(
  marks: { classSubjectId: string; marks: number }[],
  classSubjects: { id: string; subjectId: string }[],
  rules: MoeRules,
  grade: number,
  finalize = false,
): ComputeOutcome {
  const bySubject = new Map<string, number>();
  for (const m of marks) {
    bySubject.set(m.classSubjectId, (bySubject.get(m.classSubjectId) ?? 0) + m.marks);
  }
  const subjectResults: ComputeOutcome["subjectResults"] = [];
  let sumTotals = 0;
  let failedCount = 0;
  for (const cs of classSubjects) {
    const total = round2(bySubject.get(cs.id) ?? 0);
    const passed = total >= rules.passMark;
    if (!passed) failedCount++;
    sumTotals += total;
    subjectResults.push({ subjectId: cs.subjectId, total, grade: gradeFor(total, rules.gradeBands), passed });
  }
  const counted = subjectResults.length;
  const average = counted > 0 ? round2(sumTotals / counted) : 0;
  const status = finalize ? computePromotion(failedCount, average, grade, rules) : "در جریان";
  return { subjectResults, total: round2(sumTotals), average, failedCount, status };
}
