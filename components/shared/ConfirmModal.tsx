'use client'
import { useEffect } from 'react'

interface ConfirmModalProps {
  open:         boolean
  title:        string
  description:  string
  confirmLabel?: string
  onConfirm:    () => void
  onCancel:     () => void
  loading?:     boolean
}

export function ConfirmModal({
  open, title, description,
  confirmLabel = 'Delete',
  onConfirm, onCancel, loading,
}: ConfirmModalProps) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    if (open) document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '420px', background: 'var(--color-surface-overlay)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '16px', padding: '28px',
        display: 'flex', flexDirection: 'column', gap: '20px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)',
            lineHeight: 1.6 }}>{description}</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            height: '36px', padding: '0 16px', borderRadius: '8px', cursor: 'pointer',
            background: 'transparent', border: '0.5px solid var(--color-border)',
            color: 'var(--color-foreground)', fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-inter)',
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{
            height: '36px', padding: '0 16px', borderRadius: '8px', cursor: 'pointer',
            background: 'var(--color-danger-muted)', border: '0.5px solid var(--color-danger)',
            color: 'var(--color-danger)', fontSize: 'var(--text-sm)', fontWeight: 500,
            fontFamily: 'var(--font-inter)', opacity: loading ? 0.6 : 1,
          }}>{loading ? 'Deleting…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
