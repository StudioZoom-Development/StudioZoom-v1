'use client'

import { useEffect, useState } from 'react'
import { QuotationBuilderForm } from '@/components/quotation/QuotationBuilderForm'
import { getNextQuotationNumber } from '@/lib/firebase/queries/quotations'

export default function NewQuotationPage() {
  const [quotationNumber, setQuotationNumber] = useState<string>('ZS-Q-2026-001')

  useEffect(() => {
    let isMounted = true
    getNextQuotationNumber().then((num) => {
      if (isMounted && num) {
        setQuotationNumber(num)
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

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
        initialQuotationNumber={quotationNumber}
        isEditMode={false}
      />
    </div>
  )
}
