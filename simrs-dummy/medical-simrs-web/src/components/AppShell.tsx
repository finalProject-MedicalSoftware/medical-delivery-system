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
    ],
  },
  {
    title: "Admin",
    items: [
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

function getRoleBadgeColor(role: string): string {
  const colors: Record<string, string> = {
    SYSTEM_ADMIN: "bg-rose-500/15 text-rose-300",
    SIMRS_ADMIN: "bg-sky-500/15 text-sky-300",
    DOCTOR: "bg-teal-500/15 text-teal-300",
    PHARMACIST: "bg-emerald-500/15 text-emerald-300",
    PHARMACY_STAFF: "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30",
    NURSE: "bg-amber-500/15 text-amber-300",
    WARD_ADMIN: "bg-slate-500/15 text-slate-300",
  };
  return colors[role] ?? "bg-white/10 text-slate-300";
}

export default function AppShell({
  user,
  children,
}: {
  user: UserAuthContext;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-page text-txt-main">
      {/* Sidebar gelap (gaya tifa-web) */}
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar md:flex">
        {/* Logo */}
        <div className="border-b border-white/10 px-4 py-4">
          <SimrsLogo
            tileClassName="h-8 w-8 rounded-lg bg-accent"
            iconClassName="h-4 w-4"
            titleClassName="text-white"
            subtitleClassName="text-slate-400"
          />
        </div>

        {/* Nav per seksi */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((item) => canAccess(user, item));
            if (!items.length) return null;
            return (
              <div key={section.title} className="mb-3">
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {section.title}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/dashboard" && pathname.startsWith(item.href));
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-accent text-white"
                              : "text-slate-400 hover:bg-white/5 hover:text-white"
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
              </div>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 rounded-lg bg-white/5 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-txt-accent" />
              <p className="truncate text-xs font-semibold text-white">
                {user.fullName}
              </p>
            </div>
            <p className="mb-1.5 font-mono text-[10px] text-slate-400">{user.username}</p>
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
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
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
