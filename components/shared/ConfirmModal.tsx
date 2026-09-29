'use client'

import { useEffect } from 'react'

interface ConfirmModalProps {
  open:          boolean
  title:         string
  description:   string
  confirmLabel?: string
  cancelLabel?:  string
  variant?:      'danger' | 'primary'
  onConfirm:     () => void
  onCancel:      () => void
  loading?:      boolean
  zIndex?:       number
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
  loading,
  zIndex = 70,
}: ConfirmModalProps) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    if (open) document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [open, onCancel])

  if (!open) return null

  const isPrimary = variant === 'primary'

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-2xl flex flex-col gap-5 p-5 md:p-6 shadow-2xl"
        style={{
          background: 'var(--color-surface-overlay)',
          border: '0.5px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{title}</div>
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground-muted)',
              lineHeight: 1.6,
            }}
          >
            {description}
          </div>
        </div>

        <div className="flex flex-col-reverse md:flex-row justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="w-full md:w-auto h-10 md:h-9 px-4 rounded-lg cursor-pointer bg-transparent border border-[var(--color-border)] text-[var(--color-foreground)] text-sm font-sans"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="w-full md:w-auto h-10 md:h-9 px-4 rounded-lg cursor-pointer text-sm font-medium font-sans transition-opacity"
            style={{
              background: isPrimary ? 'var(--color-primary-muted)' : 'var(--color-danger-muted)',
              border: `0.5px solid ${isPrimary ? 'var(--color-primary)' : 'var(--color-danger)'}`,
              color: isPrimary ? 'var(--color-primary)' : 'var(--color-danger)',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
