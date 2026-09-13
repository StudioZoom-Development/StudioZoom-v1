'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/shared/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { BookingDraft } from '@/types'
import { subscribeToDrafts, deleteBookingDraft } from '@/lib/firebase/queries/drafts'

export default function DraftsPage() {
  const router = useRouter()
  const [drafts, setDrafts] = useState<BookingDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<BookingDraft | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const unsub = subscribeToDrafts(list => {
      setDrafts(list)
      setLoading(false)
    })
    return unsub
  }, [])

  const filtered = drafts.filter(d =>
    !search ||
    d.clientName?.toLowerCase().includes(search.toLowerCase()) ||
    d.eventName?.toLowerCase().includes(search.toLowerCase()) ||
    d.name?.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await deleteBookingDraft(deleteTarget.draftId)
    setDeleting(false)
    setDeleteTarget(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'var(--font-inter)' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            onClick={() => router.push('/clients')}
            style={{ cursor: 'pointer', color: 'var(--color-foreground-muted)', display: 'flex' }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
          </span>
          <div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-foreground)' }}>
              Booking Drafts
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
              Manage and resume incomplete booking wizard sessions
            </div>
          </div>
        </div>

        <Button onClick={() => router.push('/clients/new')}>
          ＋ New booking
        </Button>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              width: '240px',
              height: '36px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '8px',
              padding: '0 12px 0 32px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)',
              outline: 'none',
              fontFamily: 'var(--font-inter)',
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr>
              {['Draft / Client', 'Event', 'Progress', 'Package Amount', 'Last Saved', 'Actions'].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: i === 5 ? 'right' : 'left',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    padding: '12px 16px',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton rows={4} cols={6} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon="ti-files"
                    title="No saved drafts"
                    description="When you click 'Save as draft' in the booking wizard, your progress will be saved here."
                    action={{ label: '＋ New booking', onClick: () => router.push('/clients/new') }}
                  />
                </td>
              </tr>
            ) : (
              filtered.map(draft => (
                <tr
                  key={draft.draftId}
                  onClick={() => router.push(`/clients/new?draftId=${draft.draftId}`)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                    {draft.clientName || 'Untitled Client'}
                  </td>
                  <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)', color: 'var(--color-foreground-muted)' }}>
                    {draft.eventName || draft.eventType || '—'}
                  </td>
                  <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)' }}>
                    <Badge variant="planning" label={`Step ${(draft.currentStep ?? 0) + 1} of 6`} />
                  </td>
                  <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)', color: 'var(--color-foreground)' }}>
                    {draft.totalAmount ? `₹${draft.totalAmount.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)', color: 'var(--color-foreground-muted)', whiteSpace: 'nowrap' }}>
                    {draft.updatedAt instanceof Date ? format(draft.updatedAt, 'd MMM yyyy, h:mm a') : '—'}
                  </td>
                  <td
                    onClick={e => e.stopPropagation()}
                    style={{ padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--color-border)', textAlign: 'right' }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        onClick={() => router.push(`/clients/new?draftId=${draft.draftId}`)}
                        style={{
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          color: 'var(--color-primary)',
                          background: 'var(--color-primary-muted)',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        Resume →
                      </span>
                      <button
                        onClick={() => setDeleteTarget(draft)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-foreground-subtle)',
                          cursor: 'pointer',
                          padding: '4px 6px',
                          borderRadius: '6px',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-foreground-subtle)')}
                      >
                        <i className="ti ti-trash" style={{ fontSize: '15px' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title={`Delete draft for ${deleteTarget?.clientName || 'this booking'}?`}
        description="This will permanently delete this saved draft. This action cannot be undone."
        confirmLabel="Delete draft"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
