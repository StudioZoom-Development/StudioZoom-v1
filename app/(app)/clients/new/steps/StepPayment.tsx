'use client'

import { Input } from '@/components/ui/input'
import { BookingWizardState, BookingAction } from '../bookingReducer'

const SELECT_STYLE: React.CSSProperties = {
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
}

interface StepPaymentProps {
  state:    BookingWizardState
  dispatch: React.Dispatch<BookingAction>
}

export default function StepPayment({ state, dispatch }: StepPaymentProps): React.JSX.Element {
  const balanceDue = Math.max(0, state.totalAmount - state.advanceAmount)
  const hasAdvance = state.advanceAmount > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h2 style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 600,
          color: 'var(--color-foreground)',
          fontFamily: 'var(--font-inter)',
          margin: 0,
        }}>
          Advance payment
        </h2>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-foreground-muted)',
          fontFamily: 'var(--font-inter)',
          marginTop: '6px',
        }}>
          Record the advance payment collected. Skip if none collected yet.
        </p>
      </div>

      {/* Payment fields */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              fontFamily: 'var(--font-inter)',
              color: 'var(--color-foreground)',
            }}>
              Advance paid
            </label>
            <Input
              type="number"
              placeholder="0"
              value={state.advanceAmount > 0 ? String(state.advanceAmount) : ''}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'advanceAmount', value: parseFloat(e.target.value) || 0 })}
              className="h-9"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              fontFamily: 'var(--font-inter)',
              color: 'var(--color-foreground)',
            }}>
              Advance date
            </label>
            <Input
              type="date"
              value={state.advanceDate}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'advanceDate', value: e.target.value })}
              className="h-9"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              fontFamily: 'var(--font-inter)',
              color: 'var(--color-foreground)',
            }}>
              Method
            </label>
            <select
              style={SELECT_STYLE}
              value={state.paymentMethod}
              onChange={e => dispatch({ type: 'SET_PAYMENT_METHOD', payload: e.target.value as 'gpay' | 'cash' | 'bankTransfer' | 'cheque' })}
            >
              <option value="gpay">GPay</option>
              <option value="cash">Cash</option>
              <option value="bankTransfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
        </div>
      </div>

      {/* Balance summary */}
      <div style={{
        padding: '16px',
        borderRadius: '10px',
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-inter)',
            color: 'var(--color-foreground-muted)',
          }}>
            Package total
          </span>
          <span style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            fontFamily: 'var(--font-inter)',
            color: 'var(--color-foreground)',
          }}>
            ₹{state.totalAmount.toLocaleString('en-IN')}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-inter)',
            color: 'var(--color-foreground-muted)',
          }}>
            Advance paid
          </span>
          <span style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            fontFamily: 'var(--font-inter)',
            color: hasAdvance ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
          }}>
            {hasAdvance ? `−₹${state.advanceAmount.toLocaleString('en-IN')}` : '₹0'}
          </span>
        </div>

        <div style={{
          borderTop: '0.5px solid var(--color-border)',
          paddingTop: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            fontFamily: 'var(--font-inter)',
            color: 'var(--color-foreground)',
          }}>
            Balance due
          </span>
          <span style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 700,
            fontFamily: 'var(--font-inter)',
            color: balanceDue > 0 ? 'var(--color-danger)' : 'var(--color-success)',
          }}>
            ₹{balanceDue.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Warning / info */}
      {!hasAdvance && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--color-secondary-muted)',
          borderRadius: '8px',
          padding: '10px 12px',
        }}>
          <i className="ti ti-info-circle" style={{
            fontSize: '16px',
            color: 'var(--color-secondary)',
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-inter)',
            color: 'var(--color-foreground-muted)',
          }}>
            No advance payment recorded. This booking will be created with payment status <strong>Yet to be paid (Unpaid)</strong>. You can record payments anytime later.
          </span>
        </div>
      )}
    </div>
  )
}
