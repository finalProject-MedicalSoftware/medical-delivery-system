-- Konvensi penamaan KP TIFA: m_ (master/referensi), t_ (transaksional), h_ (riwayat append-only).
-- Hanya rename; tidak ada perubahan kolom, tipe, atau data.

-- Tabel
ALTER TABLE "users" RENAME TO "m_user";
ALTER TABLE "roles" RENAME TO "m_role";
ALTER TABLE "user_roles" RENAME TO "m_user_role";
ALTER TABLE "permissions" RENAME TO "m_permission";
ALTER TABLE "role_permissions" RENAME TO "m_role_permission";
ALTER TABLE "patients" RENAME TO "m_patient";
ALTER TABLE "wards" RENAME TO "m_ward";
ALTER TABLE "rooms" RENAME TO "m_room";
ALTER TABLE "beds" RENAME TO "m_bed";
ALTER TABLE "medicines" RENAME TO "m_medicine";
ALTER TABLE "prescriptions" RENAME TO "t_prescription";
ALTER TABLE "prescription_items" RENAME TO "t_prescription_item";
ALTER TABLE "delivery_requests" RENAME TO "t_delivery_request";
ALTER TABLE "delivery_events" RENAME TO "h_delivery_event";
ALTER TABLE "audit_logs" RENAME TO "h_audit_log";

-- Constraint (primary key + foreign key)
ALTER TABLE "h_audit_log" RENAME CONSTRAINT "audit_logs_actor_id_fkey" TO "h_audit_log_actor_id_fkey";
ALTER TABLE "h_audit_log" RENAME CONSTRAINT "audit_logs_pkey" TO "h_audit_log_pkey";
ALTER TABLE "m_bed" RENAME CONSTRAINT "beds_pkey" TO "m_bed_pkey";
ALTER TABLE "m_bed" RENAME CONSTRAINT "beds_room_id_fkey" TO "m_bed_room_id_fkey";
ALTER TABLE "h_delivery_event" RENAME CONSTRAINT "delivery_events_delivery_request_id_fkey" TO "h_delivery_event_delivery_request_id_fkey";
ALTER TABLE "h_delivery_event" RENAME CONSTRAINT "delivery_events_pkey" TO "h_delivery_event_pkey";
ALTER TABLE "t_delivery_request" RENAME CONSTRAINT "delivery_requests_pkey" TO "t_delivery_request_pkey";
ALTER TABLE "t_delivery_request" RENAME CONSTRAINT "delivery_requests_prescription_id_fkey" TO "t_delivery_request_prescription_id_fkey";
ALTER TABLE "t_delivery_request" RENAME CONSTRAINT "delivery_requests_requested_by_id_fkey" TO "t_delivery_request_requested_by_id_fkey";
ALTER TABLE "t_delivery_request" RENAME CONSTRAINT "delivery_requests_room_code_fkey" TO "t_delivery_request_room_code_fkey";
ALTER TABLE "m_medicine" RENAME CONSTRAINT "medicines_pkey" TO "m_medicine_pkey";
ALTER TABLE "m_patient" RENAME CONSTRAINT "patients_bed_id_fkey" TO "m_patient_bed_id_fkey";
ALTER TABLE "m_patient" RENAME CONSTRAINT "patients_pkey" TO "m_patient_pkey";
ALTER TABLE "m_permission" RENAME CONSTRAINT "permissions_pkey" TO "m_permission_pkey";
ALTER TABLE "t_prescription_item" RENAME CONSTRAINT "prescription_items_medicine_id_fkey" TO "t_prescription_item_medicine_id_fkey";
ALTER TABLE "t_prescription_item" RENAME CONSTRAINT "prescription_items_pkey" TO "t_prescription_item_pkey";
ALTER TABLE "t_prescription_item" RENAME CONSTRAINT "prescription_items_prescription_id_fkey" TO "t_prescription_item_prescription_id_fkey";
ALTER TABLE "t_prescription" RENAME CONSTRAINT "prescriptions_doctor_id_fkey" TO "t_prescription_doctor_id_fkey";
ALTER TABLE "t_prescription" RENAME CONSTRAINT "prescriptions_patient_id_fkey" TO "t_prescription_patient_id_fkey";
ALTER TABLE "t_prescription" RENAME CONSTRAINT "prescriptions_pkey" TO "t_prescription_pkey";
ALTER TABLE "t_prescription" RENAME CONSTRAINT "prescriptions_verified_by_id_fkey" TO "t_prescription_verified_by_id_fkey";
ALTER TABLE "m_role_permission" RENAME CONSTRAINT "role_permissions_permission_id_fkey" TO "m_role_permission_permission_id_fkey";
ALTER TABLE "m_role_permission" RENAME CONSTRAINT "role_permissions_pkey" TO "m_role_permission_pkey";
ALTER TABLE "m_role_permission" RENAME CONSTRAINT "role_permissions_role_id_fkey" TO "m_role_permission_role_id_fkey";
ALTER TABLE "m_role" RENAME CONSTRAINT "roles_pkey" TO "m_role_pkey";
ALTER TABLE "m_room" RENAME CONSTRAINT "rooms_pkey" TO "m_room_pkey";
ALTER TABLE "m_room" RENAME CONSTRAINT "rooms_ward_id_fkey" TO "m_room_ward_id_fkey";
ALTER TABLE "m_user_role" RENAME CONSTRAINT "user_roles_pkey" TO "m_user_role_pkey";
ALTER TABLE "m_user_role" RENAME CONSTRAINT "user_roles_role_id_fkey" TO "m_user_role_role_id_fkey";
ALTER TABLE "m_user_role" RENAME CONSTRAINT "user_roles_user_id_fkey" TO "m_user_role_user_id_fkey";
ALTER TABLE "m_user" RENAME CONSTRAINT "users_pkey" TO "m_user_pkey";
ALTER TABLE "m_ward" RENAME CONSTRAINT "wards_pkey" TO "m_ward_pkey";

