-- ============================================================
-- Grihaz — Baseline Schema
-- Migration: 001_baseline_schema.sql
-- Captured: March 2026
-- Description: Complete schema snapshot of all tables built
--              during Phase 1 (Attendance & Payroll) and
--              Phase 2 (Laundry Tracker).
--              Run this first on any new database instance.
-- ============================================================

-- ============================================================
-- Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Tables
-- ============================================================

-- homes
CREATE TABLE IF NOT EXISTS homes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- profiles (mirrors auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY,
  display_name TEXT,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- home_members
CREATE TABLE IF NOT EXISTS home_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id    UUID REFERENCES homes(id) ON DELETE CASCADE,
  user_id    UUID,
  role       TEXT DEFAULT 'member',
  invited_at TIMESTAMPTZ DEFAULT now()
);

-- home_invites
CREATE TABLE IF NOT EXISTS home_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id    UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  token      UUID NOT NULL DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
  used_at    TIMESTAMPTZ,
  used_by    UUID
);

-- staff
CREATE TABLE IF NOT EXISTS staff (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id       UUID REFERENCES homes(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  role          TEXT,
  pay_type      TEXT NOT NULL,
  monthly_rate  NUMERIC,
  daily_rate    NUMERIC,
  schedule      JSONB,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  terminated_at TIMESTAMPTZ,
  staff_type    TEXT DEFAULT 'regular'
);

-- staff_contracts
CREATE TABLE IF NOT EXISTS staff_contracts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       UUID REFERENCES staff(id) ON DELETE CASCADE,
  home_id        UUID REFERENCES homes(id) ON DELETE CASCADE,
  pay_type       TEXT NOT NULL,
  monthly_rate   NUMERIC,
  daily_rate     NUMERIC,
  schedule       JSONB,
  effective_from DATE NOT NULL,
  effective_to   DATE,
  created_by     UUID,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- attendance
CREATE TABLE IF NOT EXISTS attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID REFERENCES staff(id) ON DELETE CASCADE,
  home_id    UUID REFERENCES homes(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  status     TEXT NOT NULL,
  marked_by  UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- adhoc_entries
CREATE TABLE IF NOT EXISTS adhoc_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID REFERENCES staff(id) ON DELETE CASCADE,
  home_id         UUID REFERENCES homes(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  description     TEXT,
  amount          NUMERIC NOT NULL,
  type            TEXT NOT NULL,
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  settlement      TEXT,
  settlement_mode TEXT,
  settled         BOOLEAN DEFAULT false,
  staff_type      TEXT
);

-- settlements
CREATE TABLE IF NOT EXISTS settlements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID REFERENCES staff(id) ON DELETE CASCADE,
  home_id     UUID REFERENCES homes(id) ON DELETE CASCADE,
  month       DATE,
  amount      NUMERIC,
  mode        TEXT,
  settled_at  TIMESTAMPTZ,
  settled_by  UUID,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- laundry_entries
CREATE TABLE IF NOT EXISTS laundry_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id        UUID REFERENCES homes(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  category       TEXT,
  service_type   TEXT,
  quantity       INTEGER,
  price_per_item NUMERIC,
  status         TEXT DEFAULT 'given',
  created_by     UUID,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE homes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_invites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff           ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE adhoc_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE laundry_entries ENABLE ROW LEVEL SECURITY;

-- homes: members can see their own homes
CREATE POLICY "home members can select homes"
  ON homes FOR SELECT
  USING (id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "authenticated users can insert homes"
  ON homes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "home members can update homes"
  ON homes FOR UPDATE
  USING (id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- profiles: users manage their own profile
CREATE POLICY "users can select own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- home_members: members can see their home's members
CREATE POLICY "home members can select home_members"
  ON home_members FOR SELECT
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can insert home_members"
  ON home_members FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can delete home_members"
  ON home_members FOR DELETE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- home_invites
CREATE POLICY "home members can select home_invites"
  ON home_invites FOR SELECT
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can insert home_invites"
  ON home_invites FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can update home_invites"
  ON home_invites FOR UPDATE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- staff
CREATE POLICY "home members can select staff"
  ON staff FOR SELECT
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can insert staff"
  ON staff FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can update staff"
  ON staff FOR UPDATE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can delete staff"
  ON staff FOR DELETE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- staff_contracts
CREATE POLICY "home members can select staff_contracts"
  ON staff_contracts FOR SELECT
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can insert staff_contracts"
  ON staff_contracts FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can update staff_contracts"
  ON staff_contracts FOR UPDATE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- attendance
CREATE POLICY "home members can select attendance"
  ON attendance FOR SELECT
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can insert attendance"
  ON attendance FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can update attendance"
  ON attendance FOR UPDATE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can delete attendance"
  ON attendance FOR DELETE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- adhoc_entries
CREATE POLICY "home members can select adhoc_entries"
  ON adhoc_entries FOR SELECT
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can insert adhoc_entries"
  ON adhoc_entries FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can update adhoc_entries"
  ON adhoc_entries FOR UPDATE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can delete adhoc_entries"
  ON adhoc_entries FOR DELETE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- settlements
CREATE POLICY "home members can select settlements"
  ON settlements FOR SELECT
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can insert settlements"
  ON settlements FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can update settlements"
  ON settlements FOR UPDATE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- laundry_entries
CREATE POLICY "home members can select laundry_entries"
  ON laundry_entries FOR SELECT
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can insert laundry_entries"
  ON laundry_entries FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can update laundry_entries"
  ON laundry_entries FOR UPDATE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can delete laundry_entries"
  ON laundry_entries FOR DELETE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));
