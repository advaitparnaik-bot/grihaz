-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "homes_all" ON homes;
DROP POLICY IF EXISTS "home_members_all" ON home_members;
DROP POLICY IF EXISTS "Authenticated users can manage staff" ON staff;
DROP POLICY IF EXISTS "Authenticated users can manage attendance" ON attendance;
DROP POLICY IF EXISTS "Authenticated users can manage adhoc_entries" ON adhoc_entries;
DROP POLICY IF EXISTS "Authenticated users can manage staff_contracts" ON staff_contracts;
DROP POLICY IF EXISTS "Authenticated users can manage settlements" ON settlements;

-- HOMES: user must be a member of the home
CREATE POLICY "homes_select" ON homes FOR SELECT TO authenticated
  USING (id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "homes_insert" ON homes FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "homes_update" ON homes FOR UPDATE TO authenticated
  USING (id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "homes_delete" ON homes FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- HOME_MEMBERS: user can only see members of their own home
CREATE POLICY "home_members_select" ON home_members FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home_members_insert" ON home_members FOR INSERT TO authenticated
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home_members_update" ON home_members FOR UPDATE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "home_members_delete" ON home_members FOR DELETE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- STAFF
CREATE POLICY "staff_select" ON staff FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "staff_insert" ON staff FOR INSERT TO authenticated
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "staff_update" ON staff FOR UPDATE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "staff_delete" ON staff FOR DELETE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- ATTENDANCE
CREATE POLICY "attendance_select" ON attendance FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "attendance_insert" ON attendance FOR INSERT TO authenticated
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "attendance_update" ON attendance FOR UPDATE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "attendance_delete" ON attendance FOR DELETE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- ADHOC_ENTRIES
CREATE POLICY "adhoc_entries_select" ON adhoc_entries FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "adhoc_entries_insert" ON adhoc_entries FOR INSERT TO authenticated
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "adhoc_entries_update" ON adhoc_entries FOR UPDATE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "adhoc_entries_delete" ON adhoc_entries FOR DELETE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- STAFF_CONTRACTS
CREATE POLICY "staff_contracts_select" ON staff_contracts FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "staff_contracts_insert" ON staff_contracts FOR INSERT TO authenticated
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "staff_contracts_update" ON staff_contracts FOR UPDATE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "staff_contracts_delete" ON staff_contracts FOR DELETE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- SETTLEMENTS
CREATE POLICY "settlements_select" ON settlements FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "settlements_insert" ON settlements FOR INSERT TO authenticated
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "settlements_update" ON settlements FOR UPDATE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "settlements_delete" ON settlements FOR DELETE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

-- LAUNDRY_ENTRIES (add policies so it's no longer empty)
CREATE POLICY "laundry_entries_select" ON laundry_entries FOR SELECT TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "laundry_entries_insert" ON laundry_entries FOR INSERT TO authenticated
  WITH CHECK (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "laundry_entries_update" ON laundry_entries FOR UPDATE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));

CREATE POLICY "laundry_entries_delete" ON laundry_entries FOR DELETE TO authenticated
  USING (home_id IN (SELECT home_id FROM home_members WHERE user_id = auth.uid()));