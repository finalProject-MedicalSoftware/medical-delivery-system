/**
 * Validasi frame HMI_REPORT (tablet HMI -> gateway). Laporan ini TIDAK
 * diteruskan ke robot; gateway menormalkan lalu mengirim ke Kafka + dashboard.
 * Hanya field whitelist (angka/boolean/enum) yang lolos — tidak ada nama/MRN.
 */
const METHODS = new Set(['camera', 'keyboard', 'nurse_override', 'not_required']);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const int = (v) => Number.isInteger(v) && v >= 0 && v <= 1000;
const bool = (v) => typeof v === 'boolean';
const isoOrNull = (v) => v === null || (typeof v === 'string' && ISO.test(v));

/** @returns {{ok:true, report:object} | {ok:false, error:string}} */
function normalizeHmiReport(d) {
  if (!d || typeof d !== 'object') return { ok: false, error: 'INVALID_REPORT' };
  const id = d.identity || {};
  const tb = d.teachBack || {};
  const checks = [
    int(d.sequence), isoOrNull(d.arrivedAt ?? null), isoOrNull(d.presentDoneAt ?? null),
    bool(id.required), bool(id.verified), id.method === null || METHODS.has(id.method), int(id.mismatches),
    bool(d.allergyShown), int(d.replays), int(d.notUnderstood), bool(d.doctorCalled),
    bool(tb.asked), tb.correct === null || bool(tb.correct), bool(d.scheduleQrShown)
  ];
  if (checks.includes(false)) return { ok: false, error: 'INVALID_REPORT' };
  return {
    ok: true,
    report: {
      sequence: d.sequence, arrivedAt: d.arrivedAt ?? null, presentDoneAt: d.presentDoneAt ?? null,
      identity: { required: id.required, verified: id.verified, method: id.method, mismatches: id.mismatches },
      allergyShown: d.allergyShown, replays: d.replays, notUnderstood: d.notUnderstood,
      doctorCalled: d.doctorCalled, teachBack: { asked: tb.asked, correct: tb.correct },
      scheduleQrShown: d.scheduleQrShown
    }
  };
}

module.exports = { normalizeHmiReport };
