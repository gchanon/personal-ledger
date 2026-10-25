"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "จด" },
  { href: "/transactions", label: "รายการ" },
  { href: "/dashboard", label: "สรุป" },
  { href: "/budget", label: "งบ" },
  { href: "/settings", label: "ตั้งค่า" },
];

export function Nav() {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return null;

  return (
    <nav className="mb-5 grid grid-cols-5 gap-1 rounded-xl bg-neutral-100 p-1 text-sm dark:bg-neutral-800">
      {TABS.map((tab) => {
        const active =
          tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg py-2 text-center font-medium transition ${
              active
                ? "bg-white shadow-sm dark:bg-neutral-950"
                : "text-neutral-500"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
