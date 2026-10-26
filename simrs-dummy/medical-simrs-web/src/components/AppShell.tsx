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
  Radio,
  LogOut,
  AlertTriangle,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import SimrsLogo from "@/components/SimrsLogo";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permissions?: string[];
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/pasien",
    label: "Pasien Sintetis",
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
  {
    href: "/integrasi",
    label: "Integrasi Monitoring",
    icon: Radio,
    roles: ["SYSTEM_ADMIN", "SIMRS_ADMIN"],
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

function getRoleBadgeColor(role: string): string {
  const colors: Record<string, string> = {
    SYSTEM_ADMIN: "bg-rose-100 text-rose-800",
    SIMRS_ADMIN: "bg-sky-100 text-sky-800",
    DOCTOR: "bg-teal-100 text-teal-800",
    PHARMACIST: "bg-emerald-100 text-emerald-800",
    PHARMACY_STAFF: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    NURSE: "bg-amber-100 text-amber-800",
    WARD_ADMIN: "bg-slate-200 text-slate-700",
  };
  return colors[role] ?? "bg-slate-100 text-slate-600";
}

export default function AppShell({
  user,
  children,
}: {
  user: UserAuthContext;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const visibleNav = NAV_ITEMS.filter((item) => canAccess(user, item));

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        {/* Logo */}
        <div className="border-b border-slate-200 px-4 py-4">
          <SimrsLogo tileClassName="h-8 w-8 rounded-lg" iconClassName="h-4 w-4" />
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Menu
          </p>
          <ul className="space-y-0.5">
            {visibleNav.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-teal-700 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {isActive && (
                      <ChevronRight className="h-3 w-3 opacity-70" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User info + logout */}
        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-teal-700" />
              <p className="truncate text-xs font-semibold text-slate-900">
                {user.fullName}
              </p>
            </div>
            <p className="mb-1.5 font-mono text-[10px] text-slate-500">{user.username}</p>
            <div className="flex flex-wrap gap-1">
              {user.roles.map((r) => (
                <span
                  key={r}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${getRoleBadgeColor(r)}`}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              id="logout-btn"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
            >
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Synthetic data banner */}
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
          <div className="flex items-center justify-center gap-1.5">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>
              <strong>PROTOTIPE AKADEMIK</strong> - Data 100% SINTETIS/FIKTIF. Bukan sistem klinis produksi.
            </span>
          </div>
        </div>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
