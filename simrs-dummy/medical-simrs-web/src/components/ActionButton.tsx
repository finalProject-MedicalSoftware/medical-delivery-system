"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";

/**
 * Tombol aksi generik: dialog konfirmasi kustom (opsional),
 * state pending, toast sukses, dan pesan error inline.
 */
export default function ActionButton({
  action,
  confirmMessage,
  confirmTitle,
  danger,
  successMessage,
  className = "",
  title,
  ariaLabel,
  children,
}: {
  action: () => Promise<{ success: boolean; error?: string }>;
  confirmMessage?: string;
  confirmTitle?: string;
  danger?: boolean;
  successMessage?: string;
  className?: string;
  title?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  function handleClick() {
    (async () => {
      if (confirmMessage) {
        const ok = await confirm({
          title: confirmTitle,
          message: confirmMessage,
          danger,
        });
        if (!ok) return;
      }
      setError(null);
      startTransition(async () => {
        const res = await action();
        if (res.success) {
          if (successMessage) toast.success(successMessage);
        } else {
          setError(res.error ?? "Gagal memproses");
        }
      });
    })();
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={isPending}
        title={title}
        aria-label={ariaLabel ?? title}
        onClick={handleClick}
        className={`${className} disabled:opacity-50`}
      >
        {children}
      </button>
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </span>
  );
}
