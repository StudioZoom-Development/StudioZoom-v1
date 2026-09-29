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
import { useUIStore } from '@/store/uiStore'
import { useBackSwipe } from '@/hooks/useMobileGestures'
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
  const testDatasetMode = useUIStore(s => s.testDatasetMode)
  const testModeCutoff = useUIStore(s => s.testModeCutoff)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  // Filter states
  const [sourceFilter, setSourceFilter] = useState('All')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Pagination states
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('studio_zoom_leads_page_size')
        if (saved) {
          const parsed = Number(saved)
          if ([10, 25, 50, 100].includes(parsed)) return parsed
        }
      } catch {}
    }
    return 10
  })

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
  }, [sourceFilter, testDatasetMode, testModeCutoff])

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

  // Mobile states
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [mobileVisibleCount, setMobileVisibleCount] = useState(15)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { backSwipeHandlers } = useBackSwipe()

  const totalPages = Math.ceil(filteredLeads.length / pageSize) || 1
  const paginatedLeads = filteredLeads.slice((page - 1) * pageSize, page * pageSize)

  // Mobile infinite scroll slice
  const mobileLeads = useMemo(() => {
    return filteredLeads.slice(0, mobileVisibleCount)
  }, [filteredLeads, mobileVisibleCount])

  // Mobile infinite scroll IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setMobileVisibleCount(prev => Math.min(filteredLeads.length, prev + 15))
        }
      },
      { threshold: 0.1 }
    )
    const el = sentinelRef.current
    if (el) observer.observe(el)
    return () => {
      if (el) observer.unobserve(el)
    }
  }, [filteredLeads.length])

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

      {/* ── DESKTOP VIEW (≥768px): 100% Invariant ── */}
      <div className="hidden md:flex md:flex-col" style={{ gap: '16px' }}>
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
                  isNearBottom={paginatedLeads.length >= 4 && idx >= paginatedLeads.length - 2}
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
                    const next = Number(e.target.value)
                    setPageSize(next)
                    setPage(1)
                    try {
                      localStorage.setItem('studio_zoom_leads_page_size', String(next))
                    } catch {}
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
      </div>
      {/* ── END DESKTOP VIEW ── */}

      {/* ── MOBILE VIEW (<768px): Compact Cards + Filter Drawer + Infinite Scroll ── */}
      <div
        className="block md:hidden"
        {...backSwipeHandlers}
        style={{
          paddingBottom: '80px',
        }}
      >
        {/* Sticky Mobile Header: Search + Filter + New Lead */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}
        >
          {/* Search Input */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '10px',
              padding: '0 12px',
              height: '42px',
            }}
          >
            <i className="ti ti-search" style={{ fontSize: '16px', color: 'var(--color-foreground-subtle)', marginRight: '8px' }} />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
              }}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                style={{ background: 'none', border: 'none', color: 'var(--color-foreground-muted)', cursor: 'pointer' }}
              >
                <i className="ti ti-x" />
              </button>
            )}
          </div>

          {/* Filter Button with Count Badge */}
          <button
            onClick={() => setMobileFilterOpen(true)}
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: sourceFilter !== 'All' ? 'var(--color-primary-muted)' : 'var(--color-surface)',
              border: sourceFilter !== 'All' ? '0.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
              color: sourceFilter !== 'All' ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <i className="ti ti-filter" style={{ fontSize: '18px' }} />
            {sourceFilter !== 'All' && (
              <span
                style={{
                  position: 'absolute',
                  top: '6px',
                  right: '6px',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                }}
              />
            )}
          </button>

          {/* New Lead Button */}
          <button
            onClick={() => router.push('/leads/new')}
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <i className="ti ti-plus" style={{ fontSize: '18px' }} />
          </button>
        </div>

        {/* 15.5 Active Filter Chip Row */}
        {sourceFilter !== 'All' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            <div
              onClick={() => setSourceFilter('All')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '16px',
                background: 'var(--color-primary-muted)',
                border: '0.5px solid var(--color-primary)',
                color: 'var(--color-primary)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <span>Source: {sourceFilter}</span>
              <i className="ti ti-x" style={{ fontSize: '12px' }} />
            </div>
            <button
              onClick={() => setSourceFilter('All')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-foreground-muted)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Clear all
            </button>
          </div>
        )}

        {/* 15.2 Compact Cards List */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1, 2, 3, 4].map(n => (
              <div
                key={n}
                style={{
                  height: '110px',
                  borderRadius: '12px',
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  animation: 'pulse 1.5s infinite',
                }}
              />
            ))}
          </div>
        ) : filteredLeads.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              borderRadius: '12px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              textAlign: 'center',
            }}
          >
            <i className="ti ti-filter-off" style={{ fontSize: '32px', color: 'var(--color-foreground-subtle)', marginBottom: '10px' }} />
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              No leads found
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', margin: '4px 0 0 0' }}>
              Try adjusting your search query or source filter.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {mobileLeads.map((lead, idx) => (
              <div
                key={lead.leadId}
                style={{
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '12px',
                  padding: '14px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                }}
              >
                {/* Header: Zero-padded ID, Name, Status Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-foreground-subtle)' }}>
                      #{String(idx + 1).padStart(2, '0')}
                    </span>
                    <span
                      onClick={() => router.push(`/leads/${lead.leadId}`)}
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 700,
                        color: 'var(--color-foreground)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                      }}
                    >
                      {lead.name}
                    </span>
                  </div>
                  <Badge variant={lead.status} />
                </div>

                {/* Metadata Row: Date, Type, Source */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-foreground-muted)',
                    marginBottom: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="ti ti-calendar" style={{ fontSize: '13px' }} />
                    <span>{formatDisplayDate(lead.tentativeDate)}</span>
                  </div>
                  {lead.eventType && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="ti ti-tag" style={{ fontSize: '13px' }} />
                      <span>{lead.eventType}</span>
                    </div>
                  )}
                  {lead.source && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="ti ti-world" style={{ fontSize: '13px' }} />
                      <span>{lead.source}</span>
                    </div>
                  )}
                </div>

                {/* Contact row: Phone & Email */}
                {(lead.contact || lead.email) && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px',
                      fontSize: 'var(--text-xs)',
                      marginBottom: '12px',
                      paddingTop: '8px',
                      borderTop: '0.5px solid var(--color-border)',
                    }}
                  >
                    {lead.contact && (
                      <a
                        href={`tel:${lead.contact}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: 'var(--color-accent)',
                          textDecoration: 'none',
                        }}
                      >
                        <i className="ti ti-phone" style={{ fontSize: '13px' }} />
                        <span>{lead.contact}</span>
                      </a>
                    )}
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: 'var(--color-foreground-muted)',
                          textDecoration: 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '160px',
                        }}
                      >
                        <i className="ti ti-mail" style={{ fontSize: '13px' }} />
                        <span>{lead.email}</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Card Action Footer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '6px' }}>
                  <button
                    onClick={() => handleConvertToBooking(lead)}
                    style={{
                      flex: 1,
                      height: '36px',
                      borderRadius: '8px',
                      background: 'var(--color-primary)',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: 'var(--text-xs)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>Convert to Booking</span>
                    <i className="ti ti-arrow-right" style={{ fontSize: '12px' }} />
                  </button>

                  <button
                    onClick={() => router.push(`/leads/${lead.leadId}`)}
                    style={{
                      height: '36px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      color: 'var(--color-foreground)',
                      fontWeight: 600,
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    Details
                  </button>

                  <button
                    onClick={() => setDeleteTarget(lead)}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      color: 'var(--color-danger)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <i className="ti ti-trash" style={{ fontSize: '14px' }} />
                  </button>
                </div>
              </div>
            ))}

            {/* 15.4 Infinite Scroll Sentinel */}
            <div ref={sentinelRef} style={{ height: '20px' }} />

            {/* End of Feed Message */}
            {mobileVisibleCount >= filteredLeads.length && filteredLeads.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '16px 0',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground-subtle)',
                }}
              >
                <i className="ti ti-check" style={{ fontSize: '14px', color: 'var(--color-success)' }} />
                <span>You&apos;ve viewed all {filteredLeads.length} leads</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 15.3 Swipe-to-Dismiss Filter Bottom Sheet Drawer */}
      {mobileFilterOpen && (
        <>
          <div
            onClick={() => setMobileFilterOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              zIndex: 9990,
            }}
          />
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'var(--color-surface-overlay)',
              borderTop: '0.5px solid var(--color-border)',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '16px 20px 32px 20px',
              zIndex: 9995,
              fontFamily: 'var(--font-inter)',
            }}
          >
            {/* Grabber handle */}
            <div
              style={{
                width: '36px',
                height: '4px',
                background: 'var(--color-border-strong)',
                borderRadius: '2px',
                margin: '0 auto 16px auto',
              }}
            />

            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-foreground)', margin: '0 0 16px 0' }}>
              Filter by Source
            </h3>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
              {['All', 'Instagram', 'Referral', 'Walk-in', 'Website', 'Other'].map(src => {
                const active = sourceFilter === src
                return (
                  <button
                    key={src}
                    onClick={() => setSourceFilter(src)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '20px',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      background: active ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                      border: active ? '0.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                      color: active ? '#ffffff' : 'var(--color-foreground)',
                      cursor: 'pointer',
                    }}
                  >
                    {src}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  setSourceFilter('All')
                  setMobileFilterOpen(false)
                }}
                style={{
                  flex: 1,
                  height: '44px',
                  borderRadius: '8px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-foreground)',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                Reset
              </button>
              <button
                onClick={() => setMobileFilterOpen(false)}
                style={{
                  flex: 2,
                  height: '44px',
                  borderRadius: '8px',
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}

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
                ...(isNearBottom ? { bottom: '100%', marginBottom: '4px' } : { top: '100%', marginTop: '4px' }),
                zIndex: 100,
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
