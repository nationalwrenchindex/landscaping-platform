# LawnPlatform (working name: `lawn-platform-dev`)

Business-management platform for independent mobile landscapers — jobs, customers,
quotes, invoices, a public booking page, an AI phone receptionist (Foreman), review
automation (TorqueWrench), and **Field Assist** (AI plant/lawn/pest diagnosis + quick
estimates).

Ported from the NWI Suite LD codebase into a **fully standalone repo**. The name
`LawnPlatform` / `LP` is temporary and will change when the brand is confirmed.

> Powered by National Wrench Index LLC.

## Stack

- Next.js 15 (App Router) · React 19 · TypeScript · Tailwind
- Supabase (Postgres + Auth + Storage) — **its own dedicated project, separate from NWI**
- Stripe · Twilio · Resend · Google Gemini (Field Assist) · Anthropic

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in the values below
npm run dev
```

## Environment variables

Set these in `.env.local` (local) and in the Vercel project:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | New landscaping Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | New Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | New Supabase service-role key |
| `GEMINI_API_KEY` *(or `GOOGLE_GEMINI_API_KEY`)* | Field Assist AI |
| `ANTHROPIC_API_KEY` | AI formatting helpers |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | SMS |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Billing |
| `RESEND_API_KEY` | Transactional email |

## Database

Migrations live in `supabase/migrations/`. The landscaping-specific tables are in
`073_landscaping_tables.sql` (chemical logs, property photos, seasonal log + a
`property-photos` storage bucket). Apply migrations against the **new** Supabase
project only.

## Follow-ups before production

- Point `next.config.ts` image `hostname` at the new Supabase project URL.
- Update the Sentry `org`/`project` in `next.config.ts` (currently NWI's) or remove Sentry.
- Finalize brand name, logo, and replace the temporary `LP` wordmark.
