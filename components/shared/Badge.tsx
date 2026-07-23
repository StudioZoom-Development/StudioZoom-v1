interface BadgeProps {
  variant: string
  label?:  string
}

// Badge colours matching design file's badgeBg / badgeFg pattern
const STYLES: Record<string, { bg: string; fg: string }> = {
  // Project stages
  booked:          { bg: 'var(--color-accent-muted)',    fg: 'var(--color-accent)' },
  planning:        { bg: 'var(--color-primary-muted)',   fg: 'var(--color-primary)' },
  preProduction:   { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  eventDay:        { bg: 'var(--color-danger-muted)',    fg: 'var(--color-danger)' },
  postProduction:  { bg: 'var(--color-purple-muted)',    fg: 'var(--color-purple)' },
  delivered:       { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  // Payment
  paid:            { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  partial:         { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  unpaid:          { bg: 'var(--color-danger-muted)',    fg: 'var(--color-danger)' },
  overdue:         { bg: 'var(--color-danger-muted)',    fg: 'var(--color-danger)' },
  // Client status
  inquiry:         { bg: 'var(--color-surface-raised)',  fg: 'var(--color-foreground-muted)' },
  // Equipment
  available:       { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  out:             { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  service:         { bg: 'var(--color-surface-raised)',  fg: 'var(--color-foreground-muted)' },
  // Work board
  free:            { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  occupied:        { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  overloaded:      { bg: 'var(--color-danger-muted)',    fg: 'var(--color-danger)' },
}

const LABELS: Record<string, string> = {
  preProduction:  'Pre-Prod',
  postProduction: 'Post-Prod',
  eventDay:       'Event Day',
  inquiry:        'Inquiry',
}

export function Badge({ variant, label }: BadgeProps) {
  const key   = (variant ?? '').trim()
  const style = STYLES[key] ?? { bg: 'var(--color-surface-raised)', fg: 'var(--color-foreground-muted)' }
  const text  = label ?? LABELS[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : '')

  return (
    <span style={{
      fontSize:       'var(--text-xs)',
      fontWeight:     600,
      height:         '20px',
      display:        'inline-flex',
      alignItems:     'center',
      padding:        '0 8px',
      borderRadius:   '10px',
      background:     style.bg,
      color:          style.fg,
      whiteSpace:     'nowrap',
    }}>
      {text}
    </span>
  )
}
