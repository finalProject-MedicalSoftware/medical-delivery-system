import { describe, it, expect, afterEach } from "vitest";
import {
  patientScanPath,
  patientQrBaseUrl,
  patientQrUrl,
} from "@/lib/wristband";
import { mrnCode128DataUrl } from "@/lib/wristband-code128";
import { signScanToken, verifyScanToken } from "@/lib/qr-token";

/** Bentuk token: `t=<exp>.<base64url HMAC-SHA256(mrn:exp)>` (tanpa anchor, agar bisa disisipkan). */
const TOKEN_SRC = String.raw`t=\d+\.[A-Za-z0-9_-]+`;

describe("URL QR gelang pasien", () => {
  afterEach(() => {
    for (const key of [
      "QR_BASE_URL",
      "NEXTAUTH_URL",
      "QR_SIGNING_SECRET",
      "QR_TOKEN_TTL_SECONDS",
    ] as const) {
      delete process.env[key];
    }
  });

  it("menyusun path scan dengan MRN ter-encode", () => {
    expect(patientScanPath("SYN-MRN-001")).toBe("/scan/SYN-MRN-001");
  });

  it("menambahkan token tanda tangan pada path scan", () => {
    process.env.QR_SIGNING_SECRET = "rahasia-uji";
    const token = signScanToken("SYN-MRN-001");
    expect(patientScanPath("SYN-MRN-001", token)).toMatch(
      /^\/scan\/SYN-MRN-001\?t=\d+\.[A-Za-z0-9_-]+$/,
    );
  });

  it("memakai QR_BASE_URL dengan prioritas tertinggi", () => {
    process.env.QR_BASE_URL = "https://simrs.rs.example";
    process.env.NEXTAUTH_URL = "https://auth.rs.example";
    expect(
      patientQrBaseUrl({
        QR_BASE_URL: process.env.QR_BASE_URL,
        NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      }),
    ).toBe("https://simrs.rs.example");
  });

  it("fallback ke NEXTAUTH_URL bila QR_BASE_URL kosong", () => {
    process.env.NEXTAUTH_URL = "https://auth.rs.example";
    expect(
      patientQrBaseUrl({
        NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      }),
    ).toBe("https://auth.rs.example");
  });

  it("fallback ke localhost bila env tidak diisi", () => {
    expect(patientQrBaseUrl({})).toBe("http://localhost:3000");
  });

  it("menyusun URL QR lengkap dan membuang slash ganda di akhir base", () => {
    expect(patientQrUrl("SYN-MRN-001", "https://simrs.rs.example/")).toMatch(
      new RegExp(
        `^https://simrs\\.rs\\.example/scan/SYN-MRN-001\\?${TOKEN_SRC}$`,
      ),
    );
    expect(patientQrUrl("SYN-MRN-001", "http://localhost:3000")).toMatch(
      new RegExp(
        `^http://localhost:3000/scan/SYN-MRN-001\\?${TOKEN_SRC}$`,
      ),
    );
  });
});

describe("Token tanda tangan QR", () => {
  afterEach(() => {
    delete process.env.QR_SIGNING_SECRET;
    delete process.env.QR_TOKEN_TTL_SECONDS;
  });

  it("menerima token yang baru ditandatangani", () => {
    process.env.QR_SIGNING_SECRET = "rahasia-uji";
    expect(verifyScanToken("SYN-MRN-001", signScanToken("SYN-MRN-001", 60))).toBe(
      true,
    );
  });

  it("menolak token kedaluwarsa", () => {
    process.env.QR_SIGNING_SECRET = "rahasia-uji";
    expect(verifyScanToken("SYN-MRN-001", signScanToken("SYN-MRN-001", -1))).toBe(
      false,
    );
  });

  it("menolak MRN lain, tanda tangan diubah, dan token kosong", () => {
    process.env.QR_SIGNING_SECRET = "rahasia-uji";
    const token = signScanToken("SYN-MRN-001", 60);
    const [exp, sig] = token.split(".");
    const tampered = (sig[0] === "a" ? "b" : "a") + sig.slice(1);

    expect(verifyScanToken("SYN-MRN-002", token)).toBe(false);
    expect(verifyScanToken("SYN-MRN-001", `${exp}.${tampered}`)).toBe(false);
    expect(verifyScanToken("SYN-MRN-001", `${exp}.`)).toBe(false);
    expect(verifyScanToken("SYN-MRN-001", "bukan-token")).toBe(false);
    expect(verifyScanToken("SYN-MRN-001", "")).toBe(false);
    expect(verifyScanToken("SYN-MRN-001", undefined)).toBe(false);
  });
});

describe("Barcode Code 128 MRN", () => {
  it("membuat data URL SVG Code 128 untuk MRN standar", () => {
    const dataUrl = mrnCode128DataUrl("SYN-MRN-001");
    expect(dataUrl).not.toBeNull();
    expect(dataUrl?.startsWith("data:image/svg+xml;base64,")).toBe(true);

    const encoded = dataUrl?.slice("data:image/svg+xml;base64,".length) ?? "";
    const svg = Buffer.from(encoded, "base64").toString("utf-8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("path");
  });

  it("menolak MRN kosong dan karakter non-ASCII", () => {
    expect(mrnCode128DataUrl("")).toBeNull();
    expect(mrnCode128DataUrl("   ")).toBeNull();
    expect(mrnCode128DataUrl("SYN-MRN-001é")).toBeNull();
  });
});
