-- Pengantaran robot untuk pasien tidak menular wajib beralasan.
ALTER TABLE "t_delivery_request" ADD COLUMN "robot_reason" TEXT;
