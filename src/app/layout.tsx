import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { Nav } from "@/components/nav";
import { SyncBar } from "@/components/sync-bar";
import { VaultGate } from "@/components/vault-gate";
import "./globals.css";

const notoThai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
});

export const metadata: Metadata = {
  title: "รายรับรายจ่าย",
  description: "จดง่าย ดูย้อนหลังได้ ใช้ได้ทุกเครื่อง",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "รายรับรายจ่าย" },
};

export const viewport: Viewport = {
  // viewportFit=cover + the safe-area padding below keeps the save button clear
  // of the iPhone home indicator once installed to the Home Screen.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className={`${notoThai.variable} font-[family-name:var(--font-thai)] antialiased`}>
        <main
          className="mx-auto min-h-dvh max-w-md px-5 py-6"
          style={{
            paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
            paddingTop: "calc(1.5rem + env(safe-area-inset-top))",
          }}
        >
          <VaultGate>
            <Nav />
            {children}
          </VaultGate>
          <SyncBar />
        </main>
      </body>
    </html>
  );
}
