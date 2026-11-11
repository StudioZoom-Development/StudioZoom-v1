'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { Invoice, InvoiceStatus, InvoicePaymentMode } from '@/types'
import {
  subscribeToInvoices,
  deleteInvoice,
  recordInvoicePayment,
} from '@/lib/firebase/queries/invoices'
import {
  subscribeToBrandConfig,
  type BrandConfig,
} from '@/lib/firebase/queries/settings'
import { renderInvoiceHtml } from '@/lib/invoice/invoiceHtmlRenderer'
import { formatIndianCurrency } from '@/lib/payroll/calculator'
import { useAuthStore } from '@/store/authStore'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { DateField } from '@/components/shared/DateField'

const STATUS_OPTIONS: Array<{ key: InvoiceStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All Invoices' },
  { key: 'draft', label: 'Drafts' },
  { key: 'sent', label: 'Sent' },
  { key: 'partiallyPaid', label: 'Partially Paid' },
  { key: 'paid', label: 'Paid' },
  { key: 'overdue', label: 'Overdue' },
]

function statusToBadgeVariant(status: InvoiceStatus): string {
  if (status === 'paid') return 'paid'
  if (status === 'partiallyPaid') return 'partial'
  if (status === 'overdue') return 'overdue'
  if (status === 'sent') return 'inProgress'
  return 'todo'
}

function statusToLabel(status: InvoiceStatus): string {
  if (status === 'partiallyPaid') return 'PARTIAL'
  return status.toUpperCase()
}

