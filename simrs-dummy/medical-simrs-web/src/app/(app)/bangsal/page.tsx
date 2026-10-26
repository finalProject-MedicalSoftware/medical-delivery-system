import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { BedDouble, Plus, Pencil } from "lucide-react";
import { deleteWardAction, deleteRoomAction } from "@/app/actions/wards";
import ActionButton from "@/components/ActionButton";
import BedManager from "@/components/BedManager";
import { PageHeader, btnPrimary } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bangsal & Ruang - SIMRS Dummy" };

export default async function BangsalPage() {
  const user = await getCurrentUser();

  const canManage =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes("master:manage");

  const wards = await prisma.ward.findMany({
    orderBy: { floor: "asc" },
    include: {
      rooms: {
        orderBy: { roomCode: "asc" },
        include: {
          beds: {
            orderBy: { bedNumber: "asc" },
            include: {
              patients: {
                where: { dischargedAt: null },
                select: { fullName: true },
              },
            },
          },
          _count: { select: { deliveryRequests: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        icon={BedDouble}
        iconCls="text-teal-700"
        title="Bangsal & Ruang Rawat"
        subtitle={`${wards.length} bangsal · room_code stabil untuk mapping navigasi`}
        action={
          canManage ? (
            <Link href="/bangsal/ward/baru" id="btn-tambah-bangsal" className={btnPrimary}>
              <Plus className="h-4 w-4" />
              Tambah Bangsal
            </Link>
          ) : undefined
        }
      />

      <div className="space-y-4">
        {wards.map((ward) => (
          <div key={ward.id} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
              <div>
                <h2 className="font-semibold text-slate-900">{ward.name}</h2>
                <p className="font-mono text-xs text-slate-500">{ward.code} · Lantai {ward.floor}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {ward.rooms.length} ruang
              </span>
              {canManage && (
                <div className="ml-auto flex items-center gap-2">
                  <Link
                    href={`/bangsal/ruang/baru?wardId=${ward.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ruang
                  </Link>
                  <Link
                    href={`/bangsal/ward/${ward.id}/edit`}
                    title="Ubah bangsal"
                    aria-label={`Ubah ${ward.name}`}
                    className="rounded-lg border border-slate-300 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  <ActionButton
                    action={deleteWardAction.bind(null, ward.id)}
                    confirmMessage={`Hapus ${ward.name}? Hanya bisa jika tidak ada ruang di dalamnya.`}
                    confirmTitle="Hapus bangsal"
                    danger
                    successMessage="Bangsal dihapus"
                    title="Hapus bangsal"
                    ariaLabel={`Hapus ${ward.name}`}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    Hapus
                  </ActionButton>
                </div>
              )}
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {ward.rooms.length === 0 && (
                <p className="text-xs text-slate-400">Belum ada ruang di bangsal ini.</p>
              )}
              {ward.rooms.map((room) => (
                <div
                  key={room.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-teal-700">
                      {room.roomCode}
                    </span>
                    {canManage ? (
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/bangsal/ruang/${room.id}/edit`}
                          title="Ubah ruang"
                          aria-label={`Ubah ${room.roomCode}`}
                          className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                        <ActionButton
                          action={deleteRoomAction.bind(null, room.id)}
                          confirmMessage={`Hapus ${room.roomCode}? Hanya bisa jika tidak ada bed dan pengantaran terkait.`}
                          confirmTitle="Hapus ruang"
                          danger
                          successMessage="Ruang dihapus"
                          title="Hapus ruang"
                          ariaLabel={`Hapus ${room.roomCode}`}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          Hapus
                        </ActionButton>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {room.beds.length} tempat tidur
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">{room.name}</p>
                  <div className="mt-2">
                    {canManage ? (
                      <BedManager
                        roomId={room.id}
                        beds={room.beds.map((bed) => ({
                          ...bed,
                          occupantName: bed.patients[0]?.fullName ?? null,
                        }))}
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {room.beds.map((bed) => {
                          const occupantName = bed.patients[0]?.fullName ?? null;
                          return (
                            <span
                              key={bed.id}
                              title={occupantName ? `Ditempati ${occupantName}` : "Kosong"}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                bed.isOccupied || occupantName
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {bed.bedNumber}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {room._count.deliveryRequests > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      {room._count.deliveryRequests} pengantaran terkait
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
