import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "سیستم مدیریت مکتب خصوصی نداالقلم",
  description:
    "سیستم جامع مدیریت مکتب خصوصی نداالقلم — تحت پوشش وزارت معارف افغانستان. سازنده: حسام الدین سیدی",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa-AF" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-background text-foreground font-[Vazirmatn,'Segoe_UI',Tahoma,sans-serif]">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
