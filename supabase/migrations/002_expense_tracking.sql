-- ============================================================
-- Grihaz — Expense Tracking Module
-- Migration: 002_expense_tracking.sql
-- Phase 3 — Household Expense Tracking
-- Platforms: Blinkit (grocery), Zomato (food_delivery),
--            Amazon (shopping)
-- ============================================================

-- Enum: platform categories
CREATE TYPE expense_platform_category AS ENUM (
  'grocery',
  'food_delivery',
  'shopping'
);

-- Table: expense_orders
CREATE TABLE expense_orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id     UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,
  category    expense_platform_category NOT NULL,
  order_date  DATE NOT NULL,
  order_ref   TEXT,
  order_total NUMERIC(10, 2) NOT NULL,
  notes       TEXT,
  created_by  UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: expense_order_items
CREATE TABLE expense_order_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES expense_orders(id) ON DELETE CASCADE,
  home_id    UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  item_name  TEXT NOT NULL,
  quantity   NUMERIC(8, 2) NOT NULL DEFAULT 1,
  unit       TEXT,
  unit_price NUMERIC(10, 2) NOT NULL,
  line_total NUMERIC(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for deduplication by order_ref
ALTER TABLE expense_orders
  ADD CONSTRAINT expense_orders_home_order_ref_unique
  UNIQUE (home_id, order_ref);

-- Indexes
CREATE INDEX idx_expense_orders_home_id    ON expense_orders(home_id);
CREATE INDEX idx_expense_orders_order_date ON expense_orders(order_date);
CREATE INDEX idx_expense_orders_platform   ON expense_orders(platform);
CREATE INDEX idx_expense_order_items_order ON expense_order_items(order_id);
CREATE INDEX idx_expense_order_items_home  ON expense_order_items(home_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER expense_orders_updated_at
  BEFORE UPDATE ON expense_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Row Level Security
ALTER TABLE expense_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home members can select expense_orders"
  ON expense_orders FOR SELECT
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can insert expense_orders"
  ON expense_orders FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can update expense_orders"
  ON expense_orders FOR UPDATE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can delete expense_orders"
  ON expense_orders FOR DELETE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can select expense_order_items"
  ON expense_order_items FOR SELECT
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can insert expense_order_items"
  ON expense_order_items FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home members can delete expense_order_items"
  ON expense_order_items FOR DELETE
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- Monthly summary view
CREATE OR REPLACE VIEW expense_monthly_platform_summary AS
SELECT
  home_id,
  platform,
  category,
  DATE_TRUNC('month', order_date)::DATE AS month,
  COUNT(*)                              AS order_count,
  SUM(order_total)                      AS total_spend
FROM expense_orders
GROUP BY home_id, platform, category, DATE_TRUNC('month', order_date);
