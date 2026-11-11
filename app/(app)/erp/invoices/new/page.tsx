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
        width: '100%',
        fontFamily: 'var(--font-inter)',
      }}
    >
      <Suspense fallback={<LoadingSkeleton />}>
        <NewInvoiceContent />
      </Suspense>
    </div>
  )
}

