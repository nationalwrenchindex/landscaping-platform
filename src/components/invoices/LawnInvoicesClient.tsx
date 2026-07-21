'use client'

import { useState } from 'react'
import InvoiceListTab from './InvoiceListTab'
import RecurringTab   from './RecurringTab'

type Tab = 'invoices' | 'recurring'

export default function LawnInvoicesClient() {
  const [activeTab, setActiveTab] = useState<Tab>('invoices')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'invoices',  label: 'Invoices'  },
    { id: 'recurring', label: 'Recurring' },
  ]

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-dark-border mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
              border-b-2 -mb-px transition-colors
              ${activeTab === tab.id
                ? 'border-orange text-orange'
                : 'border-transparent text-white/40 hover:text-white'}
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'invoices'  && <InvoiceListTab />}
      {activeTab === 'recurring' && <RecurringTab />}
    </div>
  )
}
