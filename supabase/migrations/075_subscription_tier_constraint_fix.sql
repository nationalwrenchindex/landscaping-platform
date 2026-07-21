-- ============================================================
-- Migration: 075_subscription_tier_constraint_fix.sql
--
-- Fixes silent subscription-write failures that paywall paying users.
--
-- The subscriptions.tier CHECK constraint was last set in 018 to
--   ('starter','pro','full_suite','quickwrench','elite')
-- but the app has since sold and written several tiers that this
-- constraint rejects:
--   - full_suite_plus   (stripe-plans.ts, the "RECOMMENDED" $99 plan)
--   - foreman_standalone (stripe-plans.ts, $59 plan)
--   - hd_reefer / hd_starter / hd_pro / hd_elite (HD Suite; comp-account
--     route + hd-access.ts read/write these)
-- upsertSubscription() only console.errors on a failed write, so a
-- purchase of any of these tiers violates the CHECK, the row is never
-- stored active, and getModuleAccess() returns [] -> the user is sent to
-- /billing even though Stripe shows them active.
--
-- This migration re-states the constraint with every tier the code
-- actually uses. Widening a CHECK only ever ADMITS more values; it can
-- never reject a row that previously passed, so no existing subscription
-- check changes behavior.
--
-- The status CHECK is likewise widened: customer.subscription.updated
-- writes Stripe's raw status, which can be 'paused' or 'incomplete_expired'
-- -- neither allowed by the 004 constraint, so those updates also failed
-- silently.
-- ============================================================

-- ── tier ────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_tier_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_tier_check
  CHECK (tier IN (
    -- Light duty (original suite + add-ons)
    'starter', 'pro', 'full_suite', 'full_suite_plus', 'quickwrench', 'elite',
    'foreman_standalone',
    -- Heavy duty (HD Suite)
    'hd_reefer', 'hd_starter', 'hd_pro', 'hd_elite'
  ));

-- ── status ──────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN (
    'active', 'trialing', 'past_due', 'canceled',
    'incomplete', 'incomplete_expired', 'unpaid', 'paused', 'inactive'
  ));

-- ============================================================
-- END OF MIGRATION
-- ============================================================
