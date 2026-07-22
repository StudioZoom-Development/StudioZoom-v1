interface KpiCardProps {
  label:    string
  value:    string | number
  icon?:    string
  trend?:   { value: number; label: string }
  color?:   'primary' | 'success' | 'warning' | 'danger' | 'accent' | 'purple'
  loading?: boolean
}

const COLOR_MAP = {
  primary: { icon: 'var(--color-primary)', bg: 'var(--color-primary-muted)' },
  success: { icon: 'var(--color-success)', bg: 'var(--color-success-muted)' },
  warning: { icon: 'var(--color-warning)', bg: 'var(--color-warning-muted)' },
  danger:  { icon: 'var(--color-danger)',  bg: 'var(--color-danger-muted)'  },
  accent:  { icon: 'var(--color-accent)',  bg: 'var(--color-accent-muted)'  },
  purple:  { icon: 'var(--color-purple)',  bg: 'var(--color-purple-muted)'  },
}

export function KpiCard({
  label, value, icon, trend, color = 'primary', loading = false,
}: KpiCardProps) {
  const colors = COLOR_MAP[color]

  if (loading) {
    return (
      <div style={{
        background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
        borderRadius: '12px', padding: '20px',
      }}>
        <div style={{
          height: '12px', width: '80px', borderRadius: '6px',
          background: 'var(--color-surface-raised)', marginBottom: '12px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        <div style={{
          height: '28px', width: '60px', borderRadius: '6px',
          background: 'var(--color-surface-raised)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: '12px', padding: '20px',
      display: 'flex', flexDirection: 'column', gap: '12px',
      transition: 'border-color 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 'var(--text-xs)', fontWeight: 600,
          color: 'var(--color-foreground-muted)',
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>{label}</span>
        {icon && (
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <i className={`ti ${icon}`} style={{ fontSize: '18px', color: colors.icon }} />
          </div>
        )}
      </div>
      <div style={{
        fontSize: 'var(--text-2xl)', fontWeight: 700,
        letterSpacing: '-0.02em', color: 'var(--color-foreground)',
      }}>{value}</div>
      {trend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <i className={`ti ${trend.value >= 0 ? 'ti-trending-up' : 'ti-trending-down'}`}
             style={{
               fontSize: '14px',
               color: trend.value >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
             }} />
          <span style={{
            fontSize: 'var(--text-xs)', fontWeight: 500,
            color: trend.value >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
          }}>{trend.value >= 0 ? '+' : ''}{trend.value}%</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
            {trend.label}
          </span>
        </div>
      )}
    </div>
  )
}

// ── KPI grid wrapper ──────────────────────────────────────────────────────
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '16px',
    }}>
      {children}
    </div>
  )
}
