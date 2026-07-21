// Shared types for the landscaping core-operations modules:
// customers & properties, scheduling, invoicing, recurring invoices.

export interface Customer {
  id:         string
  user_id:    string
  full_name:  string | null
  email:      string | null
  phone:      string | null
  address:    string | null
  city:       string | null
  state:      string | null
  zip:        string | null
  notes:      string | null
  created_at: string
  updated_at: string
  properties?: Property[]
}

export interface Property {
  id:              string
  customer_id:     string
  user_id:         string
  name:            string | null
  address:         string | null
  city:            string | null
  state:           string | null
  zip:             string | null
  square_footage:  number | null
  lot_size_acres:  number | null
  gate_code:       string | null
  dog_on_property: boolean
  property_notes:  string | null
  lat:             number | null
  lng:             number | null
  created_at:      string
  updated_at:      string
  customer?:       Pick<Customer, 'id' | 'full_name' | 'phone' | 'email'> | null
}

export type LawnJobStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export interface JobService {
  id?:          string
  job_id?:      string
  service_name: string
  quantity:     number
  unit_price:   number
  total:        number
}

export interface LawnJob {
  id:               string
  user_id:          string
  customer_id:      string | null
  property_id:      string | null
  title:            string | null
  description:      string | null
  status:           LawnJobStatus
  scheduled_date:   string
  scheduled_time:   string | null
  duration_minutes: number | null
  crew_notes:       string | null
  completion_notes: string | null
  completed_at:     string | null
  created_at:       string
  updated_at:       string
  customer?:        Pick<Customer, 'id' | 'full_name' | 'phone' | 'email'> | null
  property?:        Pick<Property, 'id' | 'name' | 'address' | 'gate_code' | 'dog_on_property'> | null
  services?:        JobService[]
}

export type LawnInvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

export interface InvoiceLineItem {
  id?:         string
  invoice_id?: string
  description: string
  quantity:    number
  unit_price:  number
  total:       number
  position?:   number
}

export interface LawnInvoice {
  id:             string
  user_id:        string
  customer_id:    string | null
  property_id:    string | null
  job_id:         string | null
  invoice_number: string
  invoice_seq:    number | null
  status:         LawnInvoiceStatus
  subtotal:       number
  tax_percent:    number | null
  tax_amount:     number | null
  total:          number
  notes:          string | null
  due_date:       string | null
  paid_at:        string | null
  sent_at:        string | null
  invoice_date:   string
  created_at:     string
  updated_at:     string
  recurring_invoice_id: string | null
  customer?:      Pick<Customer, 'id' | 'full_name' | 'phone' | 'email' | 'address' | 'city' | 'state' | 'zip'> | null
  property?:      Pick<Property, 'id' | 'name' | 'address'> | null
  items?:         InvoiceLineItem[]
}

export type RecurringFrequency =
  | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual'

export interface RecurringInvoice {
  id:                string
  user_id:           string
  customer_id:       string
  property_id:       string | null
  title:             string
  frequency:         RecurringFrequency
  day_of_week:       number | null
  day_of_month:      number | null
  start_date:        string
  end_date:          string | null
  next_invoice_date: string
  auto_send:         boolean
  line_items:        InvoiceLineItem[]
  tax_percent:       number
  notes:             string | null
  active:            boolean
  created_at:        string
  updated_at:        string
  customer?:         Pick<Customer, 'id' | 'full_name' | 'email'> | null
  property?:         Pick<Property, 'id' | 'name' | 'address'> | null
}
