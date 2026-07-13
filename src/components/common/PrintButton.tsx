'use client'

// Triggers the browser print dialog. Used on the printable chemical record.
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-lg bg-orange hover:bg-orange-hover text-white font-condensed font-semibold px-4 py-2 text-sm"
    >
      🖨️ Print / Save PDF
    </button>
  )
}
