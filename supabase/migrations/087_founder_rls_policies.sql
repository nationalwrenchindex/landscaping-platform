-- 087_founder_rls_policies.sql
--
-- WHAT IS WRONG. Migrations 038 and 039 hardcode a founder UUID
-- (4a8c046f-7db3-42bb-8422-fd47efb7678c) into two RLS policies:
--   "foreman_waitlist admin only"      ON public.foreman_waitlist      (038)
--   "foreman_grace_period admin only"  ON public.foreman_grace_period  (039)
-- That UUID is the NWI founder account. It does not exist in this Supabase
-- project, so through RLS nobody can read or write those tables. (The service
-- role bypasses RLS, so the crons are unaffected either way.)
-- The app code now reads the founder from the FOUNDER_USER_ID env var
-- (src/lib/founder.ts). This points the two policies at that SAME value.
--
-- BEFORE RUNNING: replace PASTE-FOUNDER-USER-ID-HERE below (one place) with
-- the founder's auth.users id in THIS project - the exact value you set as
-- FOUNDER_USER_ID in Vercel. If the placeholder is left in, or the id is not a
-- real user here, the migration RAISEs and nothing changes.
--
-- WHAT THIS DOES. Drops and recreates both policies with the same shape as
-- 038/039 (FOR ALL USING auth.uid() = <founder>), then self-checks: both
-- policies exist, both name the new id, and NO policy anywhere still names the
-- old NWI UUID.
--
-- Idempotent: safe to re-run with the same id.
--
-- COMMIT-armed. To dry-run, change the final COMMIT to ROLLBACK.

BEGIN;

CREATE TEMP TABLE _087_input ON COMMIT DROP AS
SELECT 'PASTE-FOUNDER-USER-ID-HERE'::text AS founder_id;

DO $$
DECLARE
  v_raw   text;
  v_id    uuid;
  v_users int;
BEGIN
  SELECT trim(founder_id) INTO v_raw FROM _087_input;

  IF v_raw IS NULL OR v_raw = 'PASTE-FOUNDER-USER-ID-HERE' THEN
    RAISE EXCEPTION '087: replace PASTE-FOUNDER-USER-ID-HERE with the founder auth.users id (same value as FOUNDER_USER_ID)';
  END IF;

  IF v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION '087: % is not a UUID', v_raw;
  END IF;
  v_id := v_raw::uuid;

  IF v_id = '4a8c046f-7db3-42bb-8422-fd47efb7678c'::uuid THEN
    RAISE EXCEPTION '087: that is the old NWI founder UUID; use the founder id from THIS project';
  END IF;

  SELECT count(*) INTO v_users FROM auth.users WHERE id = v_id;
  IF v_users <> 1 THEN
    RAISE EXCEPTION '087: no auth.users row with id % in this project', v_id;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "foreman_waitlist admin only" ON public.foreman_waitlist';
  EXECUTE format(
    'CREATE POLICY "foreman_waitlist admin only" ON public.foreman_waitlist '
    'FOR ALL USING (auth.uid() = %L::uuid)', v_id);

  EXECUTE 'DROP POLICY IF EXISTS "foreman_grace_period admin only" ON public.foreman_grace_period';
  EXECUTE format(
    'CREATE POLICY "foreman_grace_period admin only" ON public.foreman_grace_period '
    'FOR ALL USING (auth.uid() = %L::uuid)', v_id);

  RAISE NOTICE '087: both policies now point at %', v_id;
END $$;

-- Self-check.
DO $$
DECLARE
  v_id    uuid;
  v_found int;
  v_old   int;
  r       record;
BEGIN
  SELECT trim(founder_id)::uuid INTO v_id FROM _087_input;

  SELECT count(*) INTO v_found
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (tablename = 'foreman_waitlist'     AND policyname = 'foreman_waitlist admin only') OR
      (tablename = 'foreman_grace_period' AND policyname = 'foreman_grace_period admin only')
    )
    AND cmd = 'ALL'
    AND qual LIKE '%' || v_id::text || '%';
  IF v_found <> 2 THEN
    RAISE EXCEPTION '087 self-check: expected 2 founder policies naming %, found %', v_id, v_found;
  END IF;

  SELECT count(*) INTO v_old
  FROM pg_policies
  WHERE coalesce(qual, '') || ' ' || coalesce(with_check, '') LIKE '%4a8c046f-7db3-42bb-8422-fd47efb7678c%';
  IF v_old > 0 THEN
    FOR r IN
      SELECT schemaname, tablename, policyname
      FROM pg_policies
      WHERE coalesce(qual, '') || ' ' || coalesce(with_check, '') LIKE '%4a8c046f-7db3-42bb-8422-fd47efb7678c%'
    LOOP
      RAISE NOTICE '087 still names the old UUID: %.% | %', r.schemaname, r.tablename, r.policyname;
    END LOOP;
    RAISE EXCEPTION '087 self-check: % policy(ies) still name the old NWI founder UUID; see NOTICE lines', v_old;
  END IF;

  RAISE NOTICE '087 ok: 2 founder policies point at %, 0 policies name the old UUID', v_id;
END $$;

COMMIT;
