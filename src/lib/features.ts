// Feature switches for verticals that live in this codebase but are not part of
// the National Pro Index product today.

/**
 * Heavy-duty / reefer (HD) vertical. HIDDEN, not removed: every /hd page, API
 * route and component is still in the tree.
 *
 * false = the hd.* subdomain is not special (no rewrite into /hd, no HD login /
 * home redirects). The path-based /hd/* login guard in middleware stays on, so
 * HD pages still require a signed-in user if someone reaches them by URL.
 * The onboarding HD card is separately hidden (onboarding/page.tsx, Part 5).
 */
export const HD_SUBDOMAIN_ENABLED = false
