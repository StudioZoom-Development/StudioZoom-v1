import type { ProjectStage, ProjectStatus, PaymentStatus, WorkItemStatus, CheckoutStatus, AttendanceStatus } from '@/types'

type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'accent' | 'purple' | 'muted'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  size?: 'sm' | 'md'
}

const VARIANT_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  primary: { background: 'var(--color-primary-muted)', color: 'var(--color-primary)' },
  success: { background: 'var(--color-success-muted)', color: 'var(--color-success)' },
  warning: { background: 'var(--color-warning-muted)', color: 'var(--color-warning)' },
  danger:  { background: 'var(--color-danger-muted)',  color: 'var(--color-danger)' },
  accent:  { background: 'var(--color-accent-muted)',  color: 'var(--color-accent)' },
  purple:  { background: 'var(--color-purple-muted)',  color: 'var(--color-purple)' },
  muted:   { background: 'var(--color-surface-raised)',color: 'var(--color-foreground-muted)' },
}

export function Badge({ children, variant = 'muted', size = 'md' }: BadgeProps) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: size === 'sm' ? '1px 6px' : '2px 8px',
      borderRadius: '10px',
      fontSize: size === 'sm' ? 'var(--text-xs)' : 'var(--text-xs)',
      fontWeight: 600,
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
      ...VARIANT_STYLES[variant],
    }}>
      {children}
    </span>
  )
}

// ── Domain-specific badge helpers ────────────────────────────────────────

const STAGE_CONFIG: Record<ProjectStage, { label: string; variant: BadgeVariant }> = {
  booked:         { label: 'Booked',          variant: 'accent'   },
  planning:       { label: 'Planning',         variant: 'purple'   },
  preProduction:  { label: 'Pre-Production',   variant: 'warning'  },
  eventDay:       { label: 'Event Day',        variant: 'primary'  },
  postProduction: { label: 'Post-Production',  variant: 'warning'  },
  delivered:      { label: 'Delivered',        variant: 'success'  },
}

const PAYMENT_CONFIG: Record<PaymentStatus, { label: string; variant: BadgeVariant }> = {
  unpaid:  { label: 'Unpaid',   variant: 'danger'  },
  partial: { label: 'Partial',  variant: 'warning' },
  paid:    { label: 'Paid',     variant: 'success' },
}

const WORK_STATUS_CONFIG: Record<WorkItemStatus, { label: string; variant: BadgeVariant }> = {
  todo:       { label: 'To Do',      variant: 'muted'   },
  inProgress: { label: 'In Progress',variant: 'accent'  },
  review:     { label: 'Review',     variant: 'warning' },
  done:       { label: 'Done',       variant: 'success' },
}

const CHECKOUT_CONFIG: Record<CheckoutStatus, { label: string; variant: BadgeVariant }> = {
  out:      { label: 'Out',      variant: 'primary' },
  returned: { label: 'Returned', variant: 'success' },
  overdue:  { label: 'Overdue',  variant: 'danger'  },
}

const ATTENDANCE_CONFIG: Record<AttendanceStatus, { label: string; variant: BadgeVariant }> = {
  P:          { label: 'Present',    variant: 'success' },
  Late:       { label: 'Late',       variant: 'warning' },
  HalfDay:    { label: 'Half Day',   variant: 'accent'  },
  AB:         { label: 'Absent',     variant: 'danger'  },
  WO:         { label: 'Week Off',   variant: 'muted'   },
  Permission: { label: 'Permission', variant: 'purple'  },
}

export function StageBadge({ stage }: { stage: ProjectStage }) {
  const { label, variant } = STAGE_CONFIG[stage]
  return <Badge variant={variant}>{label}</Badge>
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const { label, variant } = PAYMENT_CONFIG[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function WorkStatusBadge({ status }: { status: WorkItemStatus }) {
  const { label, variant } = WORK_STATUS_CONFIG[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function CheckoutBadge({ status }: { status: CheckoutStatus }) {
  const { label, variant } = CHECKOUT_CONFIG[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const { label, variant } = ATTENDANCE_CONFIG[status]
  return <Badge variant={variant} size="sm">{label}</Badge>
}
