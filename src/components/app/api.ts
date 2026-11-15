"use client";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const apiGet = <T,>(path: string) => api<T>(path);
export const apiPost = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const apiPut = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const apiPatch = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const apiDelete = <T,>(path: string) => api<T>(path, { method: "DELETE" });

export interface MetaResponse {
  school: {
    id: string; name: string; nameEn: string; licenseNo: string; phone: string;
    email: string; address: string; logoText: string; currentYearId: string | null;
  } | null;
  years: { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }[];
  currentYear: { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean } | null;
  classrooms: { id: string; grade: number; section: string; name: string; level: string; academicYearId: string; homeroomStaffId: string | null }[];
  subjects: { id: string; nameDr: string; namePs: string; nameEn: string }[];
  staff: { id: string; staffNo: string; name: string; position: string; subjectSpecialty: string; baseSalary: number; phone: string; status: string }[];
  feeStructures: { id: string; gradeBand: string; monthlyAmount: number; academicYearId: string }[];
  branches: { id: string; name: string; phone: string; address: string }[];
  classSubjects: { id: string; classroomId: string; subjectId: string; staffId: string | null }[];
}

export interface MeResponse {
  user: { id: string; username: string; fullName: string; role: string; phone: string } | null;
}
