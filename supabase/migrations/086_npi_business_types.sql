-- 086_npi_business_types.sql
--
-- National Pro Index (NPI): the trade is a property of the account.
--
-- WHAT IS WRONG. Migration 022 limits profiles.business_type to
-- ('mechanic', 'detailer'). There is no value for a home-services trade, so
-- every landscaper is stored as 'mechanic' and onboarding cannot save anything
-- else. Read live Nov 24, 2026 (GET only): 3 profiles, all 'mechanic'; 2 of them
-- hold a 'lawn_pro' subscription; the 3rd (the founder) has no subscription.
--
-- WHAT THIS DOES.
--   1. Replaces the business_type CHECK so it also allows the four NPI trades,
--      all at once: 'landscaping', 'hvac', 'plumbing', 'electrical'.
--      'mechanic' and 'detailer' stay allowed (existing rows, legacy code).
--   2. Moves every profile whose subscription tier is 'lawn_pro' from
--      'mechanic' to 'landscaping'. Expected: exactly 2 rows.
--      Profiles WITHOUT a lawn_pro subscription (the founder) are not touched.
--   3. Self-checks all of the above and RAISEs (rolling everything back) if
--      anything is off.
--
-- NOT CHANGED: the column default stays 'mechanic' (onboarding always writes an
-- explicit value). 'hd_tech' is still not allowed; the HD vertical is hidden.
--
-- DEPLOY ORDER: run this BEFORE deploying the onboarding change that writes
-- 'landscaping', or onboarding saves fail on the CHECK.
--
-- Idempotent: safe to re-run (the UPDATE then matches 0 rows; see step 3).
--
-- COMMIT-armed. To dry-run, change the final COMMIT to ROLLBACK.

BEGIN;

-- 0. Snapshot counts for the self-check.
CREATE TEMP TABLE _086_before ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.profiles)                                   AS total,
  (SELECT count(*) FROM public.profiles p
     WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s
                       WHERE s.user_id = p.id AND s.tier = 'lawn_pro'))    AS non_lawn,
  (SELECT count(*) FROM public.profiles p
     WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s
                       WHERE s.user_id = p.id AND s.tier = 'lawn_pro')
       AND p.business_type = 'mechanic')                                   AS non_lawn_mechanic,
  (SELECT count(*) FROM public.profiles p
     WHERE p.business_type = 'landscaping')                                AS already_landscaping;

-- 1. Replace the CHECK. Drop by the 022 name, and also any other CHECK on
--    profiles that mentions business_type (the live DB has drifted from the
--    repo before - see 075 / lawn_pro).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_business_type_check;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%business_type%'
  LOOP
    RAISE NOTICE '086: dropping extra business_type CHECK %', r.conname;
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_business_type_check
  CHECK (business_type IN (
    'mechanic', 'detailer',
    'landscaping', 'hvac', 'plumbing', 'electrical'
  ));

-- 2. Move the lawn_pro accounts to 'landscaping'.
UPDATE public.profiles p
SET    business_type = 'landscaping'
WHERE  p.business_type = 'mechanic'
  AND  EXISTS (SELECT 1 FROM public.subscriptions s
               WHERE s.user_id = p.id AND s.tier = 'lawn_pro');

-- 3. Self-check.
DO $$
DECLARE
  b            record;
  v_def        text;
  v_checks     int;
  v_total      int;
  v_non_lawn   int;
  v_non_lawn_m int;
  v_lawn_left  int;
  v_landscape  int;
  v_val        text;
BEGIN
  SELECT * INTO b FROM _086_before;

  -- Exactly one business_type CHECK, and it allows every value.
  SELECT count(*) INTO v_checks
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%business_type%';
  IF v_checks <> 1 THEN
    RAISE EXCEPTION '086 self-check: expected 1 business_type CHECK, found %', v_checks;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND conname = 'profiles_business_type_check';
  FOREACH v_val IN ARRAY ARRAY['mechanic','detailer','landscaping','hvac','plumbing','electrical'] LOOP
    IF position('''' || v_val || '''' IN v_def) = 0 THEN
      RAISE EXCEPTION '086 self-check: CHECK is missing %: %', v_val, v_def;
    END IF;
  END LOOP;

  -- No profile was added or removed.
  SELECT count(*) INTO v_total FROM public.profiles;
  IF v_total <> b.total THEN
    RAISE EXCEPTION '086 self-check: profile count moved from % to %', b.total, v_total;
  END IF;

  -- Profiles without a lawn_pro subscription (the founder) are untouched.
  SELECT count(*) INTO v_non_lawn
  FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s
                    WHERE s.user_id = p.id AND s.tier = 'lawn_pro');
  SELECT count(*) INTO v_non_lawn_m
  FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s
                    WHERE s.user_id = p.id AND s.tier = 'lawn_pro')
    AND p.business_type = 'mechanic';
  IF v_non_lawn <> b.non_lawn OR v_non_lawn_m <> b.non_lawn_mechanic THEN
    RAISE EXCEPTION '086 self-check: a non-lawn_pro profile changed (% -> %, mechanic % -> %)',
      b.non_lawn, v_non_lawn, b.non_lawn_mechanic, v_non_lawn_m;
  END IF;

  -- Every lawn_pro profile is now 'landscaping'.
  SELECT count(*) INTO v_lawn_left
  FROM public.profiles p
  WHERE EXISTS (SELECT 1 FROM public.subscriptions s
                WHERE s.user_id = p.id AND s.tier = 'lawn_pro')
    AND p.business_type <> 'landscaping';
  IF v_lawn_left <> 0 THEN
    RAISE EXCEPTION '086 self-check: % lawn_pro profile(s) are not landscaping', v_lawn_left;
  END IF;

  -- First run: exactly 2 moved (0 already landscaping -> 2). Re-run: unchanged.
  SELECT count(*) INTO v_landscape FROM public.profiles WHERE business_type = 'landscaping';
  IF b.already_landscaping = 0 AND v_landscape <> 2 THEN
    RAISE EXCEPTION '086 self-check: expected 2 landscaping profiles, found %', v_landscape;
  END IF;

  RAISE NOTICE '086 ok: % profiles, % landscaping, % untouched non-lawn_pro', v_total, v_landscape, v_non_lawn;
END $$;

COMMIT;
