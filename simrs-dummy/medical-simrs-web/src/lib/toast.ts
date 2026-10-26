import { cookies } from "next/headers";
import { TOAST_COOKIE } from "@/lib/toast-cookie";

/** Tulis pesan flash untuk dibaca Toaster setelah redirect. */
export async function flash(
  kind: "success" | "error" | "warning" | "info",
  title: string,
  description?: string
) {
  (await cookies()).set(
    TOAST_COOKIE,
    encodeURIComponent(JSON.stringify({ kind, title, description })),
    { path: "/", maxAge: 15, sameSite: "lax" }
  );
}

export const flashSuccess = (title: string, description?: string) =>
  flash("success", title, description);
