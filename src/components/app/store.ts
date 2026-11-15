"use client";

import { create } from "zustand";
import { Locale, getDict, Dict, dirOf } from "@/lib/i18n";
import { useState, useEffect } from "react";

interface AppState {
  locale: Locale;
  user: { id: string; username: string; fullName: string; role: string; phone: string } | null;
  authChecked: boolean;
  setLocale: (l: Locale) => void;
  setUser: (u: AppState["user"]) => void;
  setAuthChecked: (v: boolean) => void;
}

function applyLocale(l: Locale) {
  if (typeof document !== "undefined") {
    document.documentElement.dir = dirOf(l);
    document.documentElement.lang = l === "en" ? "en" : l === "ps" ? "ps-AF" : "fa-AF";
  }
  if (typeof window !== "undefined") {
    localStorage.setItem("nq_locale", l);
  }
}

export const useApp = create<AppState>((set) => ({
  locale: "dr",
  user: null,
  authChecked: false,
  setLocale: (l) => {
    applyLocale(l);
    set({ locale: l });
  },
  setUser: (u) => set({ user: u }),
  setAuthChecked: (v) => set({ authChecked: v }),
}));

// apply persisted locale once on client bootstrap
if (typeof window !== "undefined") {
  const stored = localStorage.getItem("nq_locale") as Locale | null;
  if (stored === "dr" || stored === "ps" || stored === "en") applyLocale(stored);
}

export function useT(): { t: Dict; locale: Locale; setLocale: (l: Locale) => void; rtl: boolean } {
  const locale = useApp((s) => s.locale);
  const setLocale = useApp((s) => s.setLocale);
  return { t: getDict(locale), locale, setLocale, rtl: locale !== "en" };
}

const EASTERN = "۰۱۲۳۴۵۶۷۸۹";

/** number / money formatters per locale (Eastern Arabic-Indic for dr/ps) */
export function useN() {
  const locale = useApp((s) => s.locale);
  const eastern = (s: string | number): string => {
    if (locale === "en") return String(s);
    return String(s).replace(/[0-9]/g, (d) => EASTERN[parseInt(d)]);
  };
  return {
    eastern,
    n: (v: number | null | undefined, digits = 0): string => {
      const val = typeof v === "number" && Number.isFinite(v) ? v : 0;
      const s = digits > 0 ? val.toFixed(digits) : Math.round(val).toString();
      return eastern(s);
    },
    money: (v: number | null | undefined): string => {
      const val = typeof v === "number" && Number.isFinite(v) ? v : 0;
      const grouped = Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
      if (locale === "en") return `${grouped} AFN`;
      return `${eastern(grouped)} افغانی`;
    },
  };
}

/** hash-based router */
export function useHashRoute(): { route: string; navigate: (r: string) => void } {
  const getRoute = (): string => {
    if (typeof window === "undefined") return "#/dashboard";
    const h = window.location.hash;
    return h && h.startsWith("#/") ? h : "#/dashboard";
  };
  const [route, setRoute] = useState(getRoute);
  useEffect(() => {
    const handler = () => setRoute(getRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return { route, navigate: (r: string) => { window.location.hash = r; setRoute(r); } };
}

export function getSchoolFromMeta(school: { name: string; logoText: string; licenseNo: string; address: string; phone: string; nameEn: string } | null): string {
  return school?.name ?? "مکتب خصوصی نداالقلم";
}
