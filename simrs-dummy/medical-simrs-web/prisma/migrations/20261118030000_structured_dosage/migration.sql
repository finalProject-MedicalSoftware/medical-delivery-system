-- Aturan pakai terstruktur per item resep (resep lama: kolom baru null/default; teks instructions tetap).
CREATE TYPE "MealTiming" AS ENUM ('ANYTIME', 'BEFORE_MEAL', 'AFTER_MEAL', 'WITH_MEAL');
CREATE TYPE "AdminRoute" AS ENUM ('ORAL', 'CHEW', 'DISSOLVE', 'DROPS', 'TOPICAL', 'INHALE', 'INJECTION');

ALTER TABLE "t_prescription_item"
  ADD COLUMN "dose_amount" DOUBLE PRECISION,
  ADD COLUMN "dose_unit" TEXT,
  ADD COLUMN "times_per_day" INTEGER,
  ADD COLUMN "meal_timing" "MealTiming" NOT NULL DEFAULT 'ANYTIME',
  ADD COLUMN "duration_days" INTEGER,
  ADD COLUMN "admin_route" "AdminRoute" NOT NULL DEFAULT 'ORAL',
  ADD COLUMN "dose_note" TEXT;
