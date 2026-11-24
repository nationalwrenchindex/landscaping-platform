-- 088_torquewrench_invoice_link.sql
--
-- WHY. Review texts must be EXACTLY ONE per paid job/invoice. TorqueWrench
-- queues a review per JOB (torquewrench_reviews.job_id), but invoices made on
-- the new /invoices screen have no job attached. To let the new invoice flow
-- queue a TorqueWrench review, and still guarantee it can never queue twice,
-- each TorqueWrench review needs to know which invoice it came from.
--
-- WHAT THIS DOES.
--   1. Adds torquewrench_reviews.invoice_id (nullable FK to invoices,
--      ON DELETE SET NULL - same pattern as review_requests.invoice_id).
--   2. Adds two partial UNIQUE indexes, so the database itself refuses a
--      second TorqueWrench review for the same invoice or the same job:
--        uq_torquewrench_reviews_invoice  (invoice_id) WHERE invoice_id IS NOT NULL
--        uq_torquewrench_reviews_job      (job_id)     WHERE job_id     IS NOT NULL
--      The app already checks both before inserting; the indexes close the
--      race where two requests insert at the same moment.
--   3. Self-checks the column and both indexes exist.
--
-- If existing rows already hold two reviews for the same job, step 2 would
-- fail; the pre-check RAISEs first with the count and nothing changes.
--
-- Deploy order: run this BEFORE deploying the code that writes invoice_id.
-- Without it, the TorqueWrench insert fails (logged, never thrown) and no
-- review is queued.
--
-- Idempotent: safe to re-run.
--
-- COMMIT-armed. To dry-run, change the final COMMIT to ROLLBACK.

BEGIN;

-- Pre-check: no job already has two TorqueWrench reviews.
DO $$
DECLARE
  v_dupes int;
BEGIN
  SELECT count(*) INTO v_dupes
  FROM (
    SELECT job_id
    FROM public.torquewrench_reviews
    WHERE job_id IS NOT NULL
    GROUP BY job_id
    HAVING count(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION '088: % job(s) already have more than one torquewrench_reviews row; resolve them before adding the unique index', v_dupes;
  END IF;
END $$;

ALTER TABLE public.torquewrench_reviews
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_torquewrench_reviews_invoice
  ON public.torquewrench_reviews(invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_torquewrench_reviews_job
  ON public.torquewrench_reviews(job_id)
  WHERE job_id IS NOT NULL;

-- Self-check.
DO $$
DECLARE
  v_col int;
  v_idx int;
BEGIN
  SELECT count(*) INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'torquewrench_reviews'
    AND column_name  = 'invoice_id'
    AND data_type    = 'uuid';
  IF v_col <> 1 THEN
    RAISE EXCEPTION '088 self-check: torquewrench_reviews.invoice_id (uuid) missing';
  END IF;

  SELECT count(*) INTO v_idx
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename  = 'torquewrench_reviews'
    AND indexname IN ('uq_torquewrench_reviews_invoice', 'uq_torquewrench_reviews_job')
    AND indexdef ILIKE 'CREATE UNIQUE INDEX%';
  IF v_idx <> 2 THEN
    RAISE EXCEPTION '088 self-check: expected 2 unique indexes on torquewrench_reviews, found %', v_idx;
  END IF;

  RAISE NOTICE '088 ok: invoice_id column and 2 unique indexes present';
END $$;

COMMIT;
