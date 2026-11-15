"use client";

import { ReactNode, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Printer } from "lucide-react";
import { useT } from "@/components/app/store";

export interface SchoolHeaderInfo {
  name: string;
  nameEn: string;
  licenseNo: string;
  phone: string;
  email: string;
  address: string;
  logoText: string;
}

/** Full-screen printable overlay. Print CSS (globals.css) hides the app shell and prints #nq-printable only. */
export function PrintOverlay({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { t } = useT();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-start justify-center overflow-y-auto p-4 print:p-0 print:static print:bg-white">
      <div id="nq-printable" className="nq-print-doc bg-white w-full max-w-[850px] rounded-lg shadow-xl my-6 print:my-0 print:shadow-none">
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b print:hidden">
          <h3 className="font-bold text-sm">{title}</h3>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 me-1" /> {t.print}
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="h-4 w-4 me-1" /> {t.close}
            </Button>
          </div>
        </div>
        <div className="p-6 print:p-2">{children}</div>
      </div>
    </div>
  );
}

/** MoE-style letterhead used by all printables */
export function DocLetterhead({ school, yearName }: { school: SchoolHeaderInfo | null; yearName?: string }) {
  return (
    <div className="text-center border-b-2 border-black pb-2 mb-3">
      <div className="text-sm font-bold">بسم الله الرحمن الرحیم</div>
      <div className="text-lg font-extrabold mt-1">{school?.name ?? "مکتب خصوصی نداالقلم"}</div>
      <div className="text-xs">{school?.nameEn ?? "Neda al-Qalam Private School"}</div>
      <div className="text-[11px] mt-0.5">
        تحت پوشش وزارت معارف افغانستان
        {school?.licenseNo ? ` — جواز: ${school.licenseNo}` : ""}
        {yearName ? ` — سال تعلیمی ${yearName}` : ""}
      </div>
      {(school?.phone || school?.address) && (
        <div className="text-[10px] text-gray-700">
          {school?.address} {school?.phone ? ` — تیلفون: ${school.phone}` : ""}
        </div>
      )}
    </div>
  );
}

export function SignatureRow({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex justify-between mt-10 text-xs">
      <div>{left}: ...............................</div>
      <div>{right}: ...............................</div>
    </div>
  );
}
