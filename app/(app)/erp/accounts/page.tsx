import React, { Suspense } from 'react'
import { FinancialsHub } from '@/components/financials/FinancialsHub'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'

export const metadata = {
  title: 'Accounts & Budgets · Studio Zoom',
  description: 'Budget vs actuals, category spending limits, and outstanding client balances',
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '24px' }}><LoadingSkeleton lines={6} /></div>}>
      <FinancialsHub initialTab="accounts" />
    </Suspense>
  )
}
