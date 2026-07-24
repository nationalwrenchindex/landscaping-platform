-- 083_booking_job_status.sql
-- Public booking requests land as 'pending' jobs so the landscaper can confirm
-- them before they become part of the committed route. Extend the existing
-- job_status enum with the new value (additive, safe for existing rows).

alter type public.job_status add value if not exists 'pending';
