'use client'
import { useEffect, useRef } from 'react'

interface ConfirmModalProps {
  open:        boolean
  title:       string
  description: string
  confirmText?: string
  cancelText?:  string
  variant?:     'danger' | 'warning'
  onConfirm:   () => void
  onCancel:    () => void
  loading?:    boolean
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmText = 'Confirm',
  cancelText  = 'Cancel',
  variant     = 'danger',
  onConfirm,
  onCancel,
  loading     = false,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus the cancel button on open (safer default)
  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open) return null

  const confirmColor = variant === 'danger'
    ? 'var(--color-danger)'
    : 'var(--color-warning)'
  const confirmBg = variant === 'danger'
    ? 'var(--color-danger-muted)'
    : 'var(--color-warning-muted)'

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(2px)',
        }}
      />
      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)', zIndex: 101,
          width: '100%', maxWidth: '400px',
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '16px', padding: '24px',
          display: 'flex', flexDirection: 'column', gap: '20px',
        }}
      >
        {/* Icon + title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: confirmBg, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0,
          }}>
            <i
              className={`ti ${variant === 'danger' ? 'ti-alert-triangle' : 'ti-alert-circle'}`}
              style={{ fontSize: '22px', color: confirmColor }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div id="confirm-title" style={{
              fontSize: 'var(--text-base)', fontWeight: 600,
              color: 'var(--color-foreground)',
            }}>{title}</div>
            <div style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground-muted)',
              lineHeight: 1.5,
            }}>{description}</div>
          </div>
        </div>
        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={loading}
            style={{
              height: '36px', padding: '0 16px', borderRadius: '8px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground-muted)',
              fontSize: 'var(--text-sm)', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'var(--font-inter)',
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              height: '36px', padding: '0 16px', borderRadius: '8px',
              background: confirmBg,
              border: `0.5px solid ${confirmColor}`,
              color: confirmColor,
              fontSize: 'var(--text-sm)', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-inter)',
              opacity: loading ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {loading && <i className="ti ti-loader-2" style={{ fontSize: '14px', animation: 'spin 0.8s linear infinite' }} />}
            {confirmText}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
