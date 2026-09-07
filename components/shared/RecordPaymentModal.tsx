'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/authStore'
import { recordPayment, subscribeToPayments } from '@/lib/firebase/queries/clients'

interface PaymentDoc {
  paymentId: string
  instalment: string
  amount: number
  date: Date
  method: string
  transactionId?: string
  recordedBy: string
  recordedByName?: string
}

interface RecordPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientName?: string
  totalAmount?: number
  balanceDue?: number
  onSuccess?: () => void
}

export function RecordPaymentModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  totalAmount = 0,
  balanceDue = 0,
  onSuccess,
}: RecordPaymentModalProps) {
  const appUser = useAuthStore(s => s.appUser)

  const [payments, setPayments] = useState<PaymentDoc[]>([])
  const [instalment, setInstalment] = useState<'1st' | '2nd' | '3rd' | 'settlement'>('1st')
  const [paymentAmount, setPaymentAmount] = useState<string>('')
  const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gpay' | 'bankTransfer' | 'cheque'>('gpay')
  const [transactionId, setTransactionId] = useState<string>('')
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [submittingPayment, setSubmittingPayment] = useState<boolean>(false)

  // Listen to existing payments
  useEffect(() => {
    if (!clientId || !isOpen) return
    const unsub = subscribeToPayments(clientId, (list) => {
      setPayments(list)
    })
    return () => unsub()
  }, [clientId, isOpen])

  const receivedInstalments = useMemo(() => new Set<string>(payments.map(p => p.instalment)), [payments])
  const allStandardReceived = ['1st', '2nd', '3rd', '1st Instalment', '2nd Instalment', '3rd Instalment'].some(inst => receivedInstalments.has(inst))

  // Prefill when modal opens or balance changes
  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      setPaymentError(null)
      setTransactionId('')
      setPaymentDate(format(new Date(), 'yyyy-MM-dd'))
      setPaymentAmount(balanceDue > 0 ? String(balanceDue) : '')

      if (!receivedInstalments.has('1st')) {
        setInstalment('1st')
      } else if (!receivedInstalments.has('2nd')) {
        setInstalment('2nd')
      } else if (!receivedInstalments.has('3rd')) {
        setInstalment('3rd')
      } else {
        setInstalment('settlement')
      }
    }, 0)

    return () => clearTimeout(timer)
  }, [isOpen, balanceDue, receivedInstalments])

  if (!isOpen) return null

  const handleRecordPaymentSubmit = async () => {
    setPaymentError(null)
    const amt = parseFloat(paymentAmount)

    if (isNaN(amt) || amt <= 0) {
      setPaymentError('Please enter a valid payment amount.')
      return
    }

    if (balanceDue > 0 && amt > balanceDue) {
      setPaymentError(`Amount cannot exceed the remaining balance of ₹${balanceDue.toLocaleString('en-IN')}.`)
      return
    }

    if (paymentMethod !== 'cash' && !transactionId.trim()) {
      setPaymentError('Transaction ID is required for non-cash payments.')
      return
    }

    setSubmittingPayment(true)
    try {
      const instalmentLabel = instalment === 'settlement' ? 'Final Settlement' : `${instalment} Instalment`
      await recordPayment(
        clientId,
        {
          instalment: instalmentLabel,
          amount: amt,
          date: new Date(paymentDate),
          method: paymentMethod,
          transactionId: transactionId.trim() || undefined,
        },
        appUser?.uid || 'system',
        appUser?.name || 'Studio Admin'
      )

      if (onSuccess) onSuccess()
      onClose()
    } catch (err: unknown) {
      console.error('Failed to record payment:', err)
      setPaymentError('Failed to record payment. Please try again.')
    } finally {
      setSubmittingPayment(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-inter)',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'var(--color-surface-overlay)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Record Payment
            </div>
            {clientName && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                {clientName}
                {totalAmount > 0 ? ` · Total: ₹${totalAmount.toLocaleString('en-IN')}` : ''}
                {balanceDue > 0 ? ` · Balance: ₹${balanceDue.toLocaleString('en-IN')}` : ''}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-foreground-muted)',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '4px',
            }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        {paymentError && (
          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-danger)',
            background: 'var(--color-danger-muted)',
            borderRadius: '8px',
            padding: '8px 12px',
          }}>
            {paymentError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
              Instalment Type
            </label>
            <select
              value={instalment}
              onChange={e => setInstalment(e.target.value as '1st' | '2nd' | '3rd' | 'settlement')}
              style={{
                fontFamily: 'var(--font-inter)',
                height: '36px',
                width: '100%',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                padding: '0 10px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="1st" disabled={receivedInstalments.has('1st') || receivedInstalments.has('1st Instalment')}>
                1st Instalment {receivedInstalments.has('1st') || receivedInstalments.has('1st Instalment') ? '(Received)' : ''}
              </option>
              <option value="2nd" disabled={receivedInstalments.has('2nd') || receivedInstalments.has('2nd Instalment')}>
                2nd Instalment {receivedInstalments.has('2nd') || receivedInstalments.has('2nd Instalment') ? '(Received)' : ''}
              </option>
              <option value="3rd" disabled={receivedInstalments.has('3rd') || receivedInstalments.has('3rd Instalment')}>
                3rd Instalment {receivedInstalments.has('3rd') || receivedInstalments.has('3rd Instalment') ? '(Received)' : ''}
              </option>
              <option value="settlement">
                Final Settlement {allStandardReceived ? '(Standard cleared)' : ''}
              </option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
              Amount (₹)
            </label>
            <Input
              type="number"
              placeholder="₹0"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              className="h-9"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
              Date
            </label>
            <Input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              className="h-9"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as 'cash' | 'gpay' | 'bankTransfer' | 'cheque')}
              style={{
                fontFamily: 'var(--font-inter)',
                height: '36px',
                width: '100%',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                padding: '0 10px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="gpay">GPay / UPI</option>
              <option value="cash">Cash</option>
              <option value="bankTransfer">Bank Transfer (NEFT/RTGS)</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          {paymentMethod !== 'cash' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                Transaction ID / Ref <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. UPI Ref / UTR / Cheque No."
                value={transactionId}
                onChange={e => setTransactionId(e.target.value)}
                className="h-9"
              />
            </div>
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px',
          borderTop: '0.5px solid var(--color-border)',
          paddingTop: '16px',
          marginTop: '4px',
        }}>
          <Button
            variant="outline"
            className="h-9"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="h-9 font-medium"
            onClick={handleRecordPaymentSubmit}
            disabled={submittingPayment}
          >
            {submittingPayment ? 'Recording…' : 'Save Payment'}
          </Button>
        </div>
      </div>
    </div>
  )
}
