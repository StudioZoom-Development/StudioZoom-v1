interface LoadingSkeletonProps {
  lines?:  number
  height?: string
  gap?:    string
}

/** Single shimmer bar */
function ShimmerBar({ width = '100%', height = '14px' }: { width?: string; height?: string }) {
  return (
    <div style={{
      height, width, borderRadius: '6px',
      background: 'var(--color-surface-raised)',
      animation: 'szShimmer 1.5s ease-in-out infinite',
    }} />
  )
}

/** Multi-line text skeleton */
export function LoadingSkeleton({ lines = 3, height = '14px', gap = '10px' }: LoadingSkeletonProps) {
  const widths = ['100%', '85%', '70%', '90%', '60%']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <ShimmerBar key={i} width={widths[i % widths.length]} height={height} />
      ))}
    </div>
  )
}

/** Card-shaped skeleton */
export function CardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
          borderRadius: '12px', padding: '20px',
          display: 'flex', flexDirection: 'column', gap: '12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <ShimmerBar width="60%" height="12px" />
            <ShimmerBar width="32px" height="32px" />
          </div>
          <ShimmerBar width="40%" height="28px" />
          <ShimmerBar width="70%" height="10px" />
        </div>
      ))}
    </>
  )
}

/** Table row skeleton */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: '12px', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        height: '40px', background: 'var(--color-surface-raised)',
        borderBottom: '0.5px solid var(--color-border)',
        padding: '0 16px', display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        {[20, 30, 15, 20].map((w, i) => (
          <ShimmerBar key={i} width={`${w}%`} height="10px" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          height: '52px',
          borderBottom: i < rows - 1 ? '0.5px solid var(--color-border)' : 'none',
          padding: '0 16px', display: 'flex', alignItems: 'center', gap: '16px',
        }}>
          {[20, 30, 15, 20].map((w, j) => (
            <ShimmerBar key={j} width={`${w}%`} height="10px" />
          ))}
        </div>
      ))}
      <style>{`
        @keyframes szShimmer {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
