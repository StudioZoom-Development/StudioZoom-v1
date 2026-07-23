'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'    // MyDesignSystem.ShadcnButton
import { useAuthStore } from '@/store/authStore'
import { subscribeToClients, softDeleteClient } from '@/lib/firebase/queries/clients'
import { Badge } from '@/components/shared/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { Client } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────
const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: 'Wedding', preWedding: 'Pre-Wedding', engagement: 'Engagement',
  corporate: 'Corporate', portrait: 'Portrait', studio: 'Studio', other: 'Other',
}

// Exact select style from design file
const SELECT_STYLE: React.CSSProperties = {
  fontFamily:   'var(--font-inter)',
  height:       '36px',
  background:   'var(--color-surface-raised)',
  border:       '0.5px solid var(--color-border)',
  borderRadius: '8px',
  padding:      '0 10px',
  fontSize:     'var(--text-sm)',
  color:        'var(--color-foreground-muted)',
  outline:      'none',
  cursor:       'pointer',
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function ClientsPage() {
  const router  = useRouter()
  const appUser = useAuthStore(s => s.appUser)

  const [clients,      setClients]      = useState<Client[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [filterStage,  setFilterStage]  = useState('')
  const [filterPmt,    setFilterPmt]    = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  const [deleting,     setDeleting]     = useState(false)
  const [page,         setPage]         = useState(1)
  const PAGE_SIZE = 9

  useEffect(() => {
    setLoading(true)
    const unsub = subscribeToClients(
      { eventType: filterType || undefined, paymentStatus: filterPmt || undefined },
      data => { setClients(data); setLoading(false); setPage(1) }
    )
    return unsub
  }, [filterType, filterPmt])

  // Client-side search + stage filter
  const filtered = clients.filter(c =>
    (!search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.eventName?.toLowerCase().includes(search.toLowerCase()) ||
      c.contact?.includes(search)) &&
    (!filterStage || c.status === filterStage)
  )

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || !appUser) return
    setDeleting(true)
    await softDeleteClient(deleteTarget.clientId, appUser.uid)
    setDeleting(false)
    setDeleteTarget(null)
  }, [deleteTarget, appUser])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── Filter bar (exact from design-components/ScreenClients_dc.html) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

        {/* Search with icon prefix */}
        <div style={{ position: 'relative' }}>
          <i className="ti ti-search" style={{
            fontSize: '15px', color: 'var(--color-foreground-subtle)',
            position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search clients"
            style={{
              fontFamily: 'var(--font-inter)', width: '200px', boxSizing: 'border-box',
              height: '36px', background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)', borderRadius: '8px',
              padding: '0 12px 0 30px', fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)', outline: 'none',
            }}
          />
        </div>

        {/* Event type · All (exact label from design) */}
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={SELECT_STYLE}>
          <option value="">Event type · All</option>
          <option value="wedding">Wedding</option>
          <option value="engagement">Engagement</option>
          <option value="corporate">Corporate</option>
          <option value="portrait">Portrait</option>
          <option value="preWedding">Pre-Wedding</option>
          <option value="studio">Studio</option>
        </select>

        {/* Stage · All */}
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)} style={SELECT_STYLE}>
          <option value="">Stage · All</option>
          <option value="booked">Booked</option>
          <option value="planning">Planning</option>
          <option value="preProduction">Pre-Prod</option>
          <option value="eventDay">Event Day</option>
          <option value="postProduction">Post-Prod</option>
          <option value="delivered">Delivered</option>
        </select>

        {/* Payment · All */}
        <select value={filterPmt} onChange={e => setFilterPmt(e.target.value)} style={SELECT_STYLE}>
          <option value="">Payment · All</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Overdue</option>
        </select>

        <div style={{ flex: 1 }} />

        {/* ShadcnButton → shadcn Button (MyDesignSystem.ShadcnButton) */}
        <Button className="h-9 font-medium" onClick={() => router.push('/clients/new')}>
          ＋ New client
        </Button>
      </div>

      {/* ── Table container (exact from design) ── */}
      <div style={{
        background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
        borderRadius: '12px', overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr>
              {['#', 'Client', 'Event type', 'Event date', 'Stage', 'Balance due', 'Assigned', ''].map((h, i) => (
                <th key={i} style={{
                  textAlign:     i === 5 ? 'right' : 'left',
                  fontSize:      'var(--text-xs)',
                  fontWeight:    600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color:         'var(--color-foreground-subtle)',
                  padding:       '12px 16px',
                  borderBottom:  '0.5px solid var(--color-border-strong)',
                  whiteSpace:    'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton rows={6} cols={8} />
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    icon="ti-users"
                    title="No clients yet"
                    description="Add your first booking to get started"
                    action={{ label: '＋ New client', onClick: () => router.push('/clients/new') }}
                  />
                </td>
              </tr>
            ) : (
              paginated.map((client, idx) => (
                <ClientRow
                  key={client.clientId}
                  client={client}
                  rowNo={(page - 1) * PAGE_SIZE + idx + 1}
                  onView={() => router.push(`/clients/${client.clientId}`)}
                  onEdit={() => router.push(`/clients/${client.clientId}/edit`)}
                  onDelete={() => setDeleteTarget(client)}
                />
              ))
            )}
          </tbody>
        </table>

        {/* Pagination footer (exact from design) */}
        {!loading && filtered.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
          }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} clients
            </span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <span
                  key={p} onClick={() => setPage(p)}
                  style={{
                    width: '28px', height: '28px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    borderRadius: '6px', cursor: 'pointer',
                    fontSize: 'var(--text-xs)', fontWeight: p === page ? 600 : 400,
                    background: p === page ? 'var(--color-primary-muted)' : 'transparent',
                    color: p === page ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                  }}
                >{p}</span>
              ))}
              {page < totalPages && (
                <span onClick={() => setPage(p => p + 1)} style={{
                  width: '28px', height: '28px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  borderRadius: '6px', cursor: 'pointer',
                  color: 'var(--color-foreground-muted)', fontSize: 'var(--text-xs)',
                }}>▸</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmModal
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.name ?? 'client'}?`}
        description="This will remove the client and their booking. This action cannot be undone."
        confirmLabel="Delete client"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}

function getInitials(name: string) {
  if (!name) return ''
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// ── Client row (exact structure from design file) ─────────────────────────
function ClientRow({ client, rowNo, onView, onEdit, onDelete }: {
  client:   Client
  rowNo:    number
  onView:   () => void
  onEdit:   () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  const isPastEvent = client.eventDate instanceof Date && client.eventDate < new Date()
  const isPaid      = client.paymentStatus === 'paid' || client.balanceDue === 0
  const isPartial   = client.paymentStatus === 'partial'
  const isUnpaid    = client.paymentStatus === 'unpaid'

  let balColor = 'var(--color-foreground)'
  if (isPaid) {
    balColor = 'var(--color-foreground-muted)'
  } else if (isPartial) {
    balColor = 'var(--color-foreground)'
  } else if (isUnpaid && isPastEvent) {
    balColor = 'var(--color-danger)'
  } else {
    balColor = 'var(--color-foreground)'
  }

  const balLabel = isPaid ? '—' : `₹${client.balanceDue.toLocaleString('en-IN')}`

  // Staff avatars
  const staffList: string[] = (client.teamInitials || client.assignedStaff || client.staffUids || [])

  // TD shared style
  const td: React.CSSProperties = {
    padding: '0 16px', height: '48px',
    borderBottom: '0.5px solid var(--color-border)',
  }

  return (
    <tr
      onClick={onView} style={{ cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* # zero-padded */}
      <td style={{ ...td, color: 'var(--color-foreground-subtle)', width: '48px' }}>
        {String(rowNo).padStart(2, '0')}
      </td>

      {/* Client column: primary eventName, secondary name */}
      <td style={{ ...td }}>
        <div style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
          {client.eventName || client.name}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
          {client.name}
        </div>
      </td>

      {/* Event type */}
      <td style={{ ...td, color: 'var(--color-foreground-muted)' }}>
        {EVENT_TYPE_LABELS[client.eventType] ?? client.eventType}
      </td>

      {/* Event date */}
      <td style={{ ...td, color: 'var(--color-foreground-muted)', whiteSpace: 'nowrap' }}>
        {client.eventDate instanceof Date ? format(client.eventDate, 'd MMM yyyy') : '—'}
      </td>

      {/* Stage badge (exact from design) */}
      <td style={td}>
        <Badge variant={client.status} />
      </td>

      {/* Balance due */}
      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: balColor }}>
        {balLabel}
      </td>

      {/* Assigned — avatar stack (empty if no staff assigned) */}
      <td style={td}>
        {staffList.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {staffList.slice(0, 3).map((staff, i) => {
              const initials = staff.length <= 2 ? staff.toUpperCase() : getInitials(staff)
              return (
                <div
                  key={i}
                  style={{
                    width: '26px', height: '26px', borderRadius: '50%',
                    background: 'var(--color-surface-overlay)',
                    border: '2px solid var(--color-surface)',
                    color: 'var(--color-foreground-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', fontWeight: 700,
                    marginLeft: i === 0 ? '0' : '-8px',
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>
              )
            })}
          </div>
        )}
      </td>

      {/* Actions — ti-dots-vertical + dropdown */}
      <td
        onClick={e => e.stopPropagation()}
        style={{ ...td, textAlign: 'right', color: 'var(--color-foreground-subtle)', position: 'relative' }}
      >
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-foreground-subtle)', padding: '4px 8px', borderRadius: '6px',
          }}
        >
          <i className="ti ti-dots-vertical" style={{ fontSize: '16px' }} />
        </button>

        {menuOpen && (
          <div
            onMouseLeave={() => setMenuOpen(false)}
            style={{
              position: 'absolute', right: '8px', top: '44px', zIndex: 20,
              background: 'var(--color-surface-overlay)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '10px', overflow: 'hidden', minWidth: '140px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}
          >
            {[
              { icon: 'ti-eye',    label: 'View',   action: onView,   danger: false },
              { icon: 'ti-pencil', label: 'Edit',   action: onEdit,   danger: false },
              { icon: 'ti-trash',  label: 'Delete', action: onDelete, danger: true  },
            ].map(item => (
              <div
                key={item.label} onClick={item.action}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 14px', cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  color: item.danger ? 'var(--color-danger)' : 'var(--color-foreground)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <i className={`ti ${item.icon}`} style={{ fontSize: '15px' }} />
                {item.label}
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}
