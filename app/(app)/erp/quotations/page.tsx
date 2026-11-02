'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Quotation, QuotationStatus } from '@/types'
import {
  subscribeToQuotations,
  deleteQuotation,
} from '@/lib/firebase/queries/quotations'
import { formatIndianCurrency } from '@/lib/payroll/calculator'
import { generateQuotationPdf } from '@/lib/quotation/pdfGenerator'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { format } from 'date-fns'

const STATUS_OPTIONS: Array<{ key: QuotationStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All Quotes' },
  { key: 'draft', label: 'Drafts' },
  { key: 'sent', label: 'Sent' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'converted', label: 'Converted' },
]

export default function QuotationsPage() {
  const router = useRouter()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals & Action States
  const [deleteTarget, setDeleteTarget] = useState<Quotation | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null)

  // Real-time Firestore subscription
  useEffect(() => {
    const unsub = subscribeToQuotations(
      {
        status: statusFilter,
        search: searchQuery,
      },
      (data) => {
        setQuotations(data)
        setLoading(false)
      }
    )

    return () => unsub()
  }, [statusFilter, searchQuery])

  // KPI Calculations
  const stats = useMemo(() => {
    const total = quotations.length
    const sentCount = quotations.filter((q) => q.status === 'sent').length
    const acceptedCount = quotations.filter((q) => q.status === 'accepted').length
    const totalPipelineValue = quotations.reduce((acc, q) => acc + (q.grandTotal || 0), 0)

    return { total, sentCount, acceptedCount, totalPipelineValue }
  }, [quotations])

  // PDF Preview & Download
  const handleDownloadPdf = async (q: Quotation) => {
    try {
      setGeneratingPdfId(q.quotationId)
      const pdfBytes = await generateQuotationPdf(q)
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Quotation_${q.quotationNumber}_${q.clientName.replace(/\s+/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 20000)
    } catch (err) {
      console.error('[Download PDF error]:', err)
    } finally {
      setGeneratingPdfId(null)
    }
  }

  const handlePreviewPdf = async (q: Quotation) => {
    try {
      setGeneratingPdfId(q.quotationId)
      const pdfBytes = await generateQuotationPdf(q)
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (err) {
      console.error('[Preview PDF error]:', err)
    } finally {
      setGeneratingPdfId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      setIsDeleting(true)
      await deleteQuotation(deleteTarget.quotationId)
      setDeleteTarget(null)
    } catch (err) {
      console.error('[Delete error]:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'var(--font-inter)',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* HEADER SECTION */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
            Quotations & Estimations
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', margin: '4px 0 0 0' }}>
            Build, brand, customize GST, and dispatch production & wedding quotations in INR.
          </p>
        </div>

        <Button
          onClick={() => router.push('/erp/quotations/new')}
          style={{
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="ti ti-plus" />
          <span>New Quotation</span>
        </Button>
      </div>

      {/* KPI METRIC CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
            TOTAL QUOTATIONS
          </span>
          <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-foreground)' }}>
            {stats.total}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
            All active quotation records
          </span>
        </div>

        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
            SENT TO CLIENTS
          </span>
          <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-accent)' }}>
            {stats.sentCount}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
            Awaiting client sign-off
          </span>
        </div>

        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
            ACCEPTED / CONVERTED
          </span>
          <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-success)' }}>
            {stats.acceptedCount}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
            Won client estimates
          </span>
        </div>

        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
            PIPELINE ESTIMATION
          </span>
          <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-primary)' }}>
            {formatIndianCurrency(stats.totalPipelineValue)}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
            Gross quotation value
          </span>
        </div>
      </div>

      {/* FILTER & SEARCH STRIP */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '12px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map((opt) => {
            const active = statusFilter === opt.key
            return (
              <button
                key={opt.key}
                onClick={() => setStatusFilter(opt.key)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: `0.5px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  backgroundColor: active ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                  color: active ? 'var(--color-primary)' : 'var(--color-foreground)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <div style={{ width: '260px' }}>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search client, quote #, event..."
            style={{ height: '36px', fontSize: 'var(--text-xs)' }}
          />
        </div>
      </div>

      {/* DATA TABLE (DESKTOP) & COMPACT CARDS (MOBILE) */}
      {loading ? (
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <TableRowSkeleton rows={5} cols={8} />
            </tbody>
          </table>
        </div>
      ) : quotations.length === 0 ? (
        <EmptyState
          icon="ti-file-invoice"
          title="No Quotations Found"
          description="Create your first event or media production quotation with custom templates and GST."
          action={{
            label: 'Create Quotation',
            onClick: () => router.push('/erp/quotations/new'),
          }}
        />
      ) : (
        <>
          {/* DESKTOP TABLE */}
          <div
            className="hidden md:block"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th style={TH_STYLE}>Quote #</th>
                  <th style={TH_STYLE}>Client / Event</th>
                  <th style={TH_STYLE}>Template Style</th>
                  <th style={TH_STYLE}>Event Date</th>
                  <th style={TH_STYLE}>Valid Until</th>
                  <th style={TH_STYLE}>Amount</th>
                  <th style={TH_STYLE}>Status</th>
                  <th style={{ ...TH_STYLE, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((q) => {
                  const isGen = generatingPdfId === q.quotationId
                  return (
                    <tr
                      key={q.quotationId}
                      style={{
                        borderBottom: '0.5px solid var(--color-border)',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={TD_STYLE}>
                        <span style={{ fontWeight: 700, color: 'var(--color-foreground)' }}>
                          {q.quotationNumber}
                        </span>
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-foreground-muted)' }}>
                          {format(q.createdAt, 'dd MMM yyyy')}
                        </div>
                      </td>

                      <td style={TD_STYLE}>
                        <div style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                          {q.clientName}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-foreground-muted)' }}>
                          {q.eventType} {q.place ? `• ${q.place}` : ''}
                        </div>
                      </td>

                      <td style={TD_STYLE}>
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            fontWeight: 500,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--color-surface-raised)',
                            border: '0.5px solid var(--color-border)',
                            textTransform: 'capitalize',
                          }}
                        >
                          {q.templateId || 'production'}
                        </span>
                      </td>

                      <td style={TD_STYLE}>
                        {q.eventDate ? format(q.eventDate, 'dd MMM yyyy') : '—'}
                      </td>

                      <td style={TD_STYLE}>
                        {format(q.validityDate, 'dd MMM yyyy')}
                      </td>

                      <td style={TD_STYLE}>
                        <div style={{ fontWeight: 700, color: 'var(--color-foreground)' }}>
                          {formatIndianCurrency(q.grandTotal)}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-foreground-muted)' }}>
                          {q.gstEnabled ? 'Incl. 18% GST' : 'No GST'}
                        </div>
                      </td>

                      <td style={TD_STYLE}>
                        <Badge
                          variant={
                            q.status === 'accepted'
                              ? 'paid'
                              : q.status === 'converted'
                              ? 'done'
                              : q.status === 'sent'
                              ? 'inProgress'
                              : 'todo'
                          }
                          label={q.status.toUpperCase()}
                        />
                      </td>

                      <td style={{ ...TD_STYLE, textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePreviewPdf(q)}
                            disabled={isGen}
                            title="Preview live A4 PDF"
                            style={{ height: '28px', padding: '0 8px', fontSize: 'var(--text-xs)' }}
                          >
                            <i className="ti ti-eye" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadPdf(q)}
                            disabled={isGen}
                            title="Download PDF"
                            style={{ height: '28px', padding: '0 8px', fontSize: 'var(--text-xs)' }}
                          >
                            <i className="ti ti-download" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/erp/quotations/${q.quotationId}/edit`)}
                            title="Edit Quotation"
                            style={{ height: '28px', padding: '0 8px', fontSize: 'var(--text-xs)' }}
                          >
                            <i className="ti ti-edit" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(q)}
                            title="Delete Quotation"
                            style={{ height: '28px', padding: '0 8px', fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}
                          >
                            <i className="ti ti-trash" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* MOBILE COMPACT CARDS (< 768px) */}
          <div className="flex flex-col gap-3 md:hidden">
            {quotations.map((q) => (
              <div
                key={q.quotationId}
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {q.quotationNumber}
                    </span>
                    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: '2px 0 0 0', color: 'var(--color-foreground)' }}>
                      {q.clientName}
                    </h3>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                      {q.eventType} {q.place ? `• ${q.place}` : ''}
                    </div>
                  </div>

                  <Badge
                    variant={
                      q.status === 'accepted'
                        ? 'paid'
                        : q.status === 'converted'
                        ? 'done'
                        : q.status === 'sent'
                        ? 'inProgress'
                        : 'todo'
                    }
                    label={q.status.toUpperCase()}
                  />
                </div>

                <div
                  style={{
                    backgroundColor: 'var(--color-surface-raised)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-foreground-subtle)' }}>GRAND TOTAL</div>
                    <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                      {formatIndianCurrency(q.grandTotal)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                    <div>Valid: {format(q.validityDate, 'dd MMM yyyy')}</div>
                    <div>Style: {q.templateId || 'production'}</div>
                  </div>
                </div>

                {/* CARD FOOTER ACTIONS */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', paddingTop: '4px' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreviewPdf(q)}
                    style={{ fontSize: 'var(--text-xs)', padding: '6px' }}
                  >
                    <i className="ti ti-eye" style={{ marginRight: '4px' }} /> Preview
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadPdf(q)}
                    style={{ fontSize: 'var(--text-xs)', padding: '6px' }}
                  >
                    <i className="ti ti-download" style={{ marginRight: '4px' }} /> PDF
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/erp/quotations/${q.quotationId}/edit`)}
                    style={{ fontSize: 'var(--text-xs)', padding: '6px' }}
                  >
                    <i className="ti ti-edit" style={{ marginRight: '4px' }} /> Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Quotation"
        description={`Are you sure you want to delete quotation ${deleteTarget?.quotationNumber} for ${deleteTarget?.clientName}? This action cannot be undone.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

const TH_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-foreground-subtle)',
  padding: '12px 16px',
  borderBottom: '0.5px solid var(--color-border-strong)',
  background: 'var(--color-surface)',
}

const TD_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  padding: '14px 16px',
  color: 'var(--color-foreground)',
  verticalAlign: 'middle',
}
