// Client-safe MoE constants (mirror of src/lib/moe.ts defaults — moe.ts imports
// the Prisma client, so it must never be imported from "use client" modules).

export interface GradeBand {
  min: number;
  label: string;
}

export interface ExamTypeDefault {
  type: string;
  maxPerSubject: number;
}

/** امتیازات پیش‌فرض — لایحه درجه‌بندی شاگردان */
export const MOE_GRADE_BANDS: GradeBand[] = [
  { min: 86, label: "عالی" },
  { min: 66, label: "خوب" },
  { min: 40, label: "قابل" },
  { min: 0, label: "مردود" },
];

export const MOE_EXAM_TYPES: ExamTypeDefault[] = [
  { type: "چهارونیم‌ماهه", maxPerSubject: 40 },
  { type: "سالانه", maxPerSubject: 60 },
  { type: "دو ماهه اول", maxPerSubject: 100 },
  { type: "دو ماهه دوم", maxPerSubject: 100 },
];

/** درجه از مجموع نمرات به اساس باندهای نمره‌ای */
export function gradeForTotal(total: number, bands: GradeBand[] = MOE_GRADE_BANDS): string {
  for (const b of bands) {
    if (total >= b.min) return b.label;
  }
  return "مردود";
}
