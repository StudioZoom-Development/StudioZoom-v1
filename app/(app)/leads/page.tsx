'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/shared/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { subscribeToLeads } from '@/lib/firebase/queries/leads'
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
  color:        'var(--color-foreground-muted)',
  outline:      'none',
  cursor:       'pointer',
}

export default function LeadsPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  // Filter states
  const [sourceFilter, setSourceFilter] = useState('All')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search input (~250-300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
    }, 250)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Real-time Firestore subscription
  useEffect(() => {
    setLoading(true)
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
      const dateMatch      = (lead.tentativeDate || '').toLowerCase().includes(query)
      const sourceMatch    = (lead.source || '').toLowerCase().includes(query)
      const statusMatch    = (lead.status || '').toLowerCase().includes(query)
      const contactMatch   = (lead.contact || '').toLowerCase().includes(query)
      const emailMatch     = (lead.email || '').toLowerCase().includes(query)

      return nameMatch || typeMatch || dateMatch || sourceMatch || statusMatch || contactMatch || emailMatch
    })
  }, [leads, sourceFilter, debouncedSearch])

  const handleConvertToBooking = (e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation()
    console.log('Convert to booking selected for lead:', lead.name, lead.leadId)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'var(--font-inter)' }}>

      {/* ── Control / Filter Bar (exact from ScreenCRM2.dc.html line 193) ── */}
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
          onChange={e => setSourceFilter(e.target.value)}
          style={SELECT_STYLE}
        >
          <option value="All">Source · All</option>
          <option value="Walk-in">Walk-in</option>
          <option value="Online">Online</option>
          <option value="Referral">Referral</option>
          <option value="Other">Other</option>
        </select>

        <div style={{ flex: 1 }} />

        {/* Requirement 1: Click New Lead -> opens /leads/new */}
        <Button
          className="h-9 font-medium"
          onClick={() => router.push('/leads/new')}
        >
          ＋ New lead
        </Button>
      </div>

      {/* ── Table Container (exact layout from ScreenCRM2.dc.html line 206) ── */}
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
            ) : filteredLeads.length === 0 ? (
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
              filteredLeads.map(lead => (
                <tr
                  key={lead.leadId}
                  style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* LEAD (Requirement 1: Clicking lead name opens edit mode) */}
                  <td
                    onClick={() => router.push(`/leads/${lead.leadId}`)}
                    style={{
                      padding: '0 16px',
                      height: '48px',
                      borderBottom: '0.5px solid var(--color-border)',
                      fontWeight: 600,
                      color: 'var(--color-foreground)',
                    }}
                  >
                    {lead.name}
                  </td>

                  {/* EVENT TYPE */}
                  <td
                    onClick={() => router.push(`/leads/${lead.leadId}`)}
                    style={{
                      padding: '0 16px',
                      height: '48px',
                      borderBottom: '0.5px solid var(--color-border)',
                      color: 'var(--color-foreground-muted)',
                    }}
                  >
                    {lead.eventType}
                  </td>

                  {/* TENTATIVE DATE */}
                  <td
                    onClick={() => router.push(`/leads/${lead.leadId}`)}
                    style={{
                      padding: '0 16px',
                      height: '48px',
                      borderBottom: '0.5px solid var(--color-border)',
                      color: 'var(--color-foreground-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {lead.tentativeDate || '—'}
                  </td>

                  {/* SOURCE */}
                  <td
                    onClick={() => router.push(`/leads/${lead.leadId}`)}
                    style={{
                      padding: '0 16px',
                      height: '48px',
                      borderBottom: '0.5px solid var(--color-border)',
                      color: 'var(--color-foreground-muted)',
                    }}
                  >
                    {lead.source || '—'}
                  </td>

                  {/* STATUS */}
                  <td
                    onClick={() => router.push(`/leads/${lead.leadId}`)}
                    style={{
                      padding: '0 16px',
                      height: '48px',
                      borderBottom: '0.5px solid var(--color-border)',
                    }}
                  >
                    <Badge variant={lead.status || 'inquiry'} />
                  </td>

                  {/* ACTIONS */}
                  <td
                    style={{
                      padding: '0 16px',
                      height: '48px',
                      borderBottom: '0.5px solid var(--color-border)',
                      textAlign: 'right',
                    }}
                  >
                    {/* Requirement 5: Hover state does not change background or text color */}
                    <span
                      onClick={e => handleConvertToBooking(e, lead)}
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
                        transition: 'none',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'var(--color-primary-muted)'
                        e.currentTarget.style.color = 'var(--color-primary)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'var(--color-primary-muted)'
                        e.currentTarget.style.color = 'var(--color-primary)'
                      }}
                    >
                      Convert to booking
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
