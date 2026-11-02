'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Quotation } from '@/types'
import { getQuotationById } from '@/lib/firebase/queries/quotations'
import { QuotationBuilderForm } from '@/components/quotation/QuotationBuilderForm'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'

export default function EditQuotationPage() {
  const params = useParams()
  const router = useRouter()
  const quotationId = String(params?.id || '')
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!quotationId) return
    getQuotationById(quotationId).then((data) => {
      setQuotation(data)
      setLoading(false)
    })
  }, [quotationId])

  if (loading) {
    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 16px' }}>
        <LoadingSkeleton />
      </div>
    )
  }

  if (!quotation) {
    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-foreground-muted)', fontSize: 'var(--text-base)' }}>
          Quotation not found or was removed.
        </p>
        <button
          onClick={() => router.push('/erp/quotations')}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            borderRadius: '8px',
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Return to Quotations
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'var(--font-inter)',
      }}
    >
      <QuotationBuilderForm
        initialQuotation={quotation}
        initialQuotationNumber={quotation.quotationNumber}
        isEditMode={true}
      />
    </div>
  )
}
