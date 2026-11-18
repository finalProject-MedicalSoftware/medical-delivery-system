"use client";

import { Printer } from "lucide-react";

/**
 * Tombol cetak client-side untuk halaman gelang.
 * Hanya memanggil window.print(); layout cetak diatur
 * oleh CSS @media print pada halaman gelang.
 */
export default function PrintButton({ className, label = "Cetak Gelang" }: { className?: string; label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      <Printer className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
