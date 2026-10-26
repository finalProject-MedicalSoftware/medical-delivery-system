import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET_KEY = new TextEncoder().encode(
  process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "simrs_dummy_local_secret_key_development_only_2026"
);

const SESSION_COOKIE_NAME = "simrs_session";
const SESSION_DURATION = 24 * 60 * 60; // 24 hours in seconds

// Aktifkan hanya bila aplikasi diakses via HTTPS (mis. VPS produksi).
// Default false agar login tetap jalan di http://localhost.
const COOKIE_SECURE =
  (process.env.COOKIE_SECURE ?? "false").toLowerCase() === "true";

export interface SessionPayload {
  userId: string;
  username: string;
  fullName: string;
  email?: string | null;
  roles: string[];
  permissions: string[];
  [key: string]: unknown;
}

/**
 * Encrypt a payload into a signed JWT string
 */
export async function encryptSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(SECRET_KEY);
}

/**
 * Decrypt and verify a signed JWT string
 */
export async function decryptSession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Set the session cookie in response headers
 */
export async function createSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await encryptSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION,
  });
}

/**
 * Read the current session from request cookies
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return await decryptSession(token);
}

/**
 * Delete the session cookie
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
