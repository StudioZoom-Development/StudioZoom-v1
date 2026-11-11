'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { InvoiceBuilderForm } from '@/components/invoice/InvoiceBuilderForm'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'

function NewInvoiceContent() {
  const searchParams = useSearchParams()
  const initialClientId = searchParams.get('clientId') || undefined

  return <InvoiceBuilderForm initialClientId={initialClientId} />
}

export default function NewInvoicePage() {
  return (
    <div
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'var(--font-inter)',
      }}
    >
      <Suspense fallback={<LoadingSkeleton />}>
        <NewInvoiceContent />
      </Suspense>
    </div>
  )
}
