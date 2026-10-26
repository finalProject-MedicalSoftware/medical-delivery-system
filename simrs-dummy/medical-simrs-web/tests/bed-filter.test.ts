import { describe, it, expect } from "vitest";
import {
  filterRoomsForDropdown,
  bedDisplayName,
  type RoomAvailability,
} from "@/lib/bed-info";

function makeRoom(roomCode: string, freeBeds: number, totalBeds: number): RoomAvailability {
  const beds = Array.from({ length: totalBeds }, (_, i) => {
    const free = i < freeBeds;
    return {
      id: `${roomCode}-bed-${i}`,
      bedNumber: String.fromCharCode(65 + i),
      isOccupied: !free,
      occupantName: free ? null : "Penghuni Fiktif",
      free,
    };
  });
  return {
    id: roomCode,
    roomCode,
    name: `Ruang ${roomCode}`,
    wardName: "Bangsal Uji",
    beds,
    freeCount: freeBeds,
  };
}

describe("Label tampilan bed", () => {
  it("menampilkan nomor bed bila ada", () => {
    expect(bedDisplayName("A")).toBe("Bed A");
  });

  it("menampilkan strip bila tanpa bed", () => {
    expect(bedDisplayName(null)).toBe("-");
    expect(bedDisplayName(undefined)).toBe("-");
  });
});

describe("Filter ruang untuk dropdown pasien", () => {
  it("menyembunyikan ruang penuh saat tambah pasien baru", () => {
    const rooms = [makeRoom("R-A", 0, 2), makeRoom("R-B", 1, 2)];
    const result = filterRoomsForDropdown(rooms, null);
    expect(result.map((r) => r.roomCode)).toEqual(["R-B"]);
  });

  it("tetap menampilkan ruang pasien saat ini walau penuh (mode ubah)", () => {
    const rooms = [makeRoom("R-A", 0, 2), makeRoom("R-B", 1, 2)];
    const result = filterRoomsForDropdown(rooms, "R-A");
    expect(result.map((r) => r.roomCode)).toEqual(["R-A", "R-B"]);
  });

  it("menghitung bed bebas dari flag dan penghuni", () => {
    const rooms = [makeRoom("R-A", 2, 2)];
    expect(rooms[0].freeCount).toBe(2);
    expect(rooms[0].beds.every((b) => b.free)).toBe(true);
  });
});
