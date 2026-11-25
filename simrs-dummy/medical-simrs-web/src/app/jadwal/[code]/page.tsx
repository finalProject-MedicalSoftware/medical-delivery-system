import { notFound } from "next/navigation";
import { verifyScheduleToken } from "@/lib/schedule-token";
import { initials } from "@/lib/hmi-brief";
import { MEAL_TIMING_LABELS, ROUTE_LABELS, formatAmount } from "@/lib/dosage";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/**
 * Jadwal minum obat untuk keluarga (dibuka dari QR di layar robot).
 * Publik tetapi hanya dengan token bertanda tangan & berumur pendek. Tidak memuat
 * nama lengkap, MRN, diagnosis, atau ruang: hanya inisial + obat + jadwal.
 */
const SLOT_SETS: Record<number, string[]> = { 1: ["Pagi"], 2: ["Pagi", "Malam"], 3: ["Pagi", "Siang", "Malam"], 4: ["Pagi", "Siang", "Sore", "Malam"] };
const ALL_SLOTS = ["Pagi", "Siang", "Sore", "Malam"];

export default async function JadwalPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { code } = await params;
  const { t } = await searchParams;
  if (!verifyScheduleToken(code, t)) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">Tautan jadwal tidak berlaku</h1>
        <p className="mt-2 text-sm text-slate-600">QR sudah kedaluwarsa atau tidak valid. Minta perawat menampilkan jadwal terbaru.</p>
      </main>
    );
  }

  const { default: prisma } = await import("@/lib/prisma");
  const d = await prisma.deliveryRequest.findUnique({
    where: { requestCode: code },
    select: {
      requestCode: true,
      prescription: {
        select: {
          doseTimes: true,
          patient: { select: { fullName: true, allergies: true } },
          items: {
            orderBy: { createdAt: "asc" },
            select: {
              quantity: true, instructions: true, doseAmount: true, doseUnit: true, timesPerDay: true,
              mealTiming: true, durationDays: true, adminRoute: true, doseNote: true,
              medicine: { select: { name: true, unit: true } },
            },
          },
        },
      },
    },
  });
  if (!d) notFound();
  const rx = d.prescription;

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-5 print:p-0">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Jadwal minum obat · Data sintetis</p>
        <h1 className="text-2xl font-bold text-slate-900">Pasien {initials(rx.patient.fullName)}</h1>
        <p className="text-sm text-slate-600">Simpan halaman ini. Ikuti jadwal sampai obat habis kecuali dokter berkata lain.</p>
      </header>

      {rx.patient.allergies.length > 0 && (
        <div className="rounded-xl border-2 border-rose-500 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
          Alergi tercatat: {rx.patient.allergies.join(", ")}. Jangan beri obat ini tanpa persetujuan dokter.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Obat</th>
              {ALL_SLOTS.map((s) => <th key={s} className="p-3 text-center">{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {rx.items.map((i, k) => {
              const slots = i.timesPerDay ? SLOT_SETS[i.timesPerDay] ?? [] : [];
              const dose = i.doseAmount != null ? `${formatAmount(i.doseAmount)} ${i.doseUnit ?? i.medicine.unit}` : "";
              return (
                <tr key={k} className="border-t border-slate-100 align-top">
                  <td className="p-3">
                    <p className="font-semibold text-slate-900">{i.medicine.name}</p>
                    <p className="text-xs text-slate-600">{i.instructions}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[ROUTE_LABELS[i.adminRoute as keyof typeof ROUTE_LABELS], i.mealTiming !== "ANYTIME" ? MEAL_TIMING_LABELS[i.mealTiming as keyof typeof MEAL_TIMING_LABELS] : null, i.durationDays ? `${i.durationDays} hari` : null].filter(Boolean).join(" · ")}
                    </p>
                    {i.timesPerDay && !SLOT_SETS[i.timesPerDay] && <p className="text-xs text-slate-500">{i.timesPerDay} kali sehari (jam dari perawat)</p>}
                  </td>
                  {ALL_SLOTS.map((s) => (
                    <td key={s} className="p-3 text-center">
                      {slots.includes(s) ? <span className="inline-block rounded-full bg-teal-100 px-2 py-1 text-xs font-bold text-teal-800">{dose || "✓"}</span> : <span className="text-slate-300">–</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rx.doseTimes.length > 0 && (
        <p className="text-sm text-slate-600">Jam minum yang ditetapkan: <b>{rx.doseTimes.join(", ")}</b></p>
      )}
      <p className="text-xs text-slate-400">Kode pengantaran {d.requestCode}. Halaman ini tidak memuat nama lengkap atau nomor rekam medis.</p>
      <div className="print:hidden"><PrintButton className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white" label="Cetak jadwal" /></div>
    </main>
  );
}
