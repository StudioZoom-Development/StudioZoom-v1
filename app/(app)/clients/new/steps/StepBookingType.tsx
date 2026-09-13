'use client'

import { motion } from 'framer-motion'
import { BookingType } from '@/types'
import { BookingAction } from '../bookingReducer'

const BOOKING_TYPES: Array<{
  type:        BookingType
  title:       string
  description: string
  icon:        string
  examples:    string
}> = [
  {
    type:        'oneTime',
    title:       'One-time event',
    description: 'A single-date event with one shooting day.',
    icon:        'ti-calendar-event',
    examples:    'Wedding, birthday, corporate event, portrait session',
  },
  {
    type:        'multiDate',
    title:       'Multi-date event',
    description: 'Same client, multiple event dates — one master booking.',
    icon:        'ti-calendar-stats',
    examples:    'Engagement + Wedding + Reception, multi-day corporate',
  },
  {
    type:        'recurring',
    title:       'Recurring / Contract',
    description: 'Ongoing relationship with regular sessions.',
    icon:        'ti-repeat',
    examples:    'School photography, corporate retainer, monthly shoots',
  },
]

interface StepBookingTypeProps {
  selectedType: BookingType | null
  dispatch:     React.Dispatch<BookingAction>
}

export default function StepBookingType({ selectedType, dispatch }: StepBookingTypeProps): React.JSX.Element {
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
          What type of booking is this?
        </h2>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-foreground-muted)',
          fontFamily: 'var(--font-inter)',
          marginTop: '6px',
        }}>
          This determines how dates and pricing work for this booking.
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {BOOKING_TYPES.map((bt) => {
          const isSelected = selectedType === bt.type
          return (
            <motion.div
              key={bt.type}
              onClick={() => dispatch({ type: 'SET_BOOKING_TYPE', payload: bt.type })}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '16px',
                padding: '20px',
                borderRadius: '12px',
                border: isSelected
                  ? '2px solid var(--color-primary)'
                  : '0.5px solid var(--color-border)',
                background: isSelected
                  ? 'var(--color-primary-muted)'
                  : 'var(--color-surface)',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              {/* Icon */}
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: isSelected
                  ? 'var(--color-primary)'
                  : 'var(--color-surface-raised)',
                color: isSelected ? '#ffffff' : 'var(--color-foreground-muted)',
                transition: 'all 0.15s ease',
              }}>
                <i className={`ti ${bt.icon}`} style={{ fontSize: '22px' }} />
              </div>

              {/* Text */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{
                  fontSize: 'var(--text-lg)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-inter)',
                  color: 'var(--color-foreground)',
                }}>
                  {bt.title}
                </div>
                <div style={{
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-inter)',
                  color: 'var(--color-foreground-muted)',
                  lineHeight: 1.5,
                }}>
                  {bt.description}
                </div>
                <div style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-inter)',
                  color: 'var(--color-foreground-subtle)',
                  marginTop: '4px',
                }}>
                  e.g. {bt.examples}
                </div>
              </div>

              {/* Radio */}
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: isSelected
                  ? '6px solid var(--color-primary)'
                  : '2px solid var(--color-border-strong)',
                flexShrink: 0,
                marginLeft: 'auto',
                marginTop: '2px',
                transition: 'border 0.15s ease',
              }} />
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
