'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/shared/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { subscribeToLeads, softDeleteLead } from '@/lib/firebase/queries/leads'
import { formatDisplayDate } from '@/lib/utils/dates'
import { useAuthStore } from '@/store/authStore'
import { Lead } from '@/types'

// Select styling matching design components
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

export default function LeadsPage() {
  const router = useRouter()
  const appUser = useAuthStore(s => s.appUser)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  // Filter states
  const [sourceFilter, setSourceFilter] = useState('All')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Pagination states
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Debounce search input (~250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Real-time Firestore subscription
  useEffect(() => {
    const unsub = subscribeToLeads({ source: sourceFilter }, data => {
      setLeads(data)
      setLoading(false)
    })
    return unsub
  }, [sourceFilter])

  // Filter leads by search term (AND logic with Source filter)
  const filteredLeads = useMemo(() => {
    const query = debouncedSearch.toLowerCase().trim()

    return leads.filter(lead => {
      // Source filter check
      if (sourceFilter !== 'All') {
        const leadSrc = (lead.source || '').toLowerCase()
        const selectedSrc = sourceFilter.toLowerCase()
        if (selectedSrc === 'walkin' || selectedSrc === 'walk-in') {
          if (!leadSrc.includes('walkin') && !leadSrc.includes('walk-in')) return false
        } else if (!leadSrc.includes(selectedSrc)) {
          return false
        }
      }

      // Search term check
      if (!query) return true

      const nameMatch      = lead.name.toLowerCase().includes(query)
      const typeMatch      = (lead.eventType || '').toLowerCase().includes(query)
      const formattedDate  = formatDisplayDate(lead.tentativeDate)
      const dateMatch      = (lead.tentativeDate || '').toLowerCase().includes(query) || formattedDate.toLowerCase().includes(query)
      const sourceMatch    = (lead.source || '').toLowerCase().includes(query)
      const statusMatch    = (lead.status || '').toLowerCase().includes(query)
      const contactMatch   = (lead.contact || '').toLowerCase().includes(query)
      const emailMatch     = (lead.email || '').toLowerCase().includes(query)

      return nameMatch || typeMatch || dateMatch || sourceMatch || statusMatch || contactMatch || emailMatch
    })
  }, [leads, sourceFilter, debouncedSearch])

  const totalPages = Math.ceil(filteredLeads.length / pageSize) || 1
  const paginatedLeads = filteredLeads.slice((page - 1) * pageSize, page * pageSize)

  const handleConvertToBooking = (lead: Lead) => {
    router.push(`/clients/new?leadId=${lead.leadId}`)
  }

  const handleDeleteLead = async () => {
    if (!deleteTarget || !appUser) return
    setDeleting(true)
    await softDeleteLead(deleteTarget.leadId, appUser.uid)
    setDeleting(false)
    setDeleteTarget(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'var(--font-inter)' }}>

      {/* ── Control / Filter Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

        {/* Search leads with icon prefix */}
        <div style={{ position: 'relative' }}>
          <i
            className="ti ti-search"
            style={{
              fontSize: '15px',
              color: 'var(--color-foreground-subtle)',
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search leads"
            style={{
              fontFamily: 'var(--font-inter)',
              width: '200px',
              boxSizing: 'border-box',
              height: '36px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '8px',
              padding: '0 12px 0 30px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)',
              outline: 'none',
            }}
          />
        </div>

        {/* Source filter dropdown */}
        <select
          value={sourceFilter}
          onChange={e => {
            setLoading(true)
            setSourceFilter(e.target.value)
            setPage(1)
          }}
          style={SELECT_STYLE}
        >
          <option value="All">Source · All</option>
          <option value="Walk-in">Walk-in</option>
          <option value="Online">Online</option>
          <option value="Referral">Referral</option>
          <option value="Other">Other</option>
        </select>

        <div style={{ flex: 1 }} />

        <Button
          className="h-9 font-medium"
          onClick={() => router.push('/leads/new')}
        >
          ＋ New lead
        </Button>
      </div>

      {/* ── Table Container ── */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr>
              {[
                { label: 'LEAD', align: 'left' },
                { label: 'EVENT TYPE', align: 'left' },
                { label: 'TENTATIVE DATE', align: 'left' },
                { label: 'SOURCE', align: 'left' },
                { label: 'STATUS', align: 'left' },
                { label: 'ACTIONS', align: 'right' },
              ].map((col, idx) => (
                <th
                  key={idx}
                  style={{
                    textAlign: col.align as 'left' | 'right',
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
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <TableRowSkeleton rows={5} cols={6} />
            ) : paginatedLeads.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon="ti-filter-off"
                    title="No leads found"
                    description="No leads match your search criteria or selected source filter."
                  />
                </td>
              </tr>
            ) : (
              paginatedLeads.map((lead, idx) => (
                <LeadRow
                  key={lead.leadId}
                  lead={lead}
                  isNearBottom={idx >= Math.max(0, paginatedLeads.length - 2)}
                  onView={() => router.push(`/leads/${lead.leadId}`)}
                  onConvert={() => handleConvertToBooking(lead)}
                  onDelete={() => setDeleteTarget(lead)}
                />
              ))
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        {!loading && filteredLeads.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', flexWrap: 'wrap', gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredLeads.length)} of {filteredLeads.length} leads
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

      {/* Delete Lead Confirm Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title={`Delete lead for ${deleteTarget?.name || 'this client'}?`}
        description="This will remove this lead inquiry from the system. This action cannot be undone."
        confirmLabel="Delete lead"
        onConfirm={handleDeleteLead}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}

function LeadRow({
  lead,
  isNearBottom,
  onView,
  onConvert,
  onDelete,
}: {
  lead:         Lead
  isNearBottom: boolean
  onView:       () => void
  onConvert:    () => void
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

  const td: React.CSSProperties = {
    padding: '0 16px',
    height: '48px',
    borderBottom: '0.5px solid var(--color-border)',
  }

  return (
    <tr
      onClick={onView}
      style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* LEAD Name & Contact */}
      <td style={{ ...td }}>
        <div style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
          {lead.name}
        </div>
        {lead.contact && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
            {lead.contact}
          </div>
        )}
      </td>

      {/* EVENT TYPE */}
      <td style={{ ...td, color: 'var(--color-foreground-muted)' }}>
        {lead.eventType}
      </td>

      {/* TENTATIVE DATE */}
      <td style={{ ...td, color: 'var(--color-foreground-muted)', whiteSpace: 'nowrap' }}>
        {formatDisplayDate(lead.tentativeDate)}
      </td>

      {/* SOURCE */}
      <td style={{ ...td, color: 'var(--color-foreground-muted)' }}>
        {lead.source || '—'}
      </td>

      {/* STATUS */}
      <td style={td}>
        <Badge variant={lead.status || 'inquiry'} />
      </td>

      {/* ACTIONS */}
      <td
        ref={menuRef}
        onClick={e => e.stopPropagation()}
        style={{ ...td, textAlign: 'right', position: 'relative' }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          {/* Quick Convert Button */}
          <span
            onClick={() => onConvert()}
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--color-primary)',
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: '8px',
              background: 'var(--color-primary-muted)',
              whiteSpace: 'nowrap',
              display: 'inline-block',
              userSelect: 'none',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-primary-muted)')}
          >
            Convert to booking
          </span>

          {/* Action Menu (···) */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-foreground-subtle)',
              padding: '4px 6px',
              borderRadius: '6px',
            }}
          >
            <i className="ti ti-dots-vertical" style={{ fontSize: '16px' }} />
          </button>

          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                right: '12px',
                ...(isNearBottom ? { bottom: '38px' } : { top: '40px' }),
                zIndex: 50,
                background: 'var(--color-surface-overlay)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '10px',
                overflow: 'hidden',
                minWidth: '150px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                textAlign: 'left',
              }}
            >
              {[
                { icon: 'ti-pencil', label: 'Edit lead', action: onView, danger: false },
                { icon: 'ti-arrow-right', label: 'Convert to booking', action: onConvert, danger: false },
                { icon: 'ti-trash', label: 'Delete lead', action: onDelete, danger: true },
              ].map(item => (
                <div
                  key={item.label}
                  onClick={() => {
                    setMenuOpen(false)
                    item.action()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    cursor: 'pointer',
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
        </div>
      </td>
    </tr>
  )
}
