"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle } from "lucide-react";

export interface ConfirmOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOpts) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(async () => false);

interface PendingReq {
  opts: ConfirmOpts;
  resolve: (v: boolean) => void;
}

/**
 * Dialog konfirmasi kustom pengganti window.confirm.
 * Pakai: const confirmed = await confirm({ message: "...", danger: true });
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<PendingReq | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => setReq({ opts, resolve }));
  }, []);

  function answer(v: boolean) {
    setReq((cur) => {
      cur?.resolve(v);
      return null;
    });
  }

  useEffect(() => {
    if (!req) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") answer(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);

  const danger = req?.opts.danger ?? false;

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {req && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => answer(false)}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={req.opts.title ?? "Konfirmasi"}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  danger ? "bg-rose-100" : "bg-amber-100"
                }`}
              >
                <AlertTriangle
                  className={`h-4 w-4 ${danger ? "text-rose-700" : "text-amber-700"}`}
                />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {req.opts.title ?? "Konfirmasi"}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  {req.opts.message}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => answer(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => answer(true)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
                  danger
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-teal-700 hover:bg-teal-800"
                }`}
              >
                {req.opts.confirmLabel ?? (danger ? "Ya, hapus" : "Ya, lanjut")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmCtx);
}
