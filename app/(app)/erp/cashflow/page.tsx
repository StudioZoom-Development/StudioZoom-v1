import React, { Suspense } from 'react'
import { FinancialsHub } from '@/components/financials/FinancialsHub'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'

export const metadata = {
  title: 'Cashflow · Studio Zoom',
  description: 'Monthly income vs outflow, net position, and transaction drill-down',
}

export default function CashflowPage() {
  return (
    <Suspense fallback={<div style={{ padding: '24px' }}><LoadingSkeleton lines={6} /></div>}>
      <FinancialsHub initialTab="cashflow" />
    </Suspense>
  )
}
