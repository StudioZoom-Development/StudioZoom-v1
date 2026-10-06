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
  inquiry:         { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  // Equipment
  available:       { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  out:             { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  service:         { bg: 'var(--color-surface-raised)',  fg: 'var(--color-foreground-muted)' },
  maintenance:     { bg: 'var(--color-purple-muted)',    fg: 'var(--color-purple)' },
  repair:          { bg: 'var(--color-danger-muted)',    fg: 'var(--color-danger)' },
  underRepair:     { bg: 'var(--color-danger-muted)',    fg: 'var(--color-danger)' },
  damaged:         { bg: 'var(--color-danger-muted)',    fg: 'var(--color-danger)' },
  lost:            { bg: 'var(--color-danger-muted)',    fg: 'var(--color-danger)' },
  retired:         { bg: 'var(--color-surface-raised)',  fg: 'var(--color-foreground-subtle)' },
  // Work board
  free:            { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  occupied:        { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  overloaded:      { bg: 'var(--color-danger-muted)',    fg: 'var(--color-danger)' },
  // Work items
  todo:            { bg: 'var(--color-surface-raised)',  fg: 'var(--color-foreground-muted)' },
  inProgress:      { bg: 'var(--color-accent-muted)',    fg: 'var(--color-accent)' },
  review:          { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  done:            { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  // Time Clock
  active:          { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  in:              { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  notIn:           { bg: 'var(--color-surface-raised)',  fg: 'var(--color-foreground-muted)' },
  // Attendance
  present:         { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  late:            { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  halfDay:         { bg: 'var(--color-accent-muted)',    fg: 'var(--color-accent)' },
  leave:           { bg: 'var(--color-purple-muted)',    fg: 'var(--color-purple)' },
  absent:          { bg: 'var(--color-danger-muted)',    fg: 'var(--color-danger)' },
  pending:         { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  weekOff:         { bg: 'var(--color-surface-raised)',  fg: 'var(--color-foreground-muted)' },
  permission:      { bg: 'var(--color-purple-muted)',    fg: 'var(--color-purple)' },
  // Time Logs
  flagged:         { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  clean:           { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  corrected:       { bg: 'var(--color-accent-muted)',    fg: 'var(--color-accent)' },
  // Expenses Categories
  equipment:       { bg: 'var(--color-accent-muted)',    fg: 'var(--color-accent)' },
  freelancer:      { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  travel:          { bg: 'var(--color-purple-muted)',    fg: 'var(--color-purple)' },
  studioRent:      { bg: 'var(--color-primary-muted)',   fg: 'var(--color-primary)' },
  rent:            { bg: 'var(--color-primary-muted)',   fg: 'var(--color-primary)' },
  utilities:       { bg: 'var(--color-surface-raised)',  fg: 'var(--color-foreground-muted)' },
  propsSets:       { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  props:           { bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
  marketing:       { bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  misc:            { bg: 'var(--color-surface-raised)',  fg: 'var(--color-foreground-muted)' },
  salaries:        { bg: 'var(--color-primary-muted)',   fg: 'var(--color-primary)' },
}

const LABELS: Record<string, string> = {
  preProduction:  'Pre-Prod',
  postProduction: 'Post-Prod',
  eventDay:       'Event Day',
  inquiry:        'Inquiry',
  inProgress:     'In Progress',
  todo:           'To Do',
  review:         'In Review',
  done:           'Done',
  in:             'In',
  notIn:          'Not in',
  // Equipment
  available:      'Available',
  out:            'Out',
  service:        'Service',
  maintenance:    'Maintenance',
  repair:         'Under Repair',
  underRepair:    'Under Repair',
  damaged:        'Damaged',
  lost:           'Lost',
  retired:        'Retired',
  // Time Logs
  flagged:        'Flagged',
  clean:          'Clean',
  corrected:      'Corrected',
  // Attendance
  present:        'P',
  late:           'L',
  halfDay:        'H',
  leave:          'LV',
  absent:         'AB',
  pending:        'Pending',
  weekOff:        'WO',
  permission:     'PR',
  // Expenses Categories
  equipment:      'Equipment',
  freelancer:     'Freelancer',
  travel:         'Travel',
  studioRent:     'Studio rent',
  rent:           'Studio rent',
  utilities:      'Utilities',
  propsSets:      'Props & sets',
  props:          'Props & sets',
  marketing:      'Marketing',
  misc:           'Misc',
  salaries:       'Salaries',
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
