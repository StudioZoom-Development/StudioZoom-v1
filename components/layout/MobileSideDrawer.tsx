'use client'
import { useEffect } from 'react'

interface MobileSideDrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: React.ReactNode
}

export function MobileSideDrawer({ isOpen, onClose, title, subtitle, children }: MobileSideDrawerProps) {
  // Lock background body scrolling when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 90,
          animation: 'sideDrawerFadeIn 0.2s ease',
        }}
      />

      {/* Left Slide-In Drawer Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          width: 'min(320px, 85vw)',
          background: 'var(--color-surface)',
          borderRight: '0.5px solid var(--color-border-strong)',
          boxShadow: '8px 0 32px rgba(0, 0, 0, 0.5)',
          zIndex: 95,
          display: 'flex',
          flexDirection: 'column',
          animation: 'sideDrawerSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: '0.5px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}
        >
          <div>
            {title && (
              <div
                style={{
                  fontSize: 'var(--text-lg)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: 'var(--color-foreground)',
                }}
              >
                {title}
              </div>
            )}
            {subtitle && (
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground-muted)',
                  marginTop: '2px',
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
            }}
            title="Close"
          >
            <i className="ti ti-x" style={{ fontSize: '16px' }} />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </div>
      </div>

      <style>{`
        @keyframes sideDrawerFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes sideDrawerSlideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}
