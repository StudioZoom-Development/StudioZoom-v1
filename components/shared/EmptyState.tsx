interface EmptyStateProps {
  icon?:        string   // Tabler icon e.g. "ti-users"
  title:        string
  description?: string
  action?:      { label: string; onClick: () => void }
}

export function EmptyState({ icon = 'ti-inbox', title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '64px 24px', gap: '16px', textAlign: 'center',
    }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '16px',
        background: 'var(--color-primary-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: '28px', color: 'var(--color-primary)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{title}</div>
        {description && (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)',
            maxWidth: '300px', lineHeight: 1.6 }}>{description}</div>
        )}
      </div>
      {action && (
        <button onClick={action.onClick} style={{
          height: '36px', padding: '0 16px', borderRadius: '8px',
          background: 'var(--color-primary)', color: '#ffffff',
          border: 'none', cursor: 'pointer',
          fontSize: 'var(--text-sm)', fontWeight: 500, fontFamily: 'var(--font-inter)',
        }}>{action.label}</button>
      )}
    </div>
  )
}
