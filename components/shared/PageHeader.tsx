interface PageHeaderProps {
  title:       string
  subtitle?:   string
  actions?:    React.ReactNode
  breadcrumb?: { label: string; href?: string }[]
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: '16px', flexWrap: 'wrap',
      marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {breadcrumb && breadcrumb.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)',
            marginBottom: '2px',
          }}>
            {breadcrumb.map((crumb, idx) => (
              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {idx > 0 && <i className="ti ti-chevron-right" style={{ fontSize: '12px' }} />}
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    style={{
                      color: 'var(--color-foreground-muted)',
                      textDecoration: 'none',
                      fontWeight: 500,
                    }}
                  >{crumb.label}</a>
                ) : (
                  <span style={{ color: 'var(--color-foreground-muted)', fontWeight: 500 }}>
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
        <h1 style={{
          margin: 0,
          fontSize: 'var(--text-xl)', fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--color-foreground)',
        }}>{title}</h1>
        {subtitle && (
          <p style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            color: 'var(--color-foreground-muted)',
          }}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  )
}

// ── Reusable action button style ──────────────────────────────────────────
interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  icon?:    string
  size?:    'sm' | 'md'
}

export function ActionButton({
  children, variant = 'primary', icon, size = 'md',
  style, ...props
}: ActionButtonProps) {
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--color-primary)', color: '#ffffff',
      border: 'none',
    },
    secondary: {
      background: 'var(--color-surface-raised)', color: 'var(--color-foreground)',
      border: '0.5px solid var(--color-border)',
    },
    ghost: {
      background: 'transparent', color: 'var(--color-foreground-muted)',
      border: '0.5px solid var(--color-border)',
    },
  }

  return (
    <button
      {...props}
      style={{
        height: size === 'sm' ? '32px' : '36px',
        padding: size === 'sm' ? '0 12px' : '0 16px',
        borderRadius: '8px',
        fontSize: 'var(--text-sm)', fontWeight: 600,
        cursor: 'pointer', fontFamily: 'var(--font-inter)',
        display: 'flex', alignItems: 'center', gap: '6px',
        transition: 'opacity 0.15s',
        ...styles[variant],
        ...style,
      }}
    >
      {icon && <i className={`ti ${icon}`} style={{ fontSize: '16px' }} />}
      {children}
    </button>
  )
}
