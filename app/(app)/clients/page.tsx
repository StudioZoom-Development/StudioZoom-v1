'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'    // MyDesignSystem.ShadcnButton
import { useAuthStore } from '@/store/authStore'
import { subscribeToClients, softDeleteClient } from '@/lib/firebase/queries/clients'
import { Badge } from '@/components/shared/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { EditClientModal } from '@/components/shared/EditClientModal'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { Client } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────
const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: 'Wedding',
  reception: 'Reception',
  preWedding: 'Pre-Wedding',
  engagement: 'Engagement',
  birthday: 'Birthday',
  babyShower: 'Baby Shower',
  puberty: 'Puberty',
  corporate: 'Corporate',
  schoolEvent: 'School Event',
  portrait: 'Portrait',
  studio: 'Studio',
  other: 'Other',
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
  color:        'var(--color-foreground)',
  outline:      'none',
  cursor:       'pointer',
}

const DATE_INPUT_STYLE: React.CSSProperties = {
  fontFamily:   'var(--font-inter)',
  height:       '36px',
  background:   'var(--color-surface-raised)',
  border:       '0.5px solid var(--color-border)',
  borderRadius: '8px',
  padding:      '0 8px',
  fontSize:     'var(--text-sm)',
  color:        'var(--color-foreground)',
  outline:      'none',
  cursor:       'pointer',
  boxSizing:    'border-box',
}

type SortField = 'client' | 'eventType' | 'eventDate' | 'stage' | 'balanceDue'
type SortDir = 'asc' | 'desc'

interface HeaderConfig {
  label: string
  field?: SortField
  align?: 'left' | 'right'
}

const COLUMNS: HeaderConfig[] = [
  { label: '#' },
  { label: 'Client', field: 'client' },
  { label: 'Event type', field: 'eventType' },
  { label: 'Event date', field: 'eventDate' },
  { label: 'Stage', field: 'stage' },
  { label: 'Balance due', field: 'balanceDue', align: 'right' },
  { label: 'Assigned' },
  { label: '' },
]

