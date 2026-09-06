'use client'

import { motion } from 'framer-motion'
import { Badge } from '@/components/shared/Badge'
import { BookingWizardState } from '../bookingReducer'

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding:     'Wedding',
  reception:   'Reception',
  preWedding:  'Pre-Wedding',
  engagement:  'Engagement',
  birthday:    'Birthday',
  babyShower:  'Baby Shower',
  puberty:     'Puberty',
  corporate:   'Corporate',
  schoolEvent: 'School Event',
  portrait:    'Portrait',
  studio:      'Studio',
  other:       'Other',
}

const BOOKING_TYPE_LABELS: Record<string, string> = {
  oneTime:   'One-time Event',
  multiDate: 'Multi-date Event',
  recurring: 'Recurring / Contract',
}

const METHOD_LABELS: Record<string, string> = {
  gpay:         'GPay',
  cash:         'Cash',
  bankTransfer: 'Bank Transfer',
  cheque:       'Cheque',
}

interface StepReviewProps {
  state:       BookingWizardState
  onGoToStep:  (step: number) => void
  onSubmit:    (asLead: boolean) => void
  isSaving:    boolean
}

function SectionCard({
  title,
  stepIndex,
  onEdit,
  children,
  delay,
}: {
  title:     string
  stepIndex: number
  onEdit:    (step: number) => void
  children:  React.ReactNode
  delay:     number
}): React.JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      style={{
        padding: '16px',
        borderRadius: '10px',
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--color-foreground-subtle)',
          fontFamily: 'var(--font-inter)',
        }}>
          {title}
        </span>
        <span
          onClick={() => onEdit(stepIndex)}
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            color: 'var(--color-primary)',
            cursor: 'pointer',
            fontFamily: 'var(--font-inter)',
          }}
        >
          Edit
        </span>
      </div>
      {children}
    </motion.div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{
        fontSize: 'var(--text-sm)',
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground-muted)',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 'var(--text-sm)',
        fontWeight: 500,
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
      }}>
        {value}
      </span>
    </div>
  )
}

