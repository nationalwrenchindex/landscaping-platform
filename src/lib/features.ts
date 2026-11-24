// Feature switches for things that live in this codebase but are not part of
// the National Pro Index (NPI) product today. Each one HIDES, it does not
// remove: the pages, API routes and components stay in the tree.

/**
 * Heavy-duty / reefer (HD) vertical.
 *
 * false = the hd.* subdomain is not special (no rewrite into /hd, no HD login /
 * home redirects). The path-based /hd/* login guard in middleware stays on, so
 * HD pages still require a signed-in user if someone reaches them by URL.
 * The onboarding HD card is separately hidden (onboarding/page.tsx, Part 5).
 */
export const HD_SUBDOMAIN_ENABLED = false

/**
 * QuickWrench (NWI's vehicle diagnostic tool; no NPI name decided).
 * false = no QuickWrench card on the dashboard and no QuickWrench standalone
 * plan on signup or billing. /quickwrench still exists by URL. The internal
 * 'quickwrench' MODULE is untouched: Field Assist access is still keyed on it.
 */
export const QUICKWRENCH_ENABLED = false

/**
 * Social tool (lib/social/generate.ts writes National Wrench Index marketing).
 * false = no dashboard tile, and the daily /api/cron/social-generate run does
 * nothing. /social still exists by URL (founder only). Prompts untouched.
 */
export const SOCIAL_ENABLED = false

/**
 * Dashboard "Service alerts" card. It is built from VEHICLE service history;
 * landscaping has no vehicle alerts. false = card hidden and its query skipped.
 */
export const DASHBOARD_VEHICLE_ALERTS_ENABLED = false

/**
 * Field Assist "+ Add to Quote". The only quote form is the old mechanic one
 * (/financials?tab=quotes, asks for a VIN). false = button hidden.
 */
export const FIELD_ASSIST_ADD_TO_QUOTE = false
