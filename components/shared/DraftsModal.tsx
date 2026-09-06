'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { BookingDraft } from '@/types'
import { subscribeToDrafts, deleteBookingDraft } from '@/lib/firebase/queries/drafts'
import { Badge } from '@/components/shared/Badge'
import { EmptyState } from '@/components/shared/EmptyState'

interface DraftsModalProps {
  open:          boolean
  onClose:       () => void
  onSelectDraft: (draft: BookingDraft) => void
}

export function DraftsModal({ open, onClose, onSelectDraft }: DraftsModalProps) {
  const [drafts, setDrafts] = useState<BookingDraft[]>([])
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const unsub = subscribeToDrafts(list => {
      setDrafts(list)
    })
    return unsub
  }, [open])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [open, onClose])

  if (!open) return null

  const filtered = drafts.filter(d =>
    !search ||
    d.clientName?.toLowerCase().includes(search.toLowerCase()) ||
    d.eventName?.toLowerCase().includes(search.toLowerCase()) ||
    d.name?.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async (e: React.MouseEvent, draftId: string) => {
    e.stopPropagation()
    setDeletingId(draftId)
    await deleteBookingDraft(draftId)
    setDeletingId(null)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'var(--font-inter)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '580px',
          maxHeight: '80vh',
          background: 'var(--color-surface-overlay)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '0.5px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 700,
              color: 'var(--color-foreground)',
              letterSpacing: '-0.02em',
            }}>
              Saved Booking Drafts
            </div>
            <div style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-foreground-muted)',
              marginTop: '2px',
            }}>
              Resume incomplete wizard sessions or delete outdated drafts
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-foreground-muted)',
              cursor: 'pointer',
              fontSize: '20px',
              padding: '4px',
              display: 'flex',
            }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 24px', borderBottom: '0.5px solid var(--color-border)' }}>
          <div style={{ position: 'relative' }}>
            <i
              className="ti ti-search"
              style={{
                position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
                color: 'var(--color-foreground-subtle)', fontSize: '15px',
              }}
            />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search drafts..."
              style={{
                width: '100%',
                height: '36px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                padding: '0 12px 0 32px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
                fontFamily: 'var(--font-inter)',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Drafts List */}
        <div style={{ overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '30px 0' }}>
              <EmptyState
                icon="ti-files"
                title="No saved drafts"
                description={search ? "No drafts match your search query." : "Save a draft in the booking wizard to resume later."}
              />
            </div>
          ) : (
            filtered.map(draft => (
              <div
                key={draft.draftId}
                onClick={() => onSelectDraft(draft)}
                style={{
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--color-surface-raised)'
                  e.currentTarget.style.borderColor = 'var(--color-primary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--color-surface)'
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-foreground)' }}>
                      {draft.clientName || 'Untitled Client'}
                    </span>
                    {draft.eventName && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                        · {draft.eventName}
                      </span>
                    )}
                    <Badge variant="planning" label={`Step ${(draft.currentStep ?? 0) + 1}/6`} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    <span>Event: {draft.eventType || 'Wedding'}</span>
                    {draft.totalAmount > 0 && <span>₹{draft.totalAmount.toLocaleString('en-IN')}</span>}
                    <span>
                      Saved {draft.updatedAt instanceof Date ? format(draft.updatedAt, 'd MMM, h:mm a') : 'recently'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      color: 'var(--color-primary)',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: 'var(--color-primary-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Resume →
                  </span>

                  <button
                    disabled={deletingId === draft.draftId}
                    onClick={e => handleDelete(e, draft.draftId)}
                    title="Delete Draft"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-foreground-subtle)',
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-foreground-subtle)')}
                  >
                    <i className="ti ti-trash" style={{ fontSize: '15px' }} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '0.5px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: '0.5px solid var(--color-border)',
              background: 'transparent',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)',
              cursor: 'pointer',
              fontFamily: 'var(--font-inter)',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
