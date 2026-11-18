/**
 * Pasien "layak dipanggil" monitoring/robot: punya pengantaran yang sudah
 * dikirim ke robot DAN (menular ATAU petugas menulis alasan). Satu aturan
 * dipakai /monitoring/patients dan /monitoring/patient/{mrn}.
 */
export interface DispatchedDelivery {
  requestCode: string;
  status: string;
  robotReason: string | null;
}

export function robotEligibility(isInfectious: boolean, deliveries: DispatchedDelivery[]) {
  const robotReason = deliveries.find((d) => d.robotReason)?.robotReason ?? null;
  return {
    robotEligible: deliveries.length > 0 && (isInfectious || robotReason !== null),
    robotReason,
  };
}
