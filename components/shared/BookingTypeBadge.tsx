import React from 'react'

interface BookingTypeBadgeProps {
  className?: string
  style?: React.CSSProperties
}

/**
 * Reusable token-styled Recurring badge matching Studio Zoom design system
 */
export const RecurringBadge = React.memo(function RecurringBadge({
  className = '',
  style,
}: BookingTypeBadgeProps) {
  return (
    <span
      className={className}
      style={{
        fontSize: '10px',
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: '4px',
        background: 'var(--color-purple-muted)',
        color: 'var(--color-purple)',
        border: '0.5px solid var(--color-purple)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        lineHeight: '14px',
        ...style,
      }}
    >
      <i className="ti ti-repeat" style={{ fontSize: '11px' }} />
      <span>Recurring</span>
    </span>
  )
})

/**
 * Reusable token-styled Multi-Date badge matching Studio Zoom design system
 */
export const MultiDateBadge = React.memo(function MultiDateBadge({
  className = '',
  style,
}: BookingTypeBadgeProps) {
  return (
    <span
      className={className}
      style={{
        fontSize: '10px',
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: '4px',
        background: 'var(--color-accent-muted)',
        color: 'var(--color-accent)',
        border: '0.5px solid var(--color-accent)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        lineHeight: '14px',
        ...style,
      }}
    >
      <i className="ti ti-calendar-event" style={{ fontSize: '11px' }} />
      <span>Multi-Date</span>
    </span>
  )
})
