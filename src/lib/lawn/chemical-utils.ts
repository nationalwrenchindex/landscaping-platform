// Shared helpers for the chemical & fertilizer application log API routes.

export const CHEMICAL_SELECT = `
  id, user_id, job_id, property_id, customer_id, product_name, manufacturer,
  epa_registration_number, application_date, application_time, target_area,
  area_treated_sqft, rate_per_1000sqft, total_amount_applied, unit,
  application_method, wind_speed_mph, temperature_f, reentry_interval_hours,
  is_organic, notes, created_at, updated_at,
  property:properties(id, name, address),
  customer:customers(id, full_name)
`

export const VALID_UNITS   = ['oz', 'lb', 'gal', 'qt']
export const VALID_METHODS = ['spray', 'granular', 'liquid', 'other']

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Cleans a client-supplied chemical-log body into a DB row. Returns an error
 *  string when a required or malformed field is present. */
export function buildChemicalRow(
  body: Record<string, unknown>,
  userId: string,
): { row?: Record<string, unknown>; error?: string } {
  const productName = typeof body.product_name === 'string' ? body.product_name.trim() : ''
  if (!productName) return { error: 'A product name is required.' }

  const applicationDate = typeof body.application_date === 'string' ? body.application_date : ''
  if (!applicationDate)               return { error: 'An application date is required.' }
  if (!DATE_RE.test(applicationDate)) return { error: 'Application date must be a valid date.' }

  const unit = body.unit ? String(body.unit) : null
  if (unit && !VALID_UNITS.includes(unit)) {
    return { error: 'Unit must be one of oz, lb, gal or qt.' }
  }

  const method = body.application_method ? String(body.application_method) : null
  if (method && !VALID_METHODS.includes(method)) {
    return { error: 'Application method must be spray, granular, liquid or other.' }
  }

  const str = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s === '' ? null : s
  }
  const num = (v: unknown) => {
    if (v === '' || v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const int = (v: unknown) => {
    const n = num(v)
    return n == null ? null : Math.round(n)
  }

  return {
    row: {
      user_id:                 userId,
      job_id:                  str(body.job_id),
      property_id:             str(body.property_id),
      customer_id:             str(body.customer_id),
      product_name:            productName,
      manufacturer:            str(body.manufacturer),
      epa_registration_number: str(body.epa_registration_number),
      application_date:        applicationDate,
      application_time:        str(body.application_time),
      target_area:             str(body.target_area),
      area_treated_sqft:       int(body.area_treated_sqft),
      rate_per_1000sqft:       num(body.rate_per_1000sqft),
      total_amount_applied:    num(body.total_amount_applied),
      unit,
      application_method:      method,
      wind_speed_mph:          num(body.wind_speed_mph),
      temperature_f:           num(body.temperature_f),
      reentry_interval_hours:  num(body.reentry_interval_hours),
      is_organic:              body.is_organic === true || body.is_organic === 'true',
      notes:                   str(body.notes),
    },
  }
}
