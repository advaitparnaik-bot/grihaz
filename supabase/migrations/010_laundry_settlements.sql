CREATE TABLE laundry_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id uuid REFERENCES homes(id) ON DELETE CASCADE NOT NULL,
  month date NOT NULL,
  amount_paid numeric NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  paid_by uuid REFERENCES auth.users(id),
  payment_mode text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE laundry_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home members can manage laundry settlements"
ON laundry_settlements
FOR ALL
USING (
  home_id IN (
    SELECT home_id FROM home_members WHERE user_id = auth.uid()
  )
);