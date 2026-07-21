import type { RecurringFrequency, InvoiceLineItem } from '@/types/lawn'

// How many times per year each cadence fires — used to normalize a recurring
// template's value to monthly recurring revenue.
const OCCURRENCES_PER_YEAR: Record<RecurringFrequency, number> = {
  weekly:     52,
  biweekly:   26,
  monthly:    12,
  quarterly:  4,
  semiannual: 2,
  annual:     1,
}

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly:     'Weekly',
  biweekly:   'Every 2 weeks',
  monthly:    'Monthly',
  quarterly:  'Quarterly',
  semiannual: 'Every 6 months',
  annual:     'Annually',
}

export const DAY_OF_WEEK_LABELS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Sum of a template's line items plus tax. */
export function templateTotal(
  lineItems: InvoiceLineItem[],
  taxPercent: number,
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal  = round2(lineItems.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0))
  const taxAmount = round2(subtotal * ((Number(taxPercent) || 0) / 100))
  return { subtotal, taxAmount, total: round2(subtotal + taxAmount) }
}

/** A single template's contribution to monthly recurring revenue. */
export function monthlyValue(
  lineItems: InvoiceLineItem[],
  taxPercent: number,
  frequency: RecurringFrequency,
): number {
  const { total } = templateTotal(lineItems, taxPercent)
  return round2((total * OCCURRENCES_PER_YEAR[frequency]) / 12)
}

// ─── Date math ────────────────────────────────────────────────────────────────

function toDate(iso: string): Date {
  // Noon UTC keeps the calendar day stable across timezone offsets.
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`)
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Clamp a target day-of-month to the last valid day of that month. */
function withDayOfMonth(d: Date, day: number): Date {
  const out       = new Date(d)
  const lastDay   = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  out.setUTCDate(Math.min(day, lastDay))
  return out
}

/**
 * The next date a template should generate an invoice, strictly after `from`.
 * Weekly/biweekly honor day_of_week; the monthly-and-longer cadences honor
 * day_of_month (clamped to the month's length).
 */
export function computeNextInvoiceDate(
  from: string,
  frequency: RecurringFrequency,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
): string {
  const base = toDate(from)

  if (frequency === 'weekly' || frequency === 'biweekly') {
    const step = frequency === 'weekly' ? 7 : 14
    const next = new Date(base)
    next.setUTCDate(next.getUTCDate() + step)
    if (dayOfWeek !== null && dayOfWeek !== undefined) {
      const diff = (dayOfWeek - next.getUTCDay() + 7) % 7
      next.setUTCDate(next.getUTCDate() + diff)
    }
    return toISO(next)
  }

  const monthStep: Record<string, number> = {
    monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
  }
  const step = monthStep[frequency] ?? 1
  const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + step, 1, 12))
  return toISO(withDayOfMonth(next, dayOfMonth ?? base.getUTCDate()))
}

/**
 * The first invoice date for a brand-new template — the earliest date on or
 * after start_date that matches the configured day.
 */
export function computeFirstInvoiceDate(
  startDate: string,
  frequency: RecurringFrequency,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
): string {
  const start = toDate(startDate)

  if (frequency === 'weekly' || frequency === 'biweekly') {
    if (dayOfWeek === null || dayOfWeek === undefined) return toISO(start)
    const diff = (dayOfWeek - start.getUTCDay() + 7) % 7
    const next = new Date(start)
    next.setUTCDate(next.getUTCDate() + diff)
    return toISO(next)
  }

  if (dayOfMonth === null || dayOfMonth === undefined) return toISO(start)
  const candidate = withDayOfMonth(start, dayOfMonth)
  if (candidate >= start) return toISO(candidate)
  const monthStep: Record<string, number> = {
    monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
  }
  const step = monthStep[frequency] ?? 1
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + step, 1, 12))
  return toISO(withDayOfMonth(next, dayOfMonth))
}
