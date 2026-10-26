"use client";

import { useState, useTransition } from "react";
import { assignRoleAction, revokeRoleAction } from "@/app/actions/roles";
import { useToast } from "@/components/Toast";
import Select from "@/components/Select";
import { X } from "lucide-react";

interface RoleManagementProps {
  targetUserId: string;
  currentRoles?: string[];
  allRoles?: string[];
  actorId: string;
}

/**
 * Kontrol role ringkas di dalam sel tabel: chip role aktif
 * (dengan tombol cabut) + dropdown tambah role. Memakai server
 * action asli (assignRoleAction/revokeRoleAction), bukan fetch.
 */
export default function RoleManagement({
  targetUserId,
  currentRoles = [],
  allRoles = [],
  actorId,
}: RoleManagementProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const toast = useToast();

  const available = allRoles.filter((r) => !currentRoles.includes(r));

  function run(action: Promise<{ success: boolean; message: string }>, successMessage: string) {
    setError(null);
    startTransition(async () => {
      const res = await action;
      if (res.success) {
        toast.success(successMessage);
        setSelected("");
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div className="min-w-52 space-y-2">
      <div className="flex flex-wrap gap-1">
        {currentRoles.length === 0 && (
          <span className="text-xs text-slate-400">Tidak ada role</span>
        )}
        {currentRoles.map((r) => (
          <span
            key={r}
            className="inline-flex items-center gap-1 rounded bg-teal-100 py-0.5 pl-1.5 pr-1 font-mono text-[11px] font-medium text-teal-800"
          >
            {r}
            <button
              type="button"
              disabled={isPending}
              title={`Cabut role ${r}`}
              aria-label={`Cabut role ${r}`}
              onClick={() =>
                run(revokeRoleAction(targetUserId, r, actorId), `Role ${r} dicabut`)
              }
              className="rounded p-0.5 transition hover:bg-teal-200 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      {available.length > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <Select
              ariaLabel="Pilih role untuk ditambah"
              placeholder="+ Role…"
              value={selected}
              onChange={setSelected}
              options={available.map((r) => ({ value: r, label: r }))}
            />
          </div>
          <button
            type="button"
            disabled={isPending || !selected}
            title="Tambah role"
            aria-label="Tambah role"
            onClick={() =>
              selected &&
              run(assignRoleAction(targetUserId, selected, actorId), `Role ${selected} ditambah`)
            }
            className="shrink-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-50 disabled:opacity-50"
          >
            Tambah
          </button>
        </div>
      )}

      {isPending && <p className="text-[11px] text-slate-400">Memproses…</p>}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
