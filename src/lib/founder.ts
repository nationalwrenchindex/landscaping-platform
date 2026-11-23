// Founder / platform-admin identity.
//
// Set FOUNDER_USER_ID to the auth.users id (UUID) of the founder's account in
// THIS Supabase project. It is server-only (no NEXT_PUBLIC_ prefix).
//
// Fails closed: when the variable is unset or empty, nobody is the founder, so
// /admin, /social, the admin APIs and the seed routes are unreachable and the
// founder subscription bypass grants nothing.

const FOUNDER_USER_ID = process.env.FOUNDER_USER_ID?.trim() || null

export function isFounder(userId: string | null | undefined): boolean {
  return FOUNDER_USER_ID !== null && !!userId && userId === FOUNDER_USER_ID
}
