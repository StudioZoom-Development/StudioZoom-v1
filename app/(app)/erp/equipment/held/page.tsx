'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import type { Checkout, EquipmentCondition } from '@/types'
import {
  subscribeActiveCheckouts,
  checkinEquipmentBatch,
} from '@/lib/firebase/queries/equipment'
import { useAuthStore } from '@/store/authStore'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'

interface StaffHeldGroup {
  staffUid: string
  staffName: string
  items: Checkout[]
  hasOverdue: boolean
}

const INITIAL_FALLBACK_CHECKOUTS: Checkout[] = [
  {
    checkoutId: 'co_cam_01',
    itemId: 'eq_cam_01',
    itemCode: 'CAM-01',
    itemName: 'Sony A7 IV',
    staffName: 'Siva Prakash',
    staffUid: 'uid_siva_prakash',
    projectId: 'proj_divya_arjun',
    eventName: 'Divya & Arjun — Engagement',
    eventDate: new Date(Date.now() + 1 * 24 * 3600 * 1000),
    checkedOutAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
    dueBack: new Date(Date.now() + 3 * 24 * 3600 * 1000),
    checkedOutBy: 'Studio Admin',
    status: 'out',
    notes: 'Outdoor daylight shoot at ECR resort',
  },
  {
    checkoutId: 'co_len_04',
    itemId: 'eq_len_04',
    itemCode: 'LEN-04',
    itemName: 'Sony FE 70-200mm f/2.8 GM OSS II',
    staffName: 'Siva Prakash',
    staffUid: 'uid_siva_prakash',
    projectId: 'proj_divya_arjun',
    eventName: 'Divya & Arjun — Engagement',
    eventDate: new Date(Date.now() - 4 * 24 * 3600 * 1000),
    checkedOutAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
    dueBack: new Date(Date.now() - 3 * 24 * 3600 * 1000),
    checkedOutBy: 'Studio Admin',
    status: 'out',
    notes: 'Overdue by 3 days. Return needed for upcoming weekend wedding.',
  },
  {
    checkoutId: 'co_drn_01',
    itemId: 'eq_drn_01',
    itemCode: 'DRN-01',
    itemName: 'DJI Mavic 3 Pro Cine Drone',
    staffName: 'Deepak S',
    staffUid: 'EmpaoYKGNpXHezIC4vDyLuMQs2o1',
    projectId: 'proj_tvs_lucas',
    eventName: 'TVS Lucas AV recce',
    eventDate: new Date(Date.now() - 3 * 24 * 3600 * 1000),
    checkedOutAt: new Date(Date.now() - 6 * 24 * 3600 * 1000),
    dueBack: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    checkedOutBy: 'Studio Admin',
    status: 'out',
    notes: 'Industrial aerial photography survey.',
  },
  {
    checkoutId: 'co_fls_03',
    itemId: 'eq_fls_03',
    itemCode: 'FLS-03',
    itemName: 'Godox AD600Pro Witstro Outdoor Strobe',
    staffName: 'Ramesh D',
    staffUid: '1gJBWJl5iOfWHeZJnG7iaNACgrw1',
    projectId: 'proj_studio_portraits',
    eventName: 'Studio Sessions & Portrait Shoots',
    eventDate: new Date(Date.now() + 2 * 24 * 3600 * 1000),
    checkedOutAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
    dueBack: new Date(Date.now() + 4 * 24 * 3600 * 1000),
    checkedOutBy: 'Studio Admin',
    status: 'out',
    notes: 'Fashion portfolio shoot in Studio A.',
  },
]

