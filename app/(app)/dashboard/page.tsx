export default function DashboardPage() {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{
        fontSize: 'var(--text-xs)', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--color-foreground-subtle)', marginBottom: '24px',
      }}>
        Dashboard
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '16px', marginBottom: '24px',
      }}>
        {['Events This Month', 'Active Projects', 'Staff On Duty', 'Revenue MTD'].map((label, i) => (
          <div key={label} style={{
            background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
            borderRadius: '12px', padding: '20px',
            display: 'flex', flexDirection: 'column', gap: '10px',
          }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-foreground)' }}>—</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>Connect Firebase to load data</span>
          </div>
        ))}
      </div>
      <div style={{
        background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
        borderRadius: '12px', padding: '32px', textAlign: 'center',
      }}>
        <i className="ti ti-check-circle" style={{ fontSize: '40px', color: 'var(--color-success)', marginBottom: '12px', display: 'block' }} />
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-foreground)', marginBottom: '8px' }}>Foundation build complete ✓</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>Auth, routing, theme, and all components are ready. Feature screens to follow.</div>
      </div>
    </div>
  )
}