export default function StepReview({
  state,
  onGoToStep,
  onSubmit,
  isSaving,
}: StepReviewProps): React.JSX.Element {
  const balanceDue = Math.max(0, state.totalAmount - state.advanceAmount)
  const hasAdvance = state.advanceAmount > 0

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div>
        <h2 style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 600,
          color: 'var(--color-foreground)',
          fontFamily: 'var(--font-inter)',
          margin: 0,
        }}>
          Review &amp; confirm
        </h2>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-foreground-muted)',
          fontFamily: 'var(--font-inter)',
          marginTop: '6px',
        }}>
          Verify all details before creating the booking.
        </p>
      </div>

      {/* Booking Type */}
      <SectionCard title="Booking Type" stepIndex={0} onEdit={onGoToStep} delay={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Badge variant="booked" label={BOOKING_TYPE_LABELS[state.bookingType || ''] || '—'} />
        </div>
      </SectionCard>

      <SectionCard title="Client" stepIndex={1} onEdit={onGoToStep} delay={0.05}>
        <InfoRow label="Name" value={state.clientName || '—'} />
        <InfoRow
          label="Contact"
          value={state.contact ? (state.contact.startsWith('+91') ? state.contact : `+91 ${state.contact}`) : '—'}
        />
        <InfoRow label="Email" value={state.email || '—'} />
        {state.clientMode === 'existing' && (
          <div style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-inter)',
            color: 'var(--color-foreground-subtle)',
            fontStyle: 'italic',
          }}>
            Linked to existing client record
          </div>
        )}
      </SectionCard>

      {/* Event */}
      <SectionCard title="Event" stepIndex={2} onEdit={onGoToStep} delay={0.1}>
        <InfoRow label="Event name" value={state.eventName || '—'} />
        <InfoRow
          label="Type"
          value={state.eventType === 'other' && state.customEventType
            ? `Other (${state.customEventType})`
            : EVENT_TYPE_LABELS[state.eventType] || state.eventType}
        />
        <InfoRow label="Location" value={state.location || '—'} />

        {state.bookingType === 'oneTime' && (
          <>
            <InfoRow label="Date" value={formatDate(state.eventDate)} />
            {(state.startTime || state.endTime) && (
              <InfoRow label="Timing" value={`${state.startTime || '—'} – ${state.endTime || '—'}`} />
            )}
          </>
        )}

        {state.bookingType === 'multiDate' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-inter)',
              color: 'var(--color-foreground-muted)',
            }}>
              Dates ({state.eventDates.length})
            </span>
            {state.eventDates.map(ed => (
              <div key={ed.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingLeft: '8px',
              }}>
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-inter)',
                  color: 'var(--color-foreground)',
                }}>
                  {ed.label}
                </span>
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-inter)',
                  color: 'var(--color-foreground-muted)',
                }}>
                  {formatDate(ed.date)}
                  {ed.startTime ? ` (${ed.startTime}–${ed.endTime || ''})` : ''}
                  {ed.location ? ` · ${ed.location}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {state.bookingType === 'recurring' && (
          <>
            <InfoRow label="Frequency" value={state.frequency} />
            <InfoRow label="Period" value={`${formatDate(state.startDate)} → ${formatDate(state.endDate)}`} />
            <InfoRow label="Sessions" value={String(state.totalSessions)} />
            {(state.sessionStartTime || state.sessionEndTime) && (
              <InfoRow label="Session timing" value={`${state.sessionStartTime || '—'} – ${state.sessionEndTime || '—'}`} />
            )}
          </>
        )}

        {state.notes && (
          <div style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-inter)',
            color: 'var(--color-foreground-muted)',
            fontStyle: 'italic',
            padding: '6px 0 0',
            borderTop: '0.5px solid var(--color-border)',
          }}>
            {state.notes}
          </div>
        )}
      </SectionCard>

      {/* Package */}
      <SectionCard title="Package" stepIndex={3} onEdit={onGoToStep} delay={0.15}>
        <InfoRow label="Package" value={state.packageType || 'Custom'} />
        {state.bookingType === 'recurring' && (
          <InfoRow
            label="Billing model"
            value={state.recurringPaymentType === 'custom'
              ? `Custom contract (≈ ₹${Math.round(state.totalAmount / (state.totalSessions || 1)).toLocaleString('en-IN')}/session)`
              : `₹${state.perSessionRate.toLocaleString('en-IN')} × ${state.totalSessions} sessions`}
          />
        )}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingTop: '8px',
          borderTop: '0.5px solid var(--color-border)',
        }}>
          <span style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            fontFamily: 'var(--font-inter)',
            color: 'var(--color-foreground)',
          }}>
            Total
          </span>
          <span style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 700,
            fontFamily: 'var(--font-inter)',
            color: 'var(--color-primary)',
          }}>
            ₹{state.totalAmount.toLocaleString('en-IN')}
          </span>
        </div>
      </SectionCard>

      {/* Payment */}
      <SectionCard title="Payment" stepIndex={4} onEdit={onGoToStep} delay={0.2}>
        {hasAdvance ? (
          <>
            <InfoRow label="Advance" value={`₹${state.advanceAmount.toLocaleString('en-IN')}`} />
            <InfoRow label="Date" value={formatDate(state.advanceDate)} />
            <InfoRow label="Method" value={METHOD_LABELS[state.paymentMethod] || state.paymentMethod} />
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: '0.5px solid var(--color-border)',
            }}>
              <span style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                fontFamily: 'var(--font-inter)',
                color: 'var(--color-foreground-muted)',
              }}>
                Balance due
              </span>
              <span style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                fontFamily: 'var(--font-inter)',
                color: balanceDue > 0 ? 'var(--color-danger)' : 'var(--color-success)',
              }}>
                ₹{balanceDue.toLocaleString('en-IN')}
              </span>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <InfoRow label="Advance" value="₹0 (Yet to be paid)" />
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: '0.5px solid var(--color-border)',
            }}>
              <span style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                fontFamily: 'var(--font-inter)',
                color: 'var(--color-foreground-muted)',
              }}>
                Balance due
              </span>
              <span style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                fontFamily: 'var(--font-inter)',
                color: 'var(--color-danger)',
              }}>
                ₹{state.totalAmount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Action buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '10px',
        paddingTop: '8px',
      }}>
        <motion.button
          onClick={() => onSubmit(true)}
          disabled={isSaving}
          style={{
            fontFamily: 'var(--font-inter)',
            height: '40px',
            padding: '0 20px',
            borderRadius: '8px',
            border: '0.5px solid var(--color-border)',
            background: 'transparent',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: 'var(--color-foreground)',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.5 : 1,
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Save as lead
        </motion.button>
        <motion.button
          onClick={() => onSubmit(false)}
          disabled={isSaving}
          style={{
            fontFamily: 'var(--font-inter)',
            height: '40px',
            padding: '0 24px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--color-primary)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: '#ffffff',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.5 : 1,
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isSaving ? 'Creating…' : 'Create booking'}
        </motion.button>
      </div>
    </div>
  )
}
