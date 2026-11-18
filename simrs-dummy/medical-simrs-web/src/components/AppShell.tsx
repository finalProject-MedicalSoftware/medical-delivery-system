"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { UserAuthContext } from "@/lib/rbac";
import {
  LayoutDashboard,
  Users,
  BedDouble,
  Pill,
  FileText,
  Truck,
  ClipboardList,
  Settings,
  LogOut,
  Menu,
  BarChart3,
  Radio,
} from "lucide-react";
import LiveRefresh from "@/components/LiveRefresh";
import SimrsLogo from "@/components/SimrsLogo";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permissions?: string[];
  roles?: string[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// Dirampingkan: halaman Integrasi tidak lagi di menu (halaman tetap ada untuk akses langsung).
const NAV_SECTIONS: NavSection[] = [
  {
    title: "Utama",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Operasional",
    items: [
      {
        href: "/pasien",
        label: "Pasien",
        icon: Users,
        permissions: ["prescription:read", "prescription:create"],
      },
      {
        href: "/bangsal",
        label: "Bangsal & Ruang",
        icon: BedDouble,
        permissions: ["master:manage", "delivery:read"],
      },
      {
        href: "/obat",
        label: "Katalog Obat",
        icon: Pill,
        permissions: ["prescription:read", "master:manage"],
      },
      {
        href: "/resep",
        label: "Resep",
        icon: FileText,
        permissions: ["prescription:read", "prescription:create"],
      },
      {
        href: "/pengantaran",
        label: "Pengantaran",
        icon: Truck,
        permissions: ["delivery:read", "delivery:create"],
      },
    ],
  },
  {
    title: "Pengelolaan",
    items: [
      {
        href: "/laporan",
        label: "Laporan",
        icon: BarChart3,
        permissions: ["delivery:read"],
      },
      {
        href: "/integrasi",
        label: "Integrasi",
        icon: Radio,
        roles: ["SYSTEM_ADMIN", "SIMRS_ADMIN"],
      },
      {
        href: "/audit",
        label: "Audit Trail",
        icon: ClipboardList,
        permissions: ["audit:read"],
        roles: ["SYSTEM_ADMIN"],
      },
      {
        href: "/pengguna",
        label: "Pengguna & Role",
        icon: Settings,
        roles: ["SYSTEM_ADMIN", "SIMRS_ADMIN"],
      },
    ],
  },
];

function canAccess(user: UserAuthContext, item: NavItem): boolean {
  // SYSTEM_ADMIN sees everything
  if (user.roles.includes("SYSTEM_ADMIN")) return true;

  // Check role match
  if (item.roles?.length) {
    if (item.roles.some((r) => user.roles.includes(r))) return true;
  }

  // Check permission match
  if (item.permissions?.length) {
    if (item.permissions.some((p) => user.permissions.includes(p))) return true;
  }

  // Items with neither restriction are public to authenticated users
  if (!item.roles?.length && !item.permissions?.length) return true;

  return false;
}

const ROLE_LABEL: Record<string, string> = {
  SYSTEM_ADMIN: "Admin Sistem",
  SIMRS_ADMIN: "Admin SIMRS",
  DOCTOR: "Dokter",
  PHARMACIST: "Apoteker",
  PHARMACY_STAFF: "Staf Farmasi",
  NURSE: "Perawat",
  WARD_ADMIN: "Admin Bangsal",
};

function initials(name: string): string {
  return name.replace(/^(dr\.?|apt\.?|ns\.?)\s+/i, "").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export default function AppShell({
  user,
  children,
}: {
  user: UserAuthContext;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => canAccess(user, i)) })).filter((s) => s.items.length);
  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navigasi utama">
      {sections.map((section) => (
        <div key={section.title} className="mb-5">
          <p className="mb-1 px-2.5 text-xs font-medium text-slate-500">{section.title}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? "bg-teal-50 text-teal-800"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const account = (
    <div className="border-t border-slate-200 p-3">
      <div className="flex items-center gap-2.5 px-1.5 py-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">
          {initials(user.fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{user.fullName}</p>
          <p className="truncate text-xs text-slate-500">
            {user.roles.map((r) => ROLE_LABEL[r] ?? r).join(" · ")}
          </p>
        </div>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          id="logout-btn"
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4" />
          Keluar
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-page text-txt-main">
      <LiveRefresh />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-sidebar md:flex">
        <div className="px-4 py-4">
          <SimrsLogo
            tileClassName="h-8 w-8 rounded-lg"
            iconClassName="h-4 w-4"
            title="SIMRS"
            subtitle="Farmasi & Pengantaran Obat"
          />
        </div>
        {nav}
        {account}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Bar atas ponsel/tablet: menu disclosure tanpa JS tambahan */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white md:hidden">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
              <SimrsLogo tileClassName="h-7 w-7 rounded-md" iconClassName="h-3.5 w-3.5" title="SIMRS" showSubtitle={false} />
              <Menu className="h-5 w-5 text-slate-600" aria-label="Menu" />
            </summary>
            <div className="max-h-[80vh] overflow-y-auto border-t border-slate-200 bg-white">
              {nav}
              {account}
            </div>
          </details>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
          <p className="mx-auto mt-10 max-w-6xl text-xs text-slate-400">Data demo. Bukan sistem klinis produksi.</p>
        </main>
      </div>
    </div>
  );
}
