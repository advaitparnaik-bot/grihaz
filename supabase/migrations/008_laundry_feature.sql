-- Migration: laundry_feature
-- Add laundry_rate_card and laundry_transactions tables

CREATE TABLE laundry_rate_card (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  service TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(home_id, category, service)
);

CREATE TABLE laundry_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE laundry_transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES laundry_transactions(id) ON DELETE CASCADE,
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  service TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity_given INTEGER NOT NULL DEFAULT 1,
  quantity_returned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE laundry_rate_card ENABLE ROW LEVEL SECURITY;
ALTER TABLE laundry_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE laundry_transaction_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home members can manage rate card"
ON laundry_rate_card
FOR ALL
USING (
  home_id IN (
    SELECT home_id FROM home_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "home members can manage laundry transactions"
ON laundry_transactions
FOR ALL
USING (
  home_id IN (
    SELECT home_id FROM home_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "home members can manage laundry transaction items"
ON laundry_transaction_items
FOR ALL
USING (
  home_id IN (
    SELECT home_id FROM home_members WHERE user_id = auth.uid()
  )
);