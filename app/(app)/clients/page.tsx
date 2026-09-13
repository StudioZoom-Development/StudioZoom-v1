'use client'
import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'    // MyDesignSystem.ShadcnButton
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { subscribeToClients, softDeleteClient } from '@/lib/firebase/queries/clients'
import { subscribeToProjects } from '@/lib/firebase/queries/projects'
import { subscribeToFreelancers } from '@/lib/firebase/queries/freelancers'
import { subscribeToStaff, StaffMember } from '@/lib/firebase/queries/staff'
import { Badge } from '@/components/shared/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { EditClientModal } from '@/components/shared/EditClientModal'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { computeRecurringSessionDates } from '@/lib/utils/dates'
import { computeEventProgression } from '@/lib/services/eventProgressionService'
import { RecurringBadge, MultiDateBadge } from '@/components/shared/BookingTypeBadge'
import { Client, Project, Freelancer } from '@/types'

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
  const testDatasetMode = useUIStore(s => s.testDatasetMode)
  const testModeCutoff = useUIStore(s => s.testModeCutoff)

  const [clients,      setClients]      = useState<Client[]>([])
  const [projects,     setProjects]     = useState<Project[]>([])
  const [freelancers,  setFreelancers]  = useState<Freelancer[]>([])
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])
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
  const fromDateRef = useRef<HTMLInputElement>(null)
  const toDateRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsubProj = subscribeToProjects(data => setProjects(data || []))
    const unsubFl   = subscribeToFreelancers(data => setFreelancers(data || []))
    const unsubSt   = subscribeToStaff(data => setStaffMembers(data || []))
    return () => {
      unsubProj()
      unsubFl()
      unsubSt()
    }
  }, [testDatasetMode, testModeCutoff])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    const unsub = subscribeToClients(
      { eventType: filterType || undefined, paymentStatus: filterPmt || undefined },
      data => { setClients(data); setLoading(false); setPage(1) }
    )
    return unsub
  }, [filterType, filterPmt, testDatasetMode, testModeCutoff])

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
      const isRec          = c.bookingType === 'recurring' || Boolean(c.recurringSchedule) || Boolean(c.bookingGroupId)
      const recurringMatch = isRec && 'recurring'.includes(q)
      const isMulti        = c.bookingType === 'multiDate' || (Array.isArray(c.eventDates) && c.eventDates.length > 1 && c.bookingType !== 'recurring')
      const multiMatch     = isMulti && (q.includes('multi') || 'multi-date'.includes(q) || 'multidate'.includes(q.replace(/[-\s]/g, '')))

      if (!nameMatch && !eventNameMatch && !eventTypeRaw.includes(q) && !eventTypeLabel.includes(q) && !customTypeMatch && !contactMatch && !emailMatch && !idMatch && !locMatch && !recurringMatch && !multiMatch) {
        return false
      }
    }

    // 2. Stage Filter
    if (filterStage) {
      const stageVal = (c.stage || c.status || '').toLowerCase()
      if (filterStage.toLowerCase() === 'delivered') {
        const hasDeliveredSession = (projects || []).some(p =>
          (p.clientId === c.clientId || (c.projectIds && c.projectIds.includes(p.projectId))) &&
          (p.stage === 'delivered' || p.status === 'completed' || Boolean(p.stageCompletedAt?.delivered))
        )
        if (stageVal !== 'delivered' && !hasDeliveredSession) return false
      } else if (stageVal !== filterStage.toLowerCase()) {
        return false
      }
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
        const stageA = (a.stage || a.status || '').toLowerCase()
        const stageB = (b.stage || b.status || '').toLowerCase()
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

  // ── Pre-indexed Hash Maps (DSA Optimization O(P + S + F)) ─────────────────
  const projectsByClientId = useMemo(() => {
    const map = new Map<string, Project[]>()
    for (const p of projects) {
      if (!p) continue
      if (p.clientId) {
        const arr = map.get(p.clientId) || []
        arr.push(p)
        map.set(p.clientId, arr)
      }
      if (p.bookingGroupId) {
        const bgArr = map.get(p.bookingGroupId) || []
        bgArr.push(p)
        map.set(p.bookingGroupId, bgArr)
      }
    }
    return map
  }, [projects])

  const staffMap = useMemo(() => {
    const map = new Map<string, StaffMember>()
    for (const s of staffMembers) {
      if (s?.uid) map.set(s.uid, s)
    }
    return map
  }, [staffMembers])

  const freelancerMap = useMemo(() => {
    const map = new Map<string, Freelancer>()
    for (const f of freelancers) {
      if (f?.freelancerId) map.set(f.freelancerId, f)
    }
    return map
  }, [freelancers])

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
          <div
            onClick={() => { try { fromDateRef.current?.showPicker?.() } catch { fromDateRef.current?.focus() } }}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500, paddingLeft: '4px', userSelect: 'none' }}>From:</span>
            <input
              ref={fromDateRef}
              type="date"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setPage(1) }}
              onClick={e => {
                e.stopPropagation()
                try { (e.currentTarget as HTMLInputElement).showPicker?.() } catch {}
              }}
              style={{ ...DATE_INPUT_STYLE, border: 'none', background: 'transparent', cursor: 'pointer' }}
              title="Filter events from date"
            />
          </div>
          <div style={{ width: '1px', height: '20px', background: 'var(--color-border)' }} />
          <div
            onClick={() => { try { toDateRef.current?.showPicker?.() } catch { toDateRef.current?.focus() } }}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 500, userSelect: 'none' }}>To:</span>
            <input
              ref={toDateRef}
              type="date"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setPage(1) }}
              onClick={e => {
                e.stopPropagation()
                try { (e.currentTarget as HTMLInputElement).showPicker?.() } catch {}
              }}
              style={{ ...DATE_INPUT_STYLE, border: 'none', background: 'transparent', cursor: 'pointer' }}
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
        borderRadius: '12px',
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
              paginated.map((client, idx) => {
                const clientLinkedProjects =
                  projectsByClientId.get(client.clientId) ||
                  (client.bookingGroupId ? projectsByClientId.get(client.bookingGroupId) : undefined) ||
                  []
                return (
                  <ClientRow
                    key={client.clientId}
                    client={client}
                    rowNo={(page - 1) * pageSize + idx + 1}
                    isNearBottom={paginated.length >= 4 && idx >= paginated.length - 2}
                    linkedProjects={clientLinkedProjects}
                    freelancerMap={freelancerMap}
                    staffMap={staffMap}
                    onView={() => router.push(`/clients/${client.clientId}`)}
                    onEdit={() => setEditTarget(client)}
                    onDelete={() => setDeleteTarget(client)}
                  />
                )
              })
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

