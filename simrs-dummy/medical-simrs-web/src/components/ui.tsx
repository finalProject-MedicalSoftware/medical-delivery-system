import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { deliveryStatusLabel, deliveryStatusTone, prescriptionStatusLabel } from "@/lib/delivery-status";

/**
 * Primitif UI bersama tema klinis terang: putih + slate,
 * aksen teal-700 solid, amber hanya untuk peringatan.
 * Tanpa gradien, tanpa glow.
 */

export const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60";

export const btnSecondary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60";

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

export const labelCls = "mb-1.5 block text-xs font-medium text-slate-600";

export const cardCls = "rounded-xl border border-slate-200 bg-white p-5";


export const tableWrapCls = "overflow-x-auto rounded-xl border border-slate-200 bg-white";

export const theadCls =
  "border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600";

export const rowCls = "bg-white transition-colors hover:bg-slate-50";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  icon?: LucideIcon;
  iconCls?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  message,
  action,
}: {
  icon: LucideIcon;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
      <Icon className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm text-slate-500">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Label status (resep + delivery) berasal dari satu sumber di
// lib/delivery-status; peta tone (kelas warna) tetap di sini karena
// urusan tampilan, bukan domain.
const TONE_CLASSES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-600",
  sky: "bg-sky-100 text-sky-800",
  emerald: "bg-emerald-100 text-emerald-800",
  rose: "bg-rose-100 text-rose-800",
  amber: "bg-amber-100 text-amber-800",
  teal: "bg-teal-100 text-teal-800",
};

const RX_TONES: Record<string, string> = {
  DRAFT: "slate",
  SUBMITTED: "sky",
  VERIFIED: "emerald",
  REJECTED: "rose",
  PREPARING: "amber",
  READY_FOR_DELIVERY: "teal",
  CANCELLED: "slate",
};

export function StatusBadge({ status }: { status: string }) {
  const label = prescriptionStatusLabel(status, deliveryStatusLabel(status));
  const tone = RX_TONES[status] ?? deliveryStatusTone(status, "slate");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "ROUTINE") return null;
  const cls = priority === "STAT" ? "bg-rose-600 text-white" : "bg-amber-100 text-amber-800";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {priority === "STAT" ? "STAT" : "Mendesak"}
    </span>
  );
}

export function CodeLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-mono text-xs font-semibold text-teal-700 hover:underline"
    >
      {children}
    </Link>
  );
}
