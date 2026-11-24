// SERVER-ONLY — do not import from client components.
// Plan data (client-safe) lives in stripe-plans.ts.

import Stripe from 'stripe'
import { PLANS, type PlanTier } from '@/lib/stripe-plans'

export { PLANS, TIER_MODULES, MODULE_LABELS } from '@/lib/stripe-plans'
export type { PlanTier } from '@/lib/stripe-plans'

// Singleton — re-use across hot reloads in dev
const globalForStripe = globalThis as unknown as { stripe?: Stripe }

/**
 * Lazily constructs the Stripe client on first use, NOT at module load.
 * Constructing at import time made `next build` crash (while collecting page
 * data) on any machine without STRIPE_SECRET_KEY. A missing key now fails only
 * when a Stripe call is actually made, with a clear message.
 */
export function getStripe(): Stripe {
  if (globalForStripe.stripe) return globalForStripe.stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  const client = new Stripe(key)
  globalForStripe.stripe = client
  return client
}

/**
 * Back-compat handle for existing `import { stripe } from '@/lib/stripe'`
 * call sites. Every property access is forwarded to the lazily built client.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripe()
    const value = Reflect.get(client, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export function getPriceId(tier: PlanTier): string {
  const plan = PLANS.find(p => p.tier === tier)
  if (!plan) throw new Error(`Unknown tier: ${tier}`)
  const key = `STRIPE_PRICE_${plan.priceKey}`
  const id  = process.env[key]
  if (!id) throw new Error(`Missing env var: ${key}`)
  return id
}

export function getTierFromPriceId(priceId: string): PlanTier | null {
  for (const plan of PLANS) {
    const envKey = `STRIPE_PRICE_${plan.priceKey}`
    if (process.env[envKey] === priceId) return plan.tier
  }
  return null
}
