-- Flyway Migration V7: users pindah dari .env (in-memory) ke database, dengan role multi-level.
-- Satu user = satu role. Authority Spring: ROLE_<role> (ADMIN -> ROLE_ADMIN).

CREATE TYPE user_role AS ENUM ('ADMIN', 'FARMASI', 'OPERATOR');

CREATE TABLE IF NOT EXISTS m_user (
    id            UUID PRIMARY KEY,
    username      VARCHAR(64) NOT NULL,
    full_name     VARCHAR(150) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    role          user_role NOT NULL,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT m_user_username_key UNIQUE (username)
);

-- Akun demo (BCrypt cost 10). Password = <role>-local-change-me — WAJIB diganti sebelum dipakai
-- di luar lokal: UPDATE m_user SET password_hash = <hash baru> WHERE username = '<user>';
INSERT INTO m_user (id, username, full_name, password_hash, role) VALUES
    ('11111111-1111-4111-8111-111111111111', 'admin',    'Admin Monitoring',
     '$2a$10$IC1vV/a1cdtrNUHC0apbT.MGzMMlgkux9B74WPsS37HBMbedoj2uO', 'ADMIN'),
    ('22222222-2222-4222-8222-222222222222', 'farmasi',  'Farmasi Mission Control',
     '$2a$10$fZdclRSs7Bjc0JUqYxwEr.zNEhe3bxLcPwaZeHi5P8KApSyuV4vbW', 'FARMASI'),
    ('33333333-3333-4333-8333-333333333333', 'operator', 'Operator Robot',
     '$2a$10$HNIGcoYqZwki97CVP9RItOjnre8u02Fd8A1dGmM7yfIT2j11P0FDa', 'OPERATOR')
ON CONFLICT (username) DO NOTHING;