function getPaginationItems(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', total]
  }
  if (current >= total - 3) {
    return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total]
  }
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total]
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
  const [fromDate,     setFromDate]     = useState('')
  const [toDate,       setToDate]       = useState('')
  const [sortField,    setSortField]    = useState<SortField | null>(null)
  const [sortDir,      setSortDir]      = useState<SortDir>('asc')
  const [editTarget,   setEditTarget]   = useState<Client | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  const [deleting,     setDeleting]     = useState(false)
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(10)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    const unsub = subscribeToClients(
      { eventType: filterType || undefined, paymentStatus: filterPmt || undefined },
      data => { setClients(data); setLoading(false); setPage(1) }
    )
    return unsub
  }, [filterType, filterPmt])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === 'asc') {
        setSortDir('desc')
      } else {
        setSortField(null)
        setSortDir('asc')
      }
    } else {
      setSortField(field)
      setSortDir('asc')
    }
    setPage(1)
  }

  const hasActiveFilters = Boolean(search || filterType || filterStage || filterPmt || fromDate || toDate)

  const handleResetFilters = () => {
    setSearch('')
    setFilterType('')
    setFilterStage('')
    setFilterPmt('')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  // Client-side search + stage + date range filter
  const filtered = clients.filter(c => {
    // 1. Search Query: client name, event name, event type, phone, email, client ID, location
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      const nameMatch      = (c.name || '').toLowerCase().includes(q)
      const eventNameMatch = (c.eventName || '').toLowerCase().includes(q)
      const eventTypeRaw   = (c.eventType || '').toLowerCase()
      const eventTypeLabel = (EVENT_TYPE_LABELS[c.eventType] || '').toLowerCase()
      const customTypeMatch = (c.customEventType || '').toLowerCase().includes(q)
      const contactMatch   = (c.contact || '').toLowerCase().includes(q)
      const emailMatch     = (c.email || '').toLowerCase().includes(q)
      const idMatch        = (c.clientId || '').toLowerCase().includes(q)
      const locMatch       = (c.location || '').toLowerCase().includes(q)

      if (!nameMatch && !eventNameMatch && !eventTypeRaw.includes(q) && !eventTypeLabel.includes(q) && !customTypeMatch && !contactMatch && !emailMatch && !idMatch && !locMatch) {
        return false
      }
    }

    // 2. Stage Filter
    if (filterStage) {
      const stageVal = (c.stage || c.status || '').toLowerCase()
      if (stageVal !== filterStage.toLowerCase()) return false
    }

    // 3. Date Range Filter (From Date -> To Date)
    if (fromDate || toDate) {
      const cDate = c.eventDate instanceof Date ? c.eventDate : c.eventDate ? new Date(c.eventDate) : null
      if (cDate) {
        if (fromDate) {
          const from = new Date(fromDate)
          from.setHours(0, 0, 0, 0)
          if (cDate < from) return false
        }
        if (toDate) {
          const to = new Date(toDate)
          to.setHours(23, 59, 59, 999)
          if (cDate > to) return false
        }
      } else if (fromDate || toDate) {
        return false
      }
    }

    return true
  })

  // Client-side sorting
  const sorted = [...filtered].sort((a, b) => {
    if (!sortField) return 0
    let cmp = 0
    switch (sortField) {
      case 'client': {
        const nameA = (a.eventName || a.name || '').toLowerCase()
        const nameB = (b.eventName || b.name || '').toLowerCase()
        cmp = nameA.localeCompare(nameB)
        break
      }
      case 'eventType': {
        const typeA = (a.eventType === 'other' ? a.customEventType || 'Other' : EVENT_TYPE_LABELS[a.eventType] || a.eventType || '').toLowerCase()
        const typeB = (b.eventType === 'other' ? b.customEventType || 'Other' : EVENT_TYPE_LABELS[b.eventType] || b.eventType || '').toLowerCase()
        cmp = typeA.localeCompare(typeB)
        break
      }
      case 'eventDate': {
        const timeA = a.eventDate instanceof Date ? a.eventDate.getTime() : (a.eventDate ? new Date(a.eventDate).getTime() : 0)
        const timeB = b.eventDate instanceof Date ? b.eventDate.getTime() : (b.eventDate ? new Date(b.eventDate).getTime() : 0)
        cmp = timeA - timeB
        break
      }
      case 'stage': {
        const stageA = (a.status || '').toLowerCase()
        const stageB = (b.status || '').toLowerCase()
        cmp = stageA.localeCompare(stageB)
        break
      }
      case 'balanceDue': {
        cmp = (a.balanceDue ?? 0) - (b.balanceDue ?? 0)
        break
      }
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalPages = Math.ceil(sorted.length / pageSize) || 1
  const paginated  = sorted.slice((page - 1) * pageSize, page * pageSize)

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || !appUser) return
    setDeleting(true)
    await softDeleteClient(deleteTarget.clientId, appUser.uid)
    setDeleting(false)
    setDeleteTarget(null)
  }, [deleteTarget, appUser])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

        {/* Search with icon prefix: client, event name, event type, contact */}
        <div style={{ position: 'relative' }}>
          <i className="ti ti-search" style={{
            fontSize: '15px', color: 'var(--color-foreground-subtle)',
            position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search client, event, type..."
            style={{
              fontFamily: 'var(--font-inter)', width: '220px', boxSizing: 'border-box',
              height: '36px', background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)', borderRadius: '8px',
              padding: '0 12px 0 30px', fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)', outline: 'none',
            }}
          />
        </div>

        {/* Event type · All */}
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }} style={SELECT_STYLE}>
          <option value="">Event type · All</option>
          <option value="wedding">Wedding</option>
          <option value="reception">Reception</option>
          <option value="engagement">Engagement</option>
          <option value="preWedding">Pre-Wedding</option>
          <option value="birthday">Birthday</option>
          <option value="babyShower">Baby Shower</option>
          <option value="puberty">Puberty</option>
          <option value="corporate">Corporate</option>
          <option value="schoolEvent">School Event</option>
          <option value="portrait">Portrait</option>
          <option value="studio">Studio</option>
          <option value="other">Other</option>
        </select>

        {/* Stage · All */}
        <select value={filterStage} onChange={e => { setFilterStage(e.target.value); setPage(1) }} style={SELECT_STYLE}>
          <option value="">Stage · All</option>
          <option value="booked">Booked</option>
          <option value="planning">Planning</option>
          <option value="preProduction">Pre-Prod</option>
          <option value="eventDay">Event Day</option>
          <option value="postProduction">Post-Prod</option>
          <option value="delivered">Delivered</option>
        </select>

        {/* Payment · All */}
        <select value={filterPmt} onChange={e => { setFilterPmt(e.target.value); setPage(1) }} style={SELECT_STYLE}>
          <option value="">Payment · All</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Unpaid</option>
          <option value="overdue">Overdue</option>
        </select>

        {/* Event Date Range Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-surface)', padding: '0 4px', borderRadius: '8px', border: '0.5px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500, paddingLeft: '4px' }}>From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setPage(1) }}
              style={{ ...DATE_INPUT_STYLE, border: 'none', background: 'transparent' }}
              title="Filter events from date"
            />
          </div>
          <div style={{ width: '1px', height: '20px', background: 'var(--color-border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500 }}>To:</span>
            <input
              type="date"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setPage(1) }}
              style={{ ...DATE_INPUT_STYLE, border: 'none', background: 'transparent' }}
              title="Filter events to date"
            />
          </div>
        </div>

        {/* Reset filters button */}
        {hasActiveFilters && (
          <button
            onClick={handleResetFilters}
            style={{
              height: '36px',
              padding: '0 12px',
              background: 'transparent',
              border: '0.5px solid var(--color-border)',
              borderRadius: '8px',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-foreground-muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontFamily: 'var(--font-inter)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--color-danger)'
              e.currentTarget.style.borderColor = 'var(--color-danger)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--color-foreground-muted)'
              e.currentTarget.style.borderColor = 'var(--color-border)'
            }}
          >
            <i className="ti ti-x" style={{ fontSize: '13px' }} />
            Reset
          </button>
        )}

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
              {COLUMNS.map((col, i) => {
                const isSortable = !!col.field
                const isActive   = sortField === col.field

                return (
                  <th
                    key={i}
                    onClick={() => col.field && handleSort(col.field)}
                    style={{
                      textAlign:     col.align === 'right' ? 'right' : 'left',
                      fontSize:      'var(--text-xs)',
                      fontWeight:    isActive ? 700 : 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color:         isActive ? 'var(--color-primary)' : 'var(--color-foreground-subtle)',
                      padding:       '12px 16px',
                      borderBottom:  '0.5px solid var(--color-border-strong)',
                      whiteSpace:    'nowrap',
                      cursor:        isSortable ? 'pointer' : 'default',
                      userSelect:    'none',
                      transition:    'color 0.15s ease',
                    }}
                  >
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
                      width: col.align === 'right' ? '100%' : 'auto',
                    }}>
                      <span>{col.label}</span>
                      {isSortable && (
                        <i
                          className={`ti ${
                            isActive
                              ? sortDir === 'asc'
                                ? 'ti-arrow-up'
                                : 'ti-arrow-down'
                              : 'ti-arrows-sort'
                          }`}
                          style={{
                            fontSize: '13px',
                            color: isActive ? 'var(--color-primary)' : 'var(--color-foreground-subtle)',
                            opacity: isActive ? 1 : 0.4,
                          }}
                        />
                      )}
                    </div>
                  </th>
                )
              })}
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
                  rowNo={(page - 1) * pageSize + idx + 1}
                  isNearBottom={idx >= Math.max(0, paginated.length - 2)}
                  onView={() => router.push(`/clients/${client.clientId}`)}
                  onEdit={() => setEditTarget(client)}
                  onDelete={() => setDeleteTarget(client)}
                />
              ))
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        {!loading && sorted.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', flexWrap: 'wrap', gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length} clients
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>Show:</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  style={{
                    fontFamily:   'var(--font-inter)',
                    height:       '28px',
                    background:   'var(--color-surface-raised)',
                    border:       '0.5px solid var(--color-border)',
                    borderRadius: '6px',
                    padding:      '0 8px',
                    fontSize:     'var(--text-xs)',
                    color:        'var(--color-foreground)',
                    outline:      'none',
                    cursor:       'pointer',
                  }}
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {/* Prev Button */}
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{
                  width: '28px', height: '28px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  borderRadius: '6px', cursor: page === 1 ? 'not-allowed' : 'pointer',
                  color: page === 1 ? 'var(--color-foreground-subtle)' : 'var(--color-foreground-muted)',
                  background: 'transparent', border: 'none',
                  opacity: page === 1 ? 0.4 : 1,
                  fontSize: 'var(--text-xs)',
                }}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: '13px' }} />
              </button>

              {/* Page numbers with smart ellipsis */}
              {getPaginationItems(page, totalPages).map((item, idx) => {
                if (item === 'ellipsis') {
                  return (
                    <span
                      key={`ellipsis-${idx}`}
                      style={{
                        width: '28px', height: '28px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        color: 'var(--color-foreground-subtle)', fontSize: 'var(--text-xs)',
                        userSelect: 'none',
                      }}
                    >
                      ···
                    </span>
                  )
                }

                const p = item as number
                const isActive = p === page
                return (
                  <span
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: '28px', height: '28px', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      borderRadius: '6px', cursor: 'pointer',
                      fontSize: 'var(--text-xs)',
                      fontWeight: isActive ? 600 : 400,
                      background: isActive ? 'var(--color-primary-muted)' : 'transparent',
                      color: isActive ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                      transition: 'background 0.15s ease, color 0.15s ease',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) e.currentTarget.style.background = 'var(--color-surface-raised)'
                    }}
                    onMouseLeave={e => {
                      if (!isActive) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {p}
                  </span>
                )
              })}

              {/* Next Button */}
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{
                  width: '28px', height: '28px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  borderRadius: '6px', cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  color: page === totalPages ? 'var(--color-foreground-subtle)' : 'var(--color-foreground-muted)',
                  background: 'transparent', border: 'none',
                  opacity: page === totalPages ? 0.4 : 1,
                  fontSize: 'var(--text-xs)',
                }}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: '13px' }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit client modal */}
      <EditClientModal
        open={!!editTarget}
        client={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={() => setEditTarget(null)}
      />

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
function ClientRow({ client, rowNo, isNearBottom, onView, onEdit, onDelete }: {
  client:       Client
  rowNo:        number
  isNearBottom: boolean
  onView:       () => void
  onEdit:       () => void
  onDelete:     () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLTableCellElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

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
        ref={menuRef}
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
            style={{
              position: 'absolute', right: '8px',
              ...(isNearBottom ? { bottom: '38px' } : { top: '40px' }),
              zIndex: 50,
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
                key={item.label}
                onClick={() => {
                  setMenuOpen(false)
                  item.action()
                }}
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