export default function InvoicesPage() {
  const router = useRouter()
  const appUser = useAuthStore((s) => s.appUser)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [brandConfig, setBrandConfig] = useState<BrandConfig | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Modals
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null)
  const [payAmount, setPayAmount] = useState<string>('')
  const [payDateStr, setPayDateStr] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [payMode, setPayMode] = useState<InvoicePaymentMode>('upi')
  const [payRef, setPayRef] = useState<string>('')
  const [payError, setPayError] = useState<string | null>(null)
  const [isRecordingPay, setIsRecordingPay] = useState<boolean>(false)

  useEffect(() => {
    const unsubInv = subscribeToInvoices(
      { status: statusFilter, search: searchQuery },
      (data) => {
        setInvoices(data)
        setLoading(false)
      }
    )
    const unsubBrand = subscribeToBrandConfig((b) => setBrandConfig(b))
    return () => {
      unsubInv()
      unsubBrand()
    }
  }, [statusFilter, searchQuery])

  const stats = useMemo(() => {
    const totalCount = invoices.length
    const totalBilled = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0)
    const totalCollected = invoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0)
    const totalOutstanding = invoices.reduce((sum, inv) => sum + (inv.balanceDue || 0), 0)
    return { totalCount, totalBilled, totalCollected, totalOutstanding }
  }, [invoices])

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    try {
      setIsDeleting(true)
      await deleteInvoice(deleteTarget.invoiceId)
      setDeleteTarget(null)
    } catch (err) {
      console.error('[Delete Invoice error]:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePrintInvoice = async (inv: Invoice): Promise<void> => {
    const branding =
      inv.studioId === 'studio-zoom-productions'
        ? brandConfig?.studioZoomProds || brandConfig?.studioZoom || null
        : brandConfig?.studioZoom || null
    const html = await renderInvoiceHtml(inv, {
      branding,
      studioName: inv.studioId === 'studio-zoom-productions' ? 'Studio Zoom Productions' : 'Studio Zoom',
    })
    const win = window.open('', '_blank')
    if (!win) return
    const printableHtml = html.replace(
      '</body>',
      `<script>
        window.addEventListener('load', function() {
          setTimeout(function() { window.focus(); window.print(); }, 300);
        });
      </script></body>`
    )
    win.document.open()
    win.document.write(printableHtml)
    win.document.close()
  }

  const openPaymentModal = (inv: Invoice): void => {
    setPaymentTarget(inv)
    setPayAmount(inv.balanceDue > 0 ? String(inv.balanceDue) : '')
    setPayDateStr(format(new Date(), 'yyyy-MM-dd'))
    setPayMode('upi')
    setPayRef('')
    setPayError(null)
  }

  const handleSubmitPayment = async (): Promise<void> => {
    if (!paymentTarget) return
    setPayError(null)

    const amt = parseFloat(payAmount)
    if (Number.isNaN(amt) || amt <= 0) {
      setPayError('Please enter a valid positive payment amount.')
      return
    }
    if (amt > paymentTarget.balanceDue) {
      setPayError(`Amount exceeds remaining balance due of ₹${paymentTarget.balanceDue.toLocaleString('en-IN')}.`)
      return
    }
    if (paymentTarget.payments.length >= 3) {
      setPayError('Maximum of 3 advance payments reached for this invoice.')
      return
    }

    setIsRecordingPay(true)
    try {
      await recordInvoicePayment(
        paymentTarget.invoiceId,
        {
          amount: amt,
          date: payDateStr ? new Date(payDateStr) : new Date(),
          mode: payMode,
          reference: payRef.trim() || undefined,
        },
        appUser?.uid || 'admin',
        appUser?.name || 'Studio Admin'
      )
      setPaymentTarget(null)
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : 'Failed to record payment.')
    } finally {
      setIsRecordingPay(false)
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
      {/* HEADER */}
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
            Invoices & Tax Billing
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', margin: '4px 0 0 0' }}>
            Create GST & non-GST invoices linked to bookings, track advances, and download print-ready A4 PDFs.
          </p>
        </div>

        <Button
          onClick={() => router.push('/erp/invoices/new')}
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
          <span>New Invoice</span>
        </Button>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div style={KPI_CARD_STYLE}>
          <span style={KPI_LABEL_STYLE}>TOTAL INVOICES</span>
          <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-foreground)' }}>
            {stats.totalCount}
          </span>
          <span style={KPI_SUB_STYLE}>Active invoice records</span>
        </div>

        <div style={KPI_CARD_STYLE}>
          <span style={KPI_LABEL_STYLE}>TOTAL BILLED</span>
          <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-primary)' }}>
            {formatIndianCurrency(stats.totalBilled)}
          </span>
          <span style={KPI_SUB_STYLE}>Gross invoice value</span>
        </div>

        <div style={KPI_CARD_STYLE}>
          <span style={KPI_LABEL_STYLE}>ADVANCE / COLLECTED</span>
          <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-success)' }}>
            {formatIndianCurrency(stats.totalCollected)}
          </span>
          <span style={KPI_SUB_STYLE}>Total payments received</span>
        </div>

        <div style={KPI_CARD_STYLE}>
          <span style={KPI_LABEL_STYLE}>BALANCE DUE</span>
          <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-danger)' }}>
            {formatIndianCurrency(stats.totalOutstanding)}
          </span>
          <span style={KPI_SUB_STYLE}>Pending collections</span>
        </div>
      </div>

      {/* FILTER & SEARCH */}
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
                type="button"
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
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <div className="w-full sm:w-[260px]">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search client, invoice #, event..."
            style={{ height: '36px', fontSize: 'var(--text-xs)' }}
          />
        </div>
      </div>

      {/* DATA LIST */}
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
              <TableRowSkeleton rows={5} cols={7} />
            </tbody>
          </table>
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon="ti-receipt-tax"
          title="No Invoices Found"
          description="Create your first invoice from a client project or standalone billing details."
          action={{
            label: 'Create Invoice',
            onClick: () => router.push('/erp/invoices/new'),
          }}
        />
      ) : (
        <>
          {/* DESKTOP TABLE (>= 768px) */}
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
                  <th style={TH_STYLE}>Invoice #</th>
                  <th style={TH_STYLE}>Client / Event</th>
                  <th style={TH_STYLE}>Dates</th>
                  <th style={TH_STYLE}>Total</th>
                  <th style={TH_STYLE}>Balance Due</th>
                  <th style={TH_STYLE}>Status</th>
                  <th style={{ ...TH_STYLE, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.invoiceId} style={{ borderBottom: '0.5px solid var(--color-border)' }}>
                    <td style={TD_STYLE}>
                      <div style={{ fontWeight: 700, color: 'var(--color-foreground)' }}>
                        {inv.invoiceNumber}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-foreground-muted)' }}>
                        {inv.gstEnabled ? `Tax Invoice · ${inv.gstRate}%` : 'Standard Invoice'}
                      </div>
                    </td>

                    <td style={TD_STYLE}>
                      <div style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                        {inv.clientName}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-foreground-muted)' }}>
                        {inv.eventName || 'Photography Services'}
                        {inv.clientState ? ` · ${inv.clientState}` : ''}
                      </div>
                    </td>

                    <td style={TD_STYLE}>
                      <div>{format(inv.invoiceDate, 'dd MMM yyyy')}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-foreground-muted)' }}>
                        Due {format(inv.dueDate, 'dd MMM yyyy')}
                      </div>
                    </td>

                    <td style={TD_STYLE}>
                      <div style={{ fontWeight: 700 }}>{formatIndianCurrency(inv.totalAmount)}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-success)' }}>
                        Paid {formatIndianCurrency(inv.amountPaid)}
                      </div>
                    </td>

                    <td style={TD_STYLE}>
                      {inv.balanceDue <= 0 ? (
                        <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>₹0 (Settled)</span>
                      ) : (
                        <span style={{ fontWeight: 700, color: 'var(--color-danger)' }}>
                          {formatIndianCurrency(inv.balanceDue)}
                        </span>
                      )}
                    </td>

                    <td style={TD_STYLE}>
                      <Badge variant={statusToBadgeVariant(inv.status)} label={statusToLabel(inv.status)} />
                    </td>

                    <td style={{ ...TD_STYLE, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {inv.balanceDue > 0 && inv.payments.length < 3 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPaymentModal(inv)}
                            style={ACTION_BTN_ACCENT}
                            title="Record Advance Payment"
                          >
                            <i className="ti ti-cash" />
                            <span>Pay</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePrintInvoice(inv)}
                          style={ACTION_BTN_NEUTRAL}
                          title="Print / Save as PDF"
                        >
                          <i className="ti ti-printer" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/erp/invoices/${inv.invoiceId}/edit`)}
                          style={ACTION_BTN_NEUTRAL}
                          title="Edit Invoice"
                        >
                          <i className="ti ti-edit" />
                          <span>Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(inv)}
                          style={ACTION_BTN_DANGER}
                          title="Delete Invoice"
                        >
                          <i className="ti ti-trash" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MOBILE COMPACT CARDS (< 768px) */}
          <div className="flex flex-col gap-3 md:hidden">
            {invoices.map((inv) => (
              <div
                key={inv.invoiceId}
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {inv.invoiceNumber}
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                      {inv.clientName}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                      {inv.eventName} · {format(inv.invoiceDate, 'dd MMM yyyy')}
                    </div>
                  </div>
                  <Badge variant={statusToBadgeVariant(inv.status)} label={statusToLabel(inv.status)} />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '8px',
                    backgroundColor: 'var(--color-surface-raised)',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--color-foreground-subtle)' }}>Total</div>
                    <div style={{ fontWeight: 700 }}>{formatIndianCurrency(inv.totalAmount)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--color-foreground-subtle)' }}>Paid</div>
                    <div style={{ fontWeight: 700, color: 'var(--color-success)' }}>
                      {formatIndianCurrency(inv.amountPaid)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--color-foreground-subtle)' }}>Balance</div>
                    <div style={{ fontWeight: 700, color: inv.balanceDue > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {inv.balanceDue > 0 ? formatIndianCurrency(inv.balanceDue) : 'PAID'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {inv.balanceDue > 0 && inv.payments.length < 3 && (
                    <Button variant="ghost" size="sm" onClick={() => openPaymentModal(inv)} style={ACTION_BTN_ACCENT}>
                      <i className="ti ti-cash" /> <span>Pay</span>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handlePrintInvoice(inv)} style={ACTION_BTN_NEUTRAL}>
                    <i className="ti ti-printer" /> <span>PDF</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/erp/invoices/${inv.invoiceId}/edit`)}
                    style={ACTION_BTN_NEUTRAL}
                  >
                    <i className="ti ti-edit" /> <span>Edit</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(inv)} style={ACTION_BTN_DANGER}>
                    <i className="ti ti-trash" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* RECORD PAYMENT MODAL */}
      {paymentTarget && (
        <div
          onClick={() => setPaymentTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9995,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            fontFamily: 'var(--font-inter)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] rounded-2xl p-5 md:p-6 flex flex-col gap-4 shadow-2xl"
            style={{
              backgroundColor: 'var(--color-surface-overlay)',
              border: '0.5px solid var(--color-border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                  Record Advance Payment
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  {paymentTarget.invoiceNumber} · {paymentTarget.clientName} · Balance ₹
                  {paymentTarget.balanceDue.toLocaleString('en-IN')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaymentTarget(null)}
                style={{ background: 'none', border: 'none', color: 'var(--color-foreground-muted)', cursor: 'pointer', fontSize: '18px' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            {payError && (
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-danger)',
                  backgroundColor: 'var(--color-danger-muted)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}
              >
                {payError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontWeight: 500 }}>
                  Amount (₹) — Max ₹{paymentTarget.balanceDue.toLocaleString('en-IN')}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={paymentTarget.balanceDue}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="h-9 mt-1"
                />
              </div>

              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontWeight: 500 }}>
                  Payment Date
                </label>
                <div style={{ marginTop: '4px' }}>
                  <DateField value={payDateStr} onChange={setPayDateStr} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontWeight: 500 }}>
                  Payment Mode
                </label>
                <select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value as InvoicePaymentMode)}
                  style={{
                    width: '100%',
                    height: '36px',
                    marginTop: '4px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '0.5px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface-raised)',
                    color: 'var(--color-foreground)',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-inter)',
                  }}
                >
                  <option value="upi">UPI / GPay</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="cash">Cash</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontWeight: 500 }}>
                  Reference / Transaction ID (Optional)
                </label>
                <Input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="UTR / UPI Ref"
                  className="h-9 mt-1"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}>
              <Button type="button" variant="ghost" onClick={() => setPaymentTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmitPayment}
                disabled={isRecordingPay}
                style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff', fontWeight: 600 }}
              >
                {isRecordingPay ? 'Saving...' : 'Record Payment'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Invoice"
        description={`Are you sure you want to delete invoice ${deleteTarget?.invoiceNumber} for ${deleteTarget?.clientName}?`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

const KPI_CARD_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--color-surface)',
  border: '0.5px solid var(--color-border)',
  borderRadius: '12px',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const KPI_LABEL_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  color: 'var(--color-foreground-subtle)',
}

const KPI_SUB_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-foreground-muted)',
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

const ACTION_BTN_NEUTRAL: React.CSSProperties = {
  height: '30px',
  padding: '0 10px',
  fontSize: 'var(--text-xs)',
  backgroundColor: 'var(--color-surface-raised)',
  border: '0.5px solid var(--color-border)',
  color: 'var(--color-foreground)',
  borderRadius: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
}

const ACTION_BTN_ACCENT: React.CSSProperties = {
  height: '30px',
  padding: '0 10px',
  fontSize: 'var(--text-xs)',
  backgroundColor: 'var(--color-accent-muted)',
  border: '0.5px solid var(--color-accent)',
  color: 'var(--color-accent)',
  borderRadius: '6px',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
}

const ACTION_BTN_DANGER: React.CSSProperties = {
  height: '30px',
  padding: '0 10px',
  fontSize: 'var(--text-xs)',
  backgroundColor: 'var(--color-danger-muted)',
  border: '0.5px solid var(--color-danger)',
  color: 'var(--color-danger)',
  borderRadius: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
}
