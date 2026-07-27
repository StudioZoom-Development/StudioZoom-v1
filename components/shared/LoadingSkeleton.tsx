export function Skeleton({ width = '100%', height = '14px', radius = '6px' }:
  { width?: string; height?: string; radius?: string }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'var(--color-surface-raised)',
      animation: 'skeleton-pulse 1.5s ease-in-out infinite',
    }}>
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 1 }
          50%       { opacity: 0.4 }
        }
      `}</style>
    </div>
  )
}

export function TableRowSkeleton({ rows = 6, cols = 8 }: { rows?: number; cols?: number }) {
  const widths = ['40px', '140px', '100px', '90px', '80px', '80px', '50px', '40px']
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} style={{
              padding: '0 16px', height: '48px',
              borderBottom: '0.5px solid var(--color-border)',
            }}>
              <Skeleton width={widths[j] ?? '80px'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

interface LoadingSkeletonProps {
  lines?:  number
  height?: string
  gap?:    string
}

export function LoadingSkeleton({ lines = 3, height = '14px', gap = '10px' }: LoadingSkeletonProps) {
  const widths = ['100%', '85%', '70%', '90%', '60%']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} height={height} />
      ))}
    </div>
  )
}
