"use client";

import { useEffect } from "react";

/** Buka dialog cetak sekali setelah halaman (dan gambar QR/barcode) siap. */
export default function AutoPrint() {
  useEffect(() => {
    const go = () => setTimeout(() => window.print(), 300);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, []);
  return null;
}