-- Index
ALTER INDEX "audit_logs_actor_id_idx" RENAME TO "h_audit_log_actor_id_idx";
ALTER INDEX "audit_logs_created_at_idx" RENAME TO "h_audit_log_created_at_idx";
ALTER INDEX "audit_logs_entity_type_entity_id_idx" RENAME TO "h_audit_log_entity_type_entity_id_idx";
ALTER INDEX "beds_room_id_bed_number_key" RENAME TO "m_bed_room_id_bed_number_key";
ALTER INDEX "delivery_events_delivery_request_id_idx" RENAME TO "h_delivery_event_delivery_request_id_idx";
ALTER INDEX "delivery_events_idempotency_key_key" RENAME TO "h_delivery_event_idempotency_key_key";
ALTER INDEX "delivery_requests_request_code_key" RENAME TO "t_delivery_request_request_code_key";
ALTER INDEX "delivery_requests_room_code_idx" RENAME TO "t_delivery_request_room_code_idx";
ALTER INDEX "delivery_requests_status_idx" RENAME TO "t_delivery_request_status_idx";
ALTER INDEX "medicines_code_key" RENAME TO "m_medicine_code_key";
ALTER INDEX "patients_bed_id_idx" RENAME TO "m_patient_bed_id_idx";
ALTER INDEX "patients_discharged_at_idx" RENAME TO "m_patient_discharged_at_idx";
ALTER INDEX "patients_mrn_key" RENAME TO "m_patient_mrn_key";
ALTER INDEX "permissions_code_key" RENAME TO "m_permission_code_key";
ALTER INDEX "prescriptions_code_key" RENAME TO "t_prescription_code_key";
ALTER INDEX "prescriptions_patient_id_idx" RENAME TO "t_prescription_patient_id_idx";
ALTER INDEX "prescriptions_status_idx" RENAME TO "t_prescription_status_idx";
ALTER INDEX "role_permissions_permission_id_idx" RENAME TO "m_role_permission_permission_id_idx";
ALTER INDEX "role_permissions_role_id_idx" RENAME TO "m_role_permission_role_id_idx";
ALTER INDEX "role_permissions_role_id_permission_id_key" RENAME TO "m_role_permission_role_id_permission_id_key";
ALTER INDEX "roles_code_key" RENAME TO "m_role_code_key";
ALTER INDEX "rooms_room_code_idx" RENAME TO "m_room_room_code_idx";
ALTER INDEX "rooms_room_code_key" RENAME TO "m_room_room_code_key";
ALTER INDEX "user_roles_role_id_idx" RENAME TO "m_user_role_role_id_idx";
ALTER INDEX "user_roles_user_id_idx" RENAME TO "m_user_role_user_id_idx";
ALTER INDEX "user_roles_user_id_role_id_key" RENAME TO "m_user_role_user_id_role_id_key";
ALTER INDEX "users_email_key" RENAME TO "m_user_email_key";
ALTER INDEX "users_username_key" RENAME TO "m_user_username_key";
ALTER INDEX "wards_code_key" RENAME TO "m_ward_code_key";
