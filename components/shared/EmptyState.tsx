interface EmptyStateProps {
  icon?:        string
  title:        string
  description?: string
  action?:      React.ReactNode
}

export function EmptyState({ icon = 'ti-inbox', title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '64px 24px', gap: '16px',
      textAlign: 'center',
    }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '16px',
        background: 'var(--color-surface-raised)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <i className={`ti ${icon}`} style={{
          fontSize: '32px',
          color: 'var(--color-foreground-subtle)',
        }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{
          fontSize: 'var(--text-base)', fontWeight: 600,
          color: 'var(--color-foreground)',
        }}>{title}</div>
        {description && (
          <div style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-foreground-muted)',
            maxWidth: '320px',
          }}>{description}</div>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
