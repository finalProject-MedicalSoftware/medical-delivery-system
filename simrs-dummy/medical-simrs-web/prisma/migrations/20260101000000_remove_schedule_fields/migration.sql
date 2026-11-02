-- Remove dueAt and doseTime columns from t_delivery_request
ALTER TABLE t_delivery_request DROP COLUMN IF EXISTS due_at;
ALTER TABLE t_delivery_request DROP COLUMN IF EXISTS dose_time;
