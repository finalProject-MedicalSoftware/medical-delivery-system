"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";
import { TOAST_COOKIE } from "@/lib/toast-cookie";

export type ToastKind = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOpts {
  description?: string;
  action?: ToastAction;
  /** ms sebelum hilang otomatis. <=0 = menempel sampai ditutup. */
  duration?: number;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  action?: ToastAction;
  sticky?: boolean;
}

interface ToastApi {
  success: (title: string, opts?: ToastOpts) => void;
  error: (title: string, opts?: ToastOpts) => void;
  warning: (title: string, opts?: ToastOpts) => void;
  info: (title: string, opts?: ToastOpts) => void;
  loading: (title: string, opts?: ToastOpts) => number;
  update: (id: number, kind: ToastKind, title: string, opts?: ToastOpts) => void;
  dismiss: (id: number) => void;
  promise<T>(
    p: Promise<T>,
    msgs: {
      loading: string;
      success: string | ((v: T) => string);
      error: string | ((e: unknown) => string);
    }
  ): Promise<T>;
}

const noop = () => {};
const noopId = () => 0;
async function noopAsync() {}
const ToastCtx = createContext<{ toast: ToastApi }>({
  toast: {
    success: noop,
    error: noop,
    warning: noop,
    info: noop,
    loading: noopId,
    update: noop,
    dismiss: noop,
    promise: (p) => p,
  },
});

const VALID_KINDS: ToastKind[] = ["success", "error", "warning", "info"];

function readFlash(): { kind: ToastKind; title: string; description?: string } | null {
  try {
    const m = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${TOAST_COOKIE}=([^;]*)`)
    );
    if (!m) return null;
    document.cookie = `${TOAST_COOKIE}=; path=/; max-age=0`;
    const v = JSON.parse(decodeURIComponent(m[1]));
    if (v && typeof v.msg === "string") {
      // Kompatibel format lama {kind,msg} dan baru {kind,title,description}
      const title = typeof v.title === "string" ? v.title : v.msg;
      const description = typeof v.description === "string" ? v.description : undefined;
      const kind: ToastKind = VALID_KINDS.includes(v.kind) ? v.kind : "success";
      return { kind, title, description };
    }
    if (v && typeof v.title === "string") {
      const kind: ToastKind = VALID_KINDS.includes(v.kind) ? v.kind : "success";
      return {
        kind,
        title: v.title,
        description: typeof v.description === "string" ? v.description : undefined,
      };
    }
  } catch {
    /* abaikan cookie rusak */
  }
  return null;
}

const KIND_STYLE: Record<ToastKind, { bar: string; icon: typeof Info; text: string }> = {
  success: { bar: "bg-emerald-500", icon: CheckCircle2, text: "text-emerald-700" },
  error: { bar: "bg-rose-500", icon: XCircle, text: "text-rose-700" },
  warning: { bar: "bg-amber-500", icon: AlertTriangle, text: "text-amber-700" },
  info: { bar: "bg-sky-500", icon: Info, text: "text-sky-700" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  // Handle timeout disimpan sebagai unknown agar kompilasi bersih
  // di semua environment (DOM me-return number). Hanya dipakai di klien.
  const timers = useRef(new Map<number, unknown>());
  const pathname = usePathname();

  const clearTimer = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t !== undefined) {
      window.clearTimeout(t as number);
      timers.current.delete(id);
    }
  }, []);

  const scheduleDismiss = useCallback(
    (id: number, duration: number) => {
      clearTimer(id);
      if (duration > 0) {
        timers.current.set(
          id,
          window.setTimeout(() => {
            setItems((prev) => prev.filter((t) => t.id !== id));
            timers.current.delete(id);
          }, duration)
        );
      }
    },
    [clearTimer]
  );

  const push = useCallback(
    (kind: ToastKind, title: string, opts?: ToastOpts): number => {
      const id = ++idRef.current;
      const duration = opts?.duration ?? 4500;
      setItems((prev) => [
        ...prev.slice(-2),
        {
          id,
          kind,
          title,
          description: opts?.description,
          action: opts?.action,
          sticky: duration <= 0,
        },
      ]);
      if (duration > 0) scheduleDismiss(id, duration);
      return id;
    },
    [scheduleDismiss]
  );

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      setItems((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const update = useCallback(
    (id: number, kind: ToastKind, title: string, opts?: ToastOpts) => {
      const duration = opts?.duration ?? 4500;
      setItems((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                kind,
                title,
                description: opts?.description,
                action: opts?.action,
                sticky: duration <= 0,
              }
            : t
        )
      );
      if (duration > 0) scheduleDismiss(id, duration);
      else clearTimer(id);
    },
    [scheduleDismiss, clearTimer]
  );

  // Tampilkan pesan flash dari server action setelah redirect
  useEffect(() => {
    const f = readFlash();
    if (f) push(f.kind, f.title, { description: f.description });
  }, [pathname, push]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => window.clearTimeout(t as number));
      map.clear();
    };
  }, []);

  const api: ToastApi = {
    success: (title, opts) => void push("success", title, opts),
    error: (title, opts) => void push("error", title, opts),
    warning: (title, opts) => void push("warning", title, opts),
    info: (title, opts) => void push("info", title, opts),
    loading: (title, opts) => push("info", title, { ...opts, duration: 0 }),
    update,
    dismiss,
    promise: async (p, msgs) => {
      const id = push("info", msgs.loading, { duration: 0 });
      try {
        const v = await p;
        update(
          id,
          "success",
          typeof msgs.success === "function" ? msgs.success(v) : msgs.success
        );
        return v;
      } catch (e) {
        update(
          id,
          "error",
          typeof msgs.error === "function" ? msgs.error(e) : msgs.error
        );
        throw e;
      }
    },
  };

  void noopAsync;

  return (
    <ToastCtx.Provider value={{ toast: api }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      >
        {items.map((t) => {
          const s = KIND_STYLE[t.kind];
          const Icon = s.icon;
          return (
            <div
              key={t.id}
              className="animate-toast-in pointer-events-auto flex items-stretch gap-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
              role="status"
            >
              <span className={`w-1 shrink-0 ${s.bar}`} aria-hidden="true" />
              <span className="flex flex-1 items-start gap-2 px-3 py-2.5">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.text}`} />
                <span className="flex-1">
                  <span className="block text-xs font-semibold leading-relaxed text-slate-800">
                    {t.title}
                  </span>
                  {t.description && (
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                      {t.description}
                    </span>
                  )}
                  {t.action && (
                    <button
                      type="button"
                      onClick={() => {
                        t.action!.onClick();
                        dismiss(t.id);
                      }}
                      className="mt-1.5 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-teal-700 transition hover:bg-slate-50"
                    >
                      {t.action.label}
                    </button>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Tutup notifikasi"
                  className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastCtx).toast;
}
