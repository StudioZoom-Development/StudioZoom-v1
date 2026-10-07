'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/shared/DateField'
import { useAuthStore } from '@/store/authStore'
import { recordPayment, subscribeToPayments } from '@/lib/firebase/queries/clients'
import { subscribeToBankAccounts, seedDefaultBankAccountsIfEmpty } from '@/lib/firebase/queries/bankAccounts'
import type { BankAccount } from '@/types'

interface PaymentDoc {
  paymentId: string
  instalment: string
  amount: number
  date: Date
  method: string
  transactionId?: string
  bankAccountId?: string
  bankAccountName?: string
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
  maxBalanceDue?: number
  onSuccess?: () => void
}

export function RecordPaymentModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  totalAmount = 0,
  balanceDue = 0,
  maxBalanceDue,
  onSuccess,
}: RecordPaymentModalProps) {
  const appUser = useAuthStore(s => s.appUser)

  const [payments, setPayments] = useState<PaymentDoc[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('')
  const [instalment, setInstalment] = useState<'1st' | '2nd' | '3rd' | 'settlement'>('1st')
  const [paymentAmount, setPaymentAmount] = useState<string>('')
  const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gpay' | 'bankTransfer' | 'cheque'>('gpay')
  const [transactionId, setTransactionId] = useState<string>('')
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [submittingPayment, setSubmittingPayment] = useState<boolean>(false)

  // Listen to bank accounts
  useEffect(() => {
    seedDefaultBankAccountsIfEmpty(appUser?.uid || 'system').catch(err => {
      console.warn('Bank seed check error:', err)
    })
    const unsub = subscribeToBankAccounts((list) => {
      setBankAccounts(list)
    })
    return () => unsub()
  }, [appUser?.uid])

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

  // Synchronize bank account selection when bank accounts or payment method changes
  useEffect(() => {
    if (bankAccounts.length === 0) return

    if (paymentMethod === 'cash') {
      const cashAcc = bankAccounts.find(b => b.nickname.toLowerCase().includes('cash') || b.bankName.toLowerCase().includes('cash'))
      if (cashAcc) {
        setSelectedBankAccountId(cashAcc.bankAccountId)
        return
      }
    }

    // For non-cash (or if no cash account found), pick default bank account or first non-cash
    if (!selectedBankAccountId || bankAccounts.find(b => b.bankAccountId === selectedBankAccountId)?.nickname.toLowerCase().includes('cash')) {
      const defaultAcc = bankAccounts.find(b => b.isDefault && !b.nickname.toLowerCase().includes('cash')) 
        || bankAccounts.find(b => !b.nickname.toLowerCase().includes('cash'))
        || bankAccounts[0]
      if (defaultAcc) {
        setSelectedBankAccountId(defaultAcc.bankAccountId)
      }
    }
  }, [bankAccounts, paymentMethod, selectedBankAccountId])

  if (!isOpen) return null

  const handleRecordPaymentSubmit = async () => {
    setPaymentError(null)
    const amt = parseFloat(paymentAmount)

    if (isNaN(amt) || amt <= 0) {
      setPaymentError('Please enter a valid payment amount.')
      return
    }

    const ceiling = maxBalanceDue !== undefined ? maxBalanceDue : balanceDue
    if (ceiling > 0 && amt > ceiling) {
      setPaymentError(`Amount cannot exceed the remaining balance of ₹${ceiling.toLocaleString('en-IN')}.`)
      return
    }

    setSubmittingPayment(true)
    try {
      const instalmentLabel = instalment === 'settlement' ? 'Final Settlement' : `${instalment} Instalment`
      const targetBank = bankAccounts.find(b => b.bankAccountId === selectedBankAccountId)

      await recordPayment(
        clientId,
        {
          instalment: instalmentLabel,
          amount: amt,
          date: new Date(paymentDate),
          method: paymentMethod,
          transactionId: transactionId.trim() || undefined,
          bankAccountId: targetBank?.bankAccountId,
          bankAccountName: targetBank?.nickname || targetBank?.bankName,
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
        zIndex: 9995,
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
        className="w-full max-w-[440px] max-h-[90dvh] overflow-y-auto rounded-2xl flex flex-col gap-4 shadow-2xl p-5 md:p-6"
        style={{
          background: 'var(--color-surface-overlay)',
          border: '0.5px solid var(--color-border)',
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
            <DateField
              value={paymentDate}
              onChange={val => setPaymentDate(val)}
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

          {/* Deposit Target Bank Account */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                {paymentMethod === 'cash' ? 'Deposit / Target Ledger' : 'Deposit To Bank Account'}
              </label>
              {selectedBankAccountId && (
                <span style={{ fontSize: '10px', color: 'var(--color-primary)', fontWeight: 500 }}>
                  {bankAccounts.find(b => b.bankAccountId === selectedBankAccountId)?.accountHolder || ''}
                </span>
              )}
            </div>
            <select
              value={selectedBankAccountId}
              onChange={e => setSelectedBankAccountId(e.target.value)}
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
              {bankAccounts.length === 0 ? (
                <option value="">No bank accounts configured</option>
              ) : (
                bankAccounts.map(b => (
                  <option key={b.bankAccountId} value={b.bankAccountId}>
                    {b.nickname} {b.accountNumberMasked ? `(${b.accountNumberMasked})` : ''} {b.isDefault ? '— Primary' : ''}
                  </option>
                ))
              )}
            </select>
          </div>


          {paymentMethod !== 'cash' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>
                Transaction ID / Ref (Optional)
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

        <div className="flex flex-col-reverse md:flex-row justify-end gap-2.5 pt-4 mt-1 border-t border-[var(--color-border)]">
          <Button
            variant="outline"
            className="w-full md:w-auto h-10 md:h-9"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="w-full md:w-auto h-10 md:h-9 font-medium"
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
