'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Invoice } from '@/types'
import { getInvoiceById } from '@/lib/firebase/queries/invoices'
import { InvoiceBuilderForm } from '@/components/invoice/InvoiceBuilderForm'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'

export default function EditInvoicePage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = String(params?.id || '')
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    if (!invoiceId) return
    getInvoiceById(invoiceId).then((data) => {
      setInvoice(data)
      setLoading(false)
    })
  }, [invoiceId])

  if (loading) {
    return (
      <div style={{ width: '100%' }}>
        <LoadingSkeleton />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div style={{ width: '100%', padding: '32px 0', textAlign: 'center', fontFamily: 'var(--font-inter)' }}>
        <p style={{ color: 'var(--color-foreground-muted)', fontSize: 'var(--text-base)' }}>
          Invoice not found or was removed.
        </p>
        <button
          type="button"
          onClick={() => router.push('/erp/invoices')}
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
          Return to Invoices
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        fontFamily: 'var(--font-inter)',
      }}
    >
      <InvoiceBuilderForm initialInvoice={invoice} />
    </div>
  )
}