// ── Avatar item with instant hover tooltip ─────────────────────────
function CrewAvatarItem({
  member,
  isFirst,
  rowNo,
  zIndex,
}: {
  member: {
    id: string
    name: string
    initials: string
    isFreelancer: boolean
    role: string
  }
  isFirst: boolean
  rowNo: number
  zIndex: number
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        position: 'relative',
        marginLeft: isFirst ? '0' : '-8px',
        flexShrink: 0,
        zIndex: hovered ? 100 : zIndex,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          background: 'var(--color-surface-overlay)',
          border: '2px solid var(--color-surface)',
          color: 'var(--color-foreground)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'transform 0.15s ease',
          transform: hovered ? 'scale(1.15)' : 'scale(1)',
        }}
      >
        {member.initials}
      </div>

      {hovered && (
        <div
          style={{
            position: 'absolute',
            ...(rowNo <= 2
              ? { top: 'calc(100% + 6px)' }
              : { bottom: 'calc(100% + 6px)' }),
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-surface-raised)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: '6px',
            padding: '5px 9px',
            boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
            zIndex: 9999,
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground)' }}>
            {member.name}
          </span>
          <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--color-foreground-muted)' }}>
            {member.role} {member.isFreelancer ? '· Freelancer' : '· Staff'}
          </span>
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              ...(rowNo <= 2
                ? { bottom: '100%', borderBottom: '4px solid var(--color-border-strong)' }
                : { top: '100%', borderTop: '4px solid var(--color-border-strong)' }),
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Client row (exact structure from design file, optimized with React.memo and computeEventProgression) ──
interface ClientRowProps {
  client:         Client
  rowNo:          number
  isNearBottom:   boolean
  linkedProjects: Project[]
  freelancerMap:  Map<string, Freelancer>
  staffMap:       Map<string, StaffMember>
  onView:         () => void
  onEdit:         () => void
  onDelete:       () => void
}

const ClientRow = memo(function ClientRow({
  client,
  rowNo,
  isNearBottom,
  linkedProjects,
  freelancerMap,
  staffMap,
  onView,
  onEdit,
  onDelete,
}: ClientRowProps) {
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

  // Pure domain progression computation (Single Responsibility Principle)
  const progression = useMemo(() => {
    return computeEventProgression(client, linkedProjects)
  }, [client, linkedProjects])

  // Crew avatars: staff + assigned freelancers using O(1) hash maps
  const assignedCrew = useMemo(() => {
    const list: Array<{
      id: string
      name: string
      initials: string
      isFreelancer: boolean
      role: string
    }> = []
    const seen = new Set<string>()

    // 1. Staff members across client and linked projects
    const staffIds: string[] = []
    linkedProjects.forEach(p => {
      if (Array.isArray(p.staffUids)) staffIds.push(...p.staffUids)
    })
    if (Array.isArray(client.staffUids)) staffIds.push(...client.staffUids)
    if (Array.isArray(client.assignedStaff)) staffIds.push(...client.assignedStaff)
    if (Array.isArray(client.teamInitials)) staffIds.push(...client.teamInitials)

    staffIds.forEach(item => {
      if (!item || seen.has(item)) return
      seen.add(item)
      const staffMember = staffMap.get(item)
      const name = staffMember?.name || item
      const initials = item.length <= 2 ? item.toUpperCase() : getInitials(name)
      const role = staffMember?.role ? staffMember.role.charAt(0).toUpperCase() + staffMember.role.slice(1) : 'Staff'
      list.push({
        id: item,
        name,
        initials,
        isFreelancer: false,
        role,
      })
    })

    // 2. Freelancers across client and linked projects
    const flIds: string[] = []
    linkedProjects.forEach(p => {
      if (Array.isArray(p.freelancerIds)) flIds.push(...p.freelancerIds)
    })
    if (Array.isArray(client.freelancerIds)) flIds.push(...client.freelancerIds)

    flIds.forEach(flId => {
      if (!flId || seen.has(flId)) return
      seen.add(flId)
      const fl = freelancerMap.get(flId)
      const name = fl?.name || flId
      const initials = getInitials(name)
      const projWithFl = linkedProjects.find(p => p.freelancerAssignments?.[flId])
      const role = projWithFl?.freelancerAssignments?.[flId]?.role || fl?.skill || 'Freelancer'
      list.push({
        id: `fl-${flId}`,
        name,
        initials,
        isFreelancer: true,
        role,
      })
    })

    return list
  }, [client, linkedProjects, staffMap, freelancerMap])

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

      {/* Client column: primary eventName, secondary name + Recurring/Multi-Date badges */}
      <td style={{ ...td }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
            {client.eventName || client.name}
          </span>
          {progression.isRecurring && <RecurringBadge />}
          {progression.isMultiDate && <MultiDateBadge />}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
          {client.name}
        </div>
      </td>

      {/* Event type */}
      <td style={{ ...td, color: 'var(--color-foreground-muted)' }}>
        <div>{EVENT_TYPE_LABELS[client.eventType] ?? client.eventType}</div>
        {progression.isRecurring && (
          <div style={{ fontSize: '10px', color: 'var(--color-purple)', fontWeight: 500, marginTop: '2px' }}>
            Recurring ({progression.totalCount} sessions)
          </div>
        )}
        {progression.isMultiDate && (
          <div style={{ fontSize: '10px', color: 'var(--color-accent)', fontWeight: 500, marginTop: '2px' }}>
            Multi-Date ({progression.totalCount} days)
          </div>
        )}
      </td>

      {/* Event date (updates to next upcoming session or day for recurring/multi-date events) */}
      <td style={{ ...td, color: 'var(--color-foreground-muted)', whiteSpace: 'nowrap' }}>
        <div style={{ color: 'var(--color-foreground)', fontWeight: 500 }}>
          {progression.displayDate && !isNaN(progression.displayDate.getTime())
            ? format(progression.displayDate, 'd MMM yyyy')
            : '—'}
        </div>
        {(progression.isRecurring || progression.isMultiDate) && progression.displayLabel && (
          <div style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', marginTop: '2px' }}>
            {progression.displayLabel}
          </div>
        )}
      </td>

      {/* Stage badge (exact from design, with delivered n of n sessions for recurring) */}
      <td style={td}>
        {progression.isRecurring && (client.stage === 'delivered' || progression.deliveredCount > 0) ? (
          <Badge
            variant="delivered"
            label={`Delivered ${progression.deliveredCount} of ${progression.totalCount} sessions`}
          />
        ) : (
          <Badge variant={client.stage || client.status || 'booked'} />
        )}
      </td>

      {/* Balance due */}
      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: balColor }}>
        {balLabel}
      </td>

      {/* Assigned — avatar stack */}
      <td style={td}>
        {assignedCrew.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {assignedCrew.slice(0, 3).map((member, i) => (
              <CrewAvatarItem
                key={member.id}
                member={member}
                isFirst={i === 0}
                rowNo={rowNo}
                zIndex={4 - i}
              />
            ))}
            {assignedCrew.length > 3 && (
              <div
                title={`${assignedCrew.length - 3} more`}
                style={{
                  width: '26px', height: '26px', borderRadius: '50%',
                  background: 'var(--color-surface-raised)',
                  border: '2px solid var(--color-surface)',
                  color: 'var(--color-foreground-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: 600,
                  marginLeft: '-8px', flexShrink: 0,
                  cursor: 'default',
                }}
              >
                +{assignedCrew.length - 3}
              </div>
            )}
          </div>
        )}
      </td>

      {/* Action menu */}
      <td
        ref={menuRef}
        style={{ ...td, width: '48px', textAlign: 'right', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => setMenuOpen(prev => !prev)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-foreground-muted)', padding: '4px',
            borderRadius: '4px', display: 'inline-flex', alignItems: 'center',
            fontSize: '16px',
          }}
          title="Actions"
        >
          <i className="ti ti-dots-vertical" />
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div
            style={{
              position: 'absolute', right: '8px',
              ...(isNearBottom ? { bottom: '100%', marginBottom: '4px' } : { top: '100%', marginTop: '4px' }),
              zIndex: 100,
              background: 'var(--color-surface-overlay)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '10px', overflow: 'hidden', minWidth: '140px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              textAlign: 'left',
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
})