export default function StaffHeldEquipmentPage() {
  const appUser = useAuthStore((s) => s.appUser)
  const isStaff = appUser?.role === 'staff'

  // Helper: check if a group belongs to the currently logged in staff member
  const isGroupForUser = (group: StaffHeldGroup) => {
    if (!isStaff || !appUser) return true
    const matchesUid = Boolean(appUser.uid && group.staffUid === appUser.uid)
    const matchesName = Boolean(
      appUser.name &&
      group.staffName &&
      group.staffName.trim().toLowerCase() === appUser.name.trim().toLowerCase()
    )
    return matchesUid || matchesName
  }

  const [activeCheckouts, setActiveCheckouts] = useState<Checkout[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOverdueOnly, setFilterOverdueOnly] = useState(false)

  // Checkin Modal / State
  const [checkingInItems, setCheckingInItems] = useState<Checkout[] | null>(null)
  const [returnCondition, setReturnCondition] = useState<EquipmentCondition>('good')
  const [returnNotes, setReturnNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const unsubscribe = subscribeActiveCheckouts(
      (cos) => {
        if (mounted) {
          if (cos.length > 0) {
            setActiveCheckouts(cos)
          } else {
            setActiveCheckouts(INITIAL_FALLBACK_CHECKOUTS)
          }
          setLoading(false)
        }
      },
      (err) => {
        console.error('[StaffHeldEquipmentPage] subscription error:', err)
        if (mounted) {
          setActiveCheckouts(INITIAL_FALLBACK_CHECKOUTS)
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  // Group checkouts by staff member
  const staffGroups = useMemo(() => {
    const map = new Map<string, StaffHeldGroup>()
    const now = new Date().getTime()

    for (const co of activeCheckouts) {
      const isLate = co.dueBack.getTime() < now
      const uid = co.staffUid || co.staffName

      if (!map.has(uid)) {
        map.set(uid, {
          staffUid: uid,
          staffName: co.staffName || 'Staff Member',
          items: [],
          hasOverdue: false,
        })
      }

      const group = map.get(uid)!
      group.items.push(co)
      if (isLate) group.hasOverdue = true
    }

    let groups = Array.from(map.values())

    // Filter
    if (filterOverdueOnly) {
      groups = groups.filter((g) => g.hasOverdue)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      groups = groups.filter(
        (g) =>
          g.staffName.toLowerCase().includes(q) ||
          g.items.some(
            (i) =>
              i.itemName.toLowerCase().includes(q) ||
              i.itemCode.toLowerCase().includes(q) ||
              i.eventName.toLowerCase().includes(q)
          )
      )
    }

    // Sort: groups with overdue first, then by name
    groups.sort((a, b) => {
      if (a.hasOverdue && !b.hasOverdue) return -1
      if (!a.hasOverdue && b.hasOverdue) return 1
      return a.staffName.localeCompare(b.staffName)
    })

    return groups
  }, [activeCheckouts, filterOverdueOnly, searchQuery])

  // Total stats
  const stats = useMemo(() => {
    const totalStaff = staffGroups.length
    const totalItems = activeCheckouts.length
    const now = new Date().getTime()
    const overdueCount = activeCheckouts.filter((c) => c.dueBack.getTime() < now).length
    return { totalStaff, totalItems, overdueCount }
  }, [staffGroups, activeCheckouts])

  // Handle Check-in Action
  const handleConfirmCheckin = async () => {
    if (!checkingInItems || checkingInItems.length === 0) return

    let itemsToProcess = checkingInItems
    if (isStaff && appUser) {
      itemsToProcess = itemsToProcess.filter((c) => {
        const matchesUid = Boolean(appUser.uid && c.staffUid === appUser.uid)
        const matchesName = Boolean(
          appUser.name &&
          c.staffName &&
          c.staffName.trim().toLowerCase() === appUser.name.trim().toLowerCase()
        )
        return matchesUid || matchesName
      })
    }

    if (itemsToProcess.length === 0) return

    try {
      setIsSubmitting(true)
      await checkinEquipmentBatch({
        checkouts: itemsToProcess,
        returnCondition,
        notes: returnNotes,
        checkedInByUid: appUser?.uid || '',
        checkedInByName: appUser?.name || (isStaff ? 'Staff Member' : 'Admin'),
      })

      setSuccessMsg(`Successfully checked in ${itemsToProcess.length} items!`)
      setCheckingInItems(null)
      setReturnNotes('')
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err: unknown) {
      console.error('[handleConfirmCheckin] Error:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatShortDate = (d?: Date) => {
    if (!d) return '—'
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  return (
    <div
      className="p-3.5 sm:p-4 md:p-6"
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        paddingBottom: 'calc(88px + env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
      }}
    >
      <style>{`
        @media (min-width: 768px) {
          .held-kpi-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 16px !important;
          }
        }
        @media (max-width: 767px) {
          .held-kpi-grid {
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
          }
        }
      `}</style>

      {/* ─── HEADER ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link
              href="/erp/equipment"
              className="hidden md:inline-flex"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-foreground-muted)',
                textDecoration: 'none',
              }}
            >
              <i className="ti ti-arrow-left" style={{ fontSize: '18px' }} />
            </Link>
            <div>
              <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
                Staff-Held Equipment
              </h1>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                Overview of studio gear currently in possession of photographers and crew members.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link
              href="/erp/equipment/checkout?tab=checkin"
              className="hidden md:inline-flex"
              style={{
                height: '36px',
                padding: '0 14px',
                borderRadius: '8px',
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                color: 'var(--color-foreground)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
              }}
            >
              <i className="ti ti-arrow-down-left" style={{ fontSize: '15px' }} />
              <span>Check In Returns</span>
            </Link>

            <Link
              href="/erp/equipment/checkout"
              style={{
                height: '36px',
                padding: '0 14px',
                borderRadius: '8px',
                background: 'var(--color-primary)',
                border: 'none',
                color: '#ffffff',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
              }}
            >
              <i className="ti ti-arrow-up-right" style={{ fontSize: '15px' }} />
              <span>Checkout New Gear</span>
            </Link>
          </div>
        </div>

        {/* Mobile-Only Circulation Switcher (hidden on desktop md: >= 768px) */}
        <div
          className="flex md:hidden w-full overflow-x-auto"
          style={{
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '10px',
            padding: '4px',
          }}
        >
          <Link
            href="/erp/equipment/checkout"
            className="flex-1 text-center justify-center whitespace-nowrap"
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-foreground-muted)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              textDecoration: 'none',
            }}
          >
            <i className="ti ti-arrow-up-right" style={{ fontSize: '14px' }} />
            <span>Check Out</span>
          </Link>

          <Link
            href="/erp/equipment/checkout?tab=checkin"
            className="flex-1 text-center justify-center whitespace-nowrap"
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-foreground-muted)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              textDecoration: 'none',
            }}
          >
            <i className="ti ti-arrow-down-left" style={{ fontSize: '14px' }} />
            <span>Check In</span>
          </Link>

          <div
            className="flex-1 text-center justify-center whitespace-nowrap"
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--color-primary)',
              color: '#ffffff',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="ti ti-users" style={{ fontSize: '14px' }} />
            <span>Staff Held ({stats.totalItems})</span>
          </div>
        </div>

        {/* ─── METRIC TILES ─────────────────────────────────────────── */}
        <div className="held-kpi-grid">
          <div
            style={{
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>
              Staff with Gear
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-primary)' }}>
                {stats.totalStaff}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>crew members</span>
            </div>
          </div>

          <div
            style={{
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>
              Total Gear in Field
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-secondary)' }}>
                {stats.totalItems}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>items assigned</span>
            </div>
          </div>

          <div
            onClick={() => setFilterOverdueOnly(!filterOverdueOnly)}
            style={{
              background: stats.overdueCount > 0 ? 'var(--color-danger-muted)' : 'var(--color-surface)',
              border: `0.5px solid ${stats.overdueCount > 0 ? 'var(--color-danger)' : 'var(--color-border)'}`,
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 'var(--text-xs)', color: stats.overdueCount > 0 ? 'var(--color-danger)' : 'var(--color-foreground-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>
              Overdue Returns
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-danger)' }}>
                {stats.overdueCount}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
                {filterOverdueOnly ? 'Click to show all' : 'Click to filter'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div
          style={{
            background: 'var(--color-success-muted)',
            border: '0.5px solid var(--color-success)',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--color-success)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
          }}
        >
          <i className="ti ti-circle-check" style={{ fontSize: '18px' }} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ─── SEARCH & FILTER BAR ──────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <i
            className="ti ti-search"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-foreground-subtle)',
              fontSize: '15px',
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by staff name, camera, lens, serial or event..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              height: '36px',
              borderRadius: '8px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              padding: '0 12px 0 34px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)',
              outline: 'none',
              fontFamily: 'var(--font-inter)',
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => setFilterOverdueOnly(!filterOverdueOnly)}
          style={{
            height: '36px',
            padding: '0 14px',
            borderRadius: '8px',
            border: `0.5px solid ${filterOverdueOnly ? 'var(--color-danger)' : 'var(--color-border)'}`,
            background: filterOverdueOnly ? 'var(--color-danger-muted)' : 'var(--color-surface-raised)',
            color: filterOverdueOnly ? 'var(--color-danger)' : 'var(--color-foreground-muted)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <i className="ti ti-alert-triangle" />
          <span>Overdue Only</span>
        </button>
      </div>

      {/* ─── STAFF GROUPS LIST ────────────────────────────────────────── */}
      {loading ? (
        <LoadingSkeleton />
      ) : staffGroups.length === 0 ? (
        <EmptyState
          icon="ti-shield-check"
          title="No staff holding equipment"
          description={
            filterOverdueOnly
              ? 'No staff have overdue returns.'
              : 'All studio gear is accounted for and currently inside the studio.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {staffGroups.map((group) => {
            return (
              <div
                key={group.staffUid}
                style={{
                  background: 'var(--color-surface)',
                  border: `0.5px solid ${group.hasOverdue ? 'var(--color-danger)' : 'var(--color-border)'}`,
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: group.hasOverdue ? '0 2px 10px rgba(239, 83, 80, 0.15)' : 'none',
                }}
              >
                {/* Staff Card Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px 20px',
                    borderBottom: '0.5px solid var(--color-border)',
                    background: group.hasOverdue ? 'var(--color-danger-muted)' : 'transparent',
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      background: 'var(--color-primary-muted)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {group.staffName.charAt(0)}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: '150px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                        {group.staffName}
                      </span>
                      {group.hasOverdue && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--color-danger)',
                            color: '#ffffff',
                          }}
                        >
                          HAS OVERDUE GEAR
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                      Assigned {group.items.length} item{group.items.length > 1 ? 's' : ''} for shoots
                    </span>
                  </div>

                  {/* Header Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: '10px',
                        background: group.hasOverdue ? 'var(--color-danger)' : 'var(--color-secondary-muted)',
                        color: group.hasOverdue ? '#ffffff' : 'var(--color-secondary)',
                      }}
                    >
                      {group.items.length} items out
                    </span>

                    {(!isStaff || isGroupForUser(group)) && (
                      <button
                        type="button"
                        onClick={() => setCheckingInItems(group.items)}
                        style={{
                          height: '30px',
                          padding: '0 12px',
                          borderRadius: '6px',
                          background: 'var(--color-surface-raised)',
                          border: '0.5px solid var(--color-border)',
                          color: 'var(--color-success)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <i className="ti ti-check" />
                        <span>Check in all</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Desktop Items Table (hidden on mobile < 768px) */}
                <div className="hidden md:block">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-surface-raised)' }}>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 20px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Item Details
                        </th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Event / Project
                        </th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-strong)', width: '120px' }}>
                          Checked Out
                        </th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-strong)', width: '120px' }}>
                          Due Back
                        </th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-strong)', width: '90px' }}>
                          Status
                        </th>
                        <th style={{ textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 20px', borderBottom: '0.5px solid var(--color-border-strong)', width: '110px' }}>
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((it) => {
                        const isLate = it.dueBack.getTime() < new Date().getTime()
                        return (
                          <tr
                            key={it.checkoutId}
                            style={{
                              borderBottom: '0.5px solid var(--color-border)',
                              background: isLate ? 'var(--color-danger-muted)' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '10px 20px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="ti ti-camera" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                                    {it.itemName}
                                  </span>
                                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', fontFamily: 'monospace' }}>
                                    {it.itemCode}
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td style={{ padding: '10px 14px', color: 'var(--color-foreground-muted)', fontSize: 'var(--text-xs)' }}>
                              {it.eventName}
                            </td>

                            <td style={{ padding: '10px 14px', color: 'var(--color-foreground-muted)', fontSize: 'var(--text-xs)' }}>
                              out {formatShortDate(it.checkedOutAt)}
                            </td>

                            <td
                              style={{
                                padding: '10px 14px',
                                fontSize: 'var(--text-xs)',
                                fontWeight: isLate ? 700 : 500,
                                color: isLate ? 'var(--color-danger)' : 'var(--color-foreground)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {isLate && <i className="ti ti-alert-triangle" style={{ fontSize: '12px' }} />}
                                <span>due {formatShortDate(it.dueBack)}</span>
                              </div>
                            </td>

                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  fontSize: 'var(--text-xs)',
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  background: isLate ? 'var(--color-danger-muted)' : 'var(--color-secondary-muted)',
                                  color: isLate ? 'var(--color-danger)' : 'var(--color-secondary)',
                                }}
                              >
                                {isLate ? 'Overdue' : 'Out'}
                              </span>
                            </td>

                            <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                              {!isStaff || isGroupForUser(group) ? (
                                <button
                                  type="button"
                                  onClick={() => setCheckingInItems([it])}
                                  style={{
                                    height: '28px',
                                    padding: '0 10px',
                                    borderRadius: '6px',
                                    background: 'transparent',
                                    border: '0.5px solid var(--color-border)',
                                    color: 'var(--color-success)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Check in
                                </button>
                              ) : (
                                <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
                                  Staff Held
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Cards (block on mobile < 768px) */}
                <div className="flex flex-col gap-2 p-3 md:hidden">
                  {group.items.map((it) => {
                    const isLate = it.dueBack.getTime() < new Date().getTime()
                    return (
                      <div
                        key={it.checkoutId}
                        style={{
                          background: isLate ? 'var(--color-danger-muted)' : 'var(--color-surface-raised)',
                          border: `0.5px solid ${isLate ? 'var(--color-danger)' : 'var(--color-border)'}`,
                          borderRadius: '10px',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                background: 'var(--color-surface)',
                                border: '0.5px solid var(--color-border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--color-primary)',
                                flexShrink: 0,
                              }}
                            >
                              <i className="ti ti-camera" style={{ fontSize: '16px' }} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {it.itemName}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', fontFamily: 'monospace' }}>
                                {it.itemCode}
                              </div>
                            </div>
                          </div>

                          {!isStaff || isGroupForUser(group) ? (
                            <button
                              type="button"
                              onClick={() => setCheckingInItems([it])}
                              style={{
                                height: '34px',
                                padding: '0 12px',
                                borderRadius: '6px',
                                background: 'var(--color-surface)',
                                border: '0.5px solid var(--color-success)',
                                color: 'var(--color-success)',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                flexShrink: 0,
                              }}
                            >
                              <i className="ti ti-check" />
                              <span>Check in</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', flexShrink: 0 }}>
                              Staff Held
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', flexWrap: 'wrap', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <i className="ti ti-calendar-event" style={{ fontSize: '13px' }} />
                            <span>{it.eventName || 'Studio Shoot'}</span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontWeight: isLate ? 700 : 500,
                              color: isLate ? 'var(--color-danger)' : 'var(--color-foreground-muted)',
                            }}
                          >
                            {isLate && <i className="ti ti-alert-triangle" style={{ fontSize: '12px' }} />}
                            <span>{isLate ? 'OVERDUE: ' : 'Due: '}{formatShortDate(it.dueBack)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── CHECKIN MODAL DIALOG ─────────────────────────────────────── */}
      {checkingInItems && (
        <div
          onClick={() => setCheckingInItems(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9995,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '460px',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              fontFamily: 'var(--font-inter)',
              color: 'var(--color-foreground)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'var(--color-success-muted)',
                  color: 'var(--color-success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                }}
              >
                <i className="ti ti-check" />
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>
                  Confirm Return & Check-In
                </h3>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  Returning {checkingInItems.length} item{checkingInItems.length > 1 ? 's' : ''} to studio
                </span>
              </div>
            </div>

            {/* Items summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
              {checkingInItems.map((ci) => (
                <div
                  key={ci.checkoutId}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'var(--color-surface-raised)',
                    fontSize: 'var(--text-xs)',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{ci.itemName}</span>
                  <span style={{ color: 'var(--color-foreground-subtle)' }}>{ci.itemCode}</span>
                </div>
              ))}
            </div>

            {/* Condition on return */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
                Physical Condition on Return
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {(['excellent', 'good', 'canUse', 'service'] as EquipmentCondition[]).map((c) => {
                  const isSelected = returnCondition === c
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setReturnCondition(c)}
                      style={{
                        padding: '6px 4px',
                        borderRadius: '6px',
                        border: `0.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background: isSelected ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                        color: isSelected ? 'var(--color-primary)' : 'var(--color-foreground)',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        cursor: 'pointer',
                      }}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Notes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
                Inspection Notes (optional)
              </label>
              <textarea
                rows={2}
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="e.g. Lens hood clean, battery recharged."
                style={{
                  borderRadius: '8px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  padding: '8px',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground)',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'var(--font-inter)',
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px' }}>
              <button
                type="button"
                onClick={() => setCheckingInItems(null)}
                style={{
                  height: '36px',
                  padding: '0 14px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmCheckin}
                style={{
                  height: '36px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  background: 'var(--color-success)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isSubmitting && <i className="ti ti-loader animate-spin" />}
                <span>Confirm Check-In</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
