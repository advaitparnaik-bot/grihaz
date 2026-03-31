-- ============================================================
-- Grihaz — Gmail OAuth Connections
-- Migration: 003_gmail_connections.sql
-- Phase 3 — Gmail import for expense tracking
-- ============================================================

-- Table: home_gmail_connections
-- Stores OAuth refresh tokens per home for Gmail sync
CREATE TABLE home_gmail_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id       UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,        -- encrypted, never expose to client
  last_synced_at TIMESTAMPTZ,         -- null = never synced (first run pending)
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (home_id)                    -- one Gmail connection per home
);

CREATE INDEX idx_gmail_connections_home    ON home_gmail_connections(home_id);
CREATE INDEX idx_gmail_connections_synced  ON home_gmail_connections(last_synced_at);

-- Row Level Security
ALTER TABLE home_gmail_connections ENABLE ROW LEVEL SECURITY;

-- Only home members can see/manage their home's Gmail connection
CREATE POLICY "home members can select gmail_connections"
  ON home_gmail_connections FOR SELECT
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can insert gmail_connections"
  ON home_gmail_connections FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can update gmail_connections"
  ON home_gmail_connections FOR UPDATE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can delete gmail_connections"
  ON home_gmail_connections FOR DELETE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));
