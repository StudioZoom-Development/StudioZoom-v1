import React from 'react'

export interface Column<T> {
  key:       keyof T | string
  header:    string
  width?:    string
  align?:    'left' | 'center' | 'right'
  render?:   (row: T) => React.ReactNode
}

interface DataTableProps<T extends { id?: string }> {
  columns:    Column<T>[]
  data:       T[]
  onRowClick?: (row: T) => void
  loading?:   boolean
  emptyText?: string
  keyField?:  keyof T
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  loading = false,
  emptyText = 'No data found',
  keyField = 'id' as keyof T,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div style={{
        background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
        borderRadius: '12px', overflow: 'hidden',
      }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{
            height: '52px', borderBottom: '0.5px solid var(--color-border)',
            padding: '0 16px', display: 'flex', alignItems: 'center', gap: '16px',
          }}>
            <div style={{
              height: '12px', width: `${60 + (i * 20 % 80)}px`, borderRadius: '6px',
              background: 'var(--color-surface-raised)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          </div>
        ))}
      </div>
    )
  }

  if (!data.length) {
    return (
      <div style={{
        background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
        borderRadius: '12px', padding: '48px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-foreground-muted)', fontSize: 'var(--text-sm)',
      }}>
        {emptyText}
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
      borderRadius: '12px', overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{
              background: 'var(--color-surface-raised)',
              borderBottom: '0.5px solid var(--color-border)',
            }}>
              {columns.map(col => (
                <th key={String(col.key)} style={{
                  padding: '10px 16px',
                  fontSize: 'var(--text-xs)', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: 'var(--color-foreground-subtle)',
                  textAlign: col.align ?? 'left',
                  whiteSpace: 'nowrap',
                  width: col.width,
                }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr
                key={String(row[keyField]) ?? idx}
                onClick={() => onRowClick?.(row)}
                style={{
                  borderBottom: idx < data.length - 1 ? '0.5px solid var(--color-border)' : 'none',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => {
                  if (onRowClick) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-raised)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                {columns.map(col => (
                  <td key={String(col.key)} style={{
                    padding: '12px 16px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground)',
                    textAlign: col.align ?? 'left',
                    verticalAlign: 'middle',
                  }}>
                    {col.render
                      ? col.render(row)
                      : String(row[col.key as keyof T] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
