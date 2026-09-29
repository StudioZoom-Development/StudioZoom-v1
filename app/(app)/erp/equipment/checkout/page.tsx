'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import type { Equipment, EquipmentCondition, Checkout, Project } from '@/types'
import {
  subscribeEquipment,
  subscribeActiveCheckouts,
  checkoutEquipmentBatch,
  checkinEquipmentBatch,
} from '@/lib/firebase/queries/equipment'
import { subscribeToProjects } from '@/lib/firebase/queries/projects'
import { subscribeToAllTeamMembers, type StaffMember } from '@/lib/firebase/queries/staff'
import { useAuthStore } from '@/store/authStore'
import { DateField } from '@/components/shared/DateField'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { Button } from '@/components/ui/button'

export default function EquipmentCheckoutPage() {
  const appUser = useAuthStore((s) => s.appUser)
  const isStaff = appUser?.role === 'staff'

  // Mode: 'checkout' | 'checkin'
  const [activeTab, setActiveTab] = useState<'checkout' | 'checkin'>('checkout')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('tab') === 'checkin') {
        setActiveTab('checkin')
      }
    }
  }, [])

  // Real-time data
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
  const [activeCheckouts, setActiveCheckouts] = useState<Checkout[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)

  // Subscriptions
  useEffect(() => {
    let mounted = true
    const unsubEq = subscribeEquipment((items) => {
      if (mounted) setEquipmentList(items)
    })

    const unsubCo = subscribeActiveCheckouts((cos) => {
      if (mounted) setActiveCheckouts(cos)
    })

    const unsubProj = subscribeToProjects((projs) => {
      if (mounted) setProjects(projs)
    })

    const unsubStaff = subscribeToAllTeamMembers((st) => {
      if (mounted) {
        setStaffList(st)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      unsubEq()
      unsubCo()
      unsubProj()
      unsubStaff()
    }
  }, [])

  // ─── CHECKOUT FORM STATE ────────────────────────────────────────────────
  const [selectedGearIds, setSelectedGearIds] = useState<string[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedStaffUid, setSelectedStaffUid] = useState<string>(() => {
    return isStaff && appUser?.uid ? appUser.uid : ''
  })

  // Auto-lock selected staff member to current staff user
  useEffect(() => {
    if (isStaff && appUser?.uid && selectedStaffUid !== appUser.uid) {
      setSelectedStaffUid(appUser.uid)
    }
  }, [isStaff, appUser?.uid, selectedStaffUid])

  const [dueBackDateStr, setDueBackDateStr] = useState<string>(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0]
  })
  const [checkoutNotes, setCheckoutNotes] = useState<string>('')
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false)
  const [checkoutSuccessMsg, setCheckoutSuccessMsg] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // Search & filter in checkout available gear
  const [gearSearch, setGearSearch] = useState('')
  const [gearCategory, setGearCategory] = useState<string>('all')

  // Available gear only
  const availableGear = useMemo(() => {
    return equipmentList.filter((e) => e.status === 'available')
  }, [equipmentList])

  const filteredAvailableGear = useMemo(() => {
    let list = availableGear
    if (gearCategory !== 'all') {
      list = list.filter((e) => e.category === gearCategory)
    }
    if (gearSearch.trim()) {
      const q = gearSearch.toLowerCase().trim()
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.itemCode.toLowerCase().includes(q) ||
          e.brand.toLowerCase().includes(q) ||
          e.model.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q)
      )
    }
    return list
  }, [availableGear, gearCategory, gearSearch])

  // Pagination for Available Gear (Tab 1)
  const [gearPage, setGearPage] = useState<number>(1)
  const [gearPageSize, setGearPageSize] = useState<number>(15)

  useEffect(() => {
    setGearPage(1)
  }, [gearSearch, gearCategory])

  const totalGearPages = Math.max(1, Math.ceil(filteredAvailableGear.length / gearPageSize))
  const safeGearPage = Math.min(Math.max(1, gearPage), totalGearPages)
  const paginatedAvailableGear = useMemo(() => {
    const start = (safeGearPage - 1) * gearPageSize
    return filteredAvailableGear.slice(start, start + gearPageSize)
  }, [filteredAvailableGear, safeGearPage, gearPageSize])

  // Selected items objects
  const selectedItems = useMemo(() => {
    return availableGear.filter((e) => selectedGearIds.includes(e.itemId))
  }, [availableGear, selectedGearIds])

  const toggleSelectGear = (itemId: string) => {
    setSelectedGearIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    )
  }

  // Handle Checkout Submit
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCheckoutError(null)

    if (selectedGearIds.length === 0) {
      setCheckoutError('Select at least 1 item to check out')
      return
    }
    if (!selectedProjectId) {
      setCheckoutError('Please assign an event / shoot')
      return
    }
    if (!selectedStaffUid) {
      setCheckoutError('Please assign a staff member / photographer')
      return
    }
    if (!dueBackDateStr) {
      setCheckoutError('Please select a due back date')
      return
    }

    const proj = projects.find((p) => p.projectId === selectedProjectId)
    const staff = staffList.find((s) => s.uid === selectedStaffUid)
    const targetStaffName = isStaff ? (appUser?.name || staff?.name || 'Staff Member') : (staff?.name || 'Staff Member')
    const targetStaffUid = isStaff ? (appUser?.uid || selectedStaffUid) : selectedStaffUid

    try {
      setCheckoutSubmitting(true)

      const dueBack = new Date(dueBackDateStr)
      const eventDate = proj?.eventDate || new Date()

      await checkoutEquipmentBatch({
        items: selectedItems,
        staffUid: targetStaffUid,
        staffName: targetStaffName,
        projectId: selectedProjectId,
        eventName: proj?.eventName || proj?.clientName || 'Studio Shoot',
        eventDate,
        dueBack,
        checkedOutByUid: appUser?.uid || '',
        checkedOutByName: appUser?.name || (isStaff ? 'Staff' : 'Admin'),
        notes: checkoutNotes,
      })

      setCheckoutSuccessMsg(`Successfully checked out ${selectedItems.length} items to ${targetStaffName}!`)
      setSelectedGearIds([])
      setCheckoutNotes('')
      if (!isStaff) {
        setSelectedStaffUid('')
      }
      setTimeout(() => setCheckoutSuccessMsg(null), 5000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Checkout failed'
      setCheckoutError(msg)
    } finally {
      setCheckoutSubmitting(false)
    }
  }

  // ─── CHECKIN STATE ──────────────────────────────────────────────────────
  const [selectedCheckoutIds, setSelectedCheckoutIds] = useState<string[]>([])
  const [checkinCondition, setCheckinCondition] = useState<EquipmentCondition>('good')
  const [checkinNotes, setCheckinNotes] = useState<string>('')
  const [checkinSubmitting, setCheckinSubmitting] = useState(false)
  const [checkinSuccessMsg, setCheckinSuccessMsg] = useState<string | null>(null)
  const [checkinSearch, setCheckinSearch] = useState('')

  // Helper: check if a checkout record belongs to current staff user
  const isCheckoutForUser = (c: Checkout) => {
    if (!isStaff || !appUser) return true
    const matchesUid = Boolean(appUser.uid && c.staffUid === appUser.uid)
    const matchesName = Boolean(
      appUser.name &&
      c.staffName &&
      c.staffName.trim().toLowerCase() === appUser.name.trim().toLowerCase()
    )
    return matchesUid || matchesName
  }

  // Active checkouts scoped to current user (staff only see their own items)
  const userCheckouts = useMemo(() => {
    if (!isStaff || !appUser) return activeCheckouts
    return activeCheckouts.filter(isCheckoutForUser)
  }, [activeCheckouts, isStaff, appUser])

  const filteredCheckouts = useMemo(() => {
    let list = userCheckouts
    if (checkinSearch.trim()) {
      const q = checkinSearch.toLowerCase().trim()
      list = list.filter(
        (c) =>
          c.itemName.toLowerCase().includes(q) ||
          c.itemCode.toLowerCase().includes(q) ||
          c.staffName.toLowerCase().includes(q) ||
          c.eventName.toLowerCase().includes(q)
      )
    }
    return list
  }, [userCheckouts, checkinSearch])

  // Pagination for Check-in Returns (Tab 2)
  const [checkinPage, setCheckinPage] = useState<number>(1)
  const [checkinPageSize, setCheckinPageSize] = useState<number>(15)

  useEffect(() => {
    setCheckinPage(1)
  }, [checkinSearch])

  const totalCheckinPages = Math.max(1, Math.ceil(filteredCheckouts.length / checkinPageSize))
  const safeCheckinPage = Math.min(Math.max(1, checkinPage), totalCheckinPages)
  const paginatedCheckouts = useMemo(() => {
    const start = (safeCheckinPage - 1) * checkinPageSize
    return filteredCheckouts.slice(start, start + checkinPageSize)
  }, [filteredCheckouts, safeCheckinPage, checkinPageSize])

  // Overdue checkouts list (scoped to user checkouts)
  const overdueCheckouts = useMemo(() => {
    const now = new Date().getTime()
    return userCheckouts.filter((c) => c.dueBack.getTime() < now)
  }, [userCheckouts])

  const toggleSelectCheckout = (checkoutId: string) => {
    if (isStaff && appUser) {
      const co = activeCheckouts.find((c) => c.checkoutId === checkoutId)
      if (co && !isCheckoutForUser(co)) {
        return // Block selecting items belonging to other staff members
      }
    }
    setSelectedCheckoutIds((prev) =>
      prev.includes(checkoutId) ? prev.filter((id) => id !== checkoutId) : [...prev, checkoutId]
    )
  }

  const handleCheckinSubmit = async () => {
    if (selectedCheckoutIds.length === 0) return

    let toCheckin = activeCheckouts.filter((c) => selectedCheckoutIds.includes(c.checkoutId))
    if (isStaff && appUser) {
      toCheckin = toCheckin.filter(isCheckoutForUser)
    }

    if (toCheckin.length === 0) return

    try {
      setCheckinSubmitting(true)
      await checkinEquipmentBatch({
        checkouts: toCheckin,
        returnCondition: checkinCondition,
        notes: checkinNotes,
        checkedInByUid: appUser?.uid || '',
        checkedInByName: appUser?.name || 'Staff Member',
      })

      setCheckinSuccessMsg(`Checked in ${toCheckin.length} items back to studio inventory!`)
      setSelectedCheckoutIds([])
      setCheckinNotes('')
      setTimeout(() => setCheckinSuccessMsg(null), 5000)
    } catch (err: unknown) {
      console.error('[handleCheckinSubmit] Error:', err)
    } finally {
      setCheckinSubmitting(false)
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
          .checkout-workspace-grid {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) 360px !important;
            gap: 20px !important;
            align-items: start !important;
          }
        }
        @media (max-width: 767px) {
          .checkout-workspace-grid {
            display: flex !important;
            flex-direction: column !important;
            gap: 16px !important;
          }
        }
      `}</style>

      {/* ─── HEADER & NAVIGATION ──────────────────────────────────────── */}
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
                Equipment Check-out & Check-in
              </h1>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                Hand over gear to shoot crew, record returns, inspect conditions and avoid double booking.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link
              href="/erp/equipment/held"
              style={{
                height: '36px',
                padding: '0 14px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                color: 'var(--color-accent)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
              }}
            >
              <i className="ti ti-users" style={{ fontSize: '15px' }} />
              <span>Staff-Held View ({activeCheckouts.length})</span>
              <i className="ti ti-arrow-right" style={{ fontSize: '12px' }} />
            </Link>
          </div>
        </div>

        {/* Tab Toggle: Check out gear vs Check in returns vs Staff-held view */}
        <div
          className="flex flex-wrap sm:flex-nowrap w-full sm:w-fit"
          style={{
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '10px',
            padding: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('checkout')}
            className="flex-1 sm:flex-initial justify-center"
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'checkout' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'checkout' ? '#ffffff' : 'var(--color-foreground-muted)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <i className="ti ti-arrow-up-right" style={{ fontSize: '14px' }} />
            <span>Check Out <span className="hidden sm:inline">Gear</span> ({availableGear.length}<span className="hidden sm:inline"> ready</span>)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('checkin')}
            className="flex-1 sm:flex-initial justify-center"
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'checkin' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'checkin' ? '#ffffff' : 'var(--color-foreground-muted)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <i className="ti ti-arrow-down-left" style={{ fontSize: '14px' }} />
            <span>Check In <span className="hidden sm:inline">Returns</span> ({userCheckouts.length})</span>
            {overdueCheckouts.length > 0 && (
              <span
                style={{
                  fontSize: '10px',
                  background: 'var(--color-danger)',
                  color: '#ffffff',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontWeight: 700,
                }}
              >
                {overdueCheckouts.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ─── OVERDUE BANNER (if any) ──────────────────────────────────── */}
      {overdueCheckouts.length > 0 && (
        <div
          style={{
            background: 'var(--color-danger-muted)',
            border: '0.5px solid var(--color-danger)',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <i className="ti ti-alert-triangle" style={{ fontSize: '20px', color: 'var(--color-danger)', flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--color-foreground)' }}>
            <b>{overdueCheckouts.length} items overdue for return:</b>{' '}
            {overdueCheckouts
              .slice(0, 3)
              .map((c) => `${c.itemName} (${c.staffName} · due ${formatShortDate(c.dueBack)})`)
              .join(', ')}
            {overdueCheckouts.length > 3 && ` and ${overdueCheckouts.length - 3} more`}.
          </div>
          {activeTab !== 'checkin' && (
            <button
              type="button"
              onClick={() => setActiveTab('checkin')}
              style={{
                height: '28px',
                padding: '0 10px',
                borderRadius: '6px',
                background: 'var(--color-danger)',
                border: 'none',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Check in now
            </button>
          )}
        </div>
      )}

      {/* Success Notification */}
      {(checkoutSuccessMsg || checkinSuccessMsg) && (
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
          <span>{checkoutSuccessMsg || checkinSuccessMsg}</span>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : activeTab === 'checkout' ? (
        /* ═══════════════════════════════════════════════════════════════════
           TAB 1: CHECKOUT WORKSPACE
           ═══════════════════════════════════════════════════════════════════ */
        <div className="checkout-workspace-grid">
          {/* Left: Available Gear Selector Table / List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
            {/* Desktop Search & Filter Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Search */}
              <div style={{ position: 'relative', width: '240px' }} className="w-full sm:w-[240px]">
                <i
                  className="ti ti-search"
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-foreground-subtle)',
                    fontSize: '15px',
                  }}
                />
                <input
                  type="text"
                  value={gearSearch}
                  onChange={(e) => setGearSearch(e.target.value)}
                  placeholder="Search available gear"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    padding: '0 10px 0 32px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground)',
                    outline: 'none',
                    fontFamily: 'var(--font-inter)',
                  }}
                />
              </div>

              {/* Category */}
              <select
                value={gearCategory}
                onChange={(e) => setGearCategory(e.target.value)}
                style={{
                  height: '36px',
                  borderRadius: '8px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  padding: '0 10px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: 'var(--color-foreground)',
                  outline: 'none',
                  fontFamily: 'var(--font-inter)',
                }}
              >
                <option value="all">Category · All</option>
                <option value="camera">Camera Body</option>
                <option value="lens">Lens</option>
                <option value="drone">Drone</option>
                <option value="flash">Flash</option>
                <option value="gimbal">Gimbal</option>
                <option value="light">Light</option>
                <option value="tripod">Tripod</option>
                <option value="sdCard">SD Card</option>
                <option value="battery">Battery</option>
              </select>
            </div>

            {/* Available Gear List */}
            {filteredAvailableGear.length === 0 ? (
              <EmptyState
                icon="ti-camera-off"
                title="No available gear matches filter"
                description="All gear in this category may be checked out or in maintenance."
              />
            ) : (
              <div>
                {/* Desktop Table View (hidden on mobile < 768px) */}
                <div
                  className="hidden md:block"
                  style={{
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-surface-raised)' }}>
                        <th style={{ width: '42px', borderBottom: '0.5px solid var(--color-border-strong)', textAlign: 'center' }}></th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 14px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Item
                        </th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 14px', borderBottom: '0.5px solid var(--color-border-strong)', width: '120px' }}>
                          Category
                        </th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 14px', borderBottom: '0.5px solid var(--color-border-strong)', width: '110px' }}>
                          Bay / Shelf
                        </th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 14px', borderBottom: '0.5px solid var(--color-border-strong)', width: '100px' }}>
                          Condition
                        </th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '12px 14px', borderBottom: '0.5px solid var(--color-border-strong)', width: '100px' }}>
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedAvailableGear.map((item) => {
                        const isSelected = selectedGearIds.includes(item.itemId)
                        return (
                          <tr
                            key={item.itemId}
                            onClick={() => toggleSelectGear(item.itemId)}
                            style={{
                              cursor: 'pointer',
                              background: isSelected ? 'var(--color-primary-muted)' : 'transparent',
                              borderBottom: '0.5px solid var(--color-border)',
                              transition: 'all 0.1s ease',
                            }}
                          >
                            <td style={{ textAlign: 'center', padding: '10px 0' }}>
                              <i
                                className={isSelected ? 'ti ti-square-check-filled' : 'ti ti-square'}
                                style={{
                                  fontSize: '18px',
                                  color: isSelected ? 'var(--color-primary)' : 'var(--color-foreground-subtle)',
                                }}
                              />
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                                  {item.name}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', fontFamily: 'monospace' }}>
                                  {item.itemCode} {item.brand ? `· ${item.brand}` : ''}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--color-foreground-muted)', textTransform: 'capitalize' }}>
                              {item.category}
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--color-foreground-muted)', fontSize: 'var(--text-xs)' }}>
                              {item.location || 'Studio'}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  textTransform: 'capitalize',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background:
                                    item.condition === 'excellent'
                                      ? 'var(--color-success-muted)'
                                      : 'var(--color-surface-raised)',
                                  color:
                                    item.condition === 'excellent'
                                      ? 'var(--color-success)'
                                      : 'var(--color-foreground)',
                                }}
                              >
                                {item.condition}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span
                                style={{
                                  fontSize: 'var(--text-xs)',
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  background: 'var(--color-success-muted)',
                                  color: 'var(--color-success)',
                                }}
                              >
                                Available
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Cards (block on mobile < 768px) */}
                <div className="flex flex-col gap-2 md:hidden">
                  {paginatedAvailableGear.map((item) => {
                    const isSelected = selectedGearIds.includes(item.itemId)
                    return (
                      <div
                        key={item.itemId}
                        onClick={() => toggleSelectGear(item.itemId)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'var(--color-primary-muted)' : 'var(--color-surface)',
                          border: `0.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          borderRadius: '10px',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <i
                              className={isSelected ? 'ti ti-square-check-filled' : 'ti ti-square'}
                              style={{
                                fontSize: '20px',
                                color: isSelected ? 'var(--color-primary)' : 'var(--color-foreground-subtle)',
                                flexShrink: 0,
                              }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.name}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', fontFamily: 'monospace' }}>
                                {item.itemCode} {item.brand ? `· ${item.brand}` : ''}
                              </div>
                            </div>
                          </div>

                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              textTransform: 'capitalize',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background:
                                item.condition === 'excellent'
                                  ? 'var(--color-success-muted)'
                                  : 'var(--color-surface-raised)',
                              color:
                                item.condition === 'excellent'
                                  ? 'var(--color-success)'
                                  : 'var(--color-foreground)',
                              flexShrink: 0,
                            }}
                          >
                            {item.condition}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', paddingLeft: '30px' }}>
                          <span style={{ textTransform: 'capitalize' }}>
                            {item.category}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <i className="ti ti-map-pin" style={{ fontSize: '12px' }} />
                            {item.location || 'Studio'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* ─── AVAILABLE GEAR PAGINATION BAR ─────────────────── */}
                {filteredAvailableGear.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px',
                      padding: '10px 14px',
                      background: 'var(--color-surface)',
                      border: '0.5px solid var(--color-border)',
                      borderRadius: '10px',
                      marginTop: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                        Showing <b>{Math.min(filteredAvailableGear.length, (safeGearPage - 1) * gearPageSize + 1)}</b>–<b>{Math.min(filteredAvailableGear.length, safeGearPage * gearPageSize)}</b> of <b>{filteredAvailableGear.length}</b> items
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>Rows:</span>
                        <select
                          value={gearPageSize}
                          onChange={(e) => {
                            setGearPageSize(Number(e.target.value))
                            setGearPage(1)
                          }}
                          style={{
                            fontFamily: 'var(--font-inter)',
                            height: '28px',
                            background: 'var(--color-surface-raised)',
                            border: '0.5px solid var(--color-border)',
                            borderRadius: '6px',
                            padding: '0 6px',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-foreground)',
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <option value={10}>10</option>
                          <option value={15}>15</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }} className="sm:!w-auto justify-between sm:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safeGearPage <= 1}
                        onClick={() => setGearPage((p) => Math.max(1, p - 1))}
                        style={{ height: '30px', padding: '0 10px', fontSize: 'var(--text-xs)', gap: '4px' }}
                      >
                        <i className="ti ti-chevron-left" />
                        Prev
                      </Button>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '0 6px', color: 'var(--color-foreground)', whiteSpace: 'nowrap' }}>
                        {safeGearPage} / {totalGearPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safeGearPage >= totalGearPages}
                        onClick={() => setGearPage((p) => Math.min(totalGearPages, p + 1))}
                        style={{ height: '30px', padding: '0 10px', fontSize: 'var(--text-xs)', gap: '4px' }}
                      >
                        Next
                        <i className="ti ti-chevron-right" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Checkout Details Panel (Sticky) */}
          <div
            style={{
              position: 'sticky',
              top: '20px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>
              Checkout Summary
            </div>

            {checkoutError && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'var(--color-danger-muted)',
                  border: '0.5px solid var(--color-danger)',
                  color: 'var(--color-danger)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                {checkoutError}
              </div>
            )}

            {/* Event Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
                Target Event / Project <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                style={{
                  height: '36px',
                  borderRadius: '8px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  padding: '0 10px',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground)',
                  outline: 'none',
                }}
              >
                <option value="">Select Project / Shoot...</option>
                {projects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.eventName || p.clientName} ({formatShortDate(p.eventDate)})
                  </option>
                ))}
              </select>
            </div>

            {/* Staff / Crew Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
                Assign to Staff Member <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              {isStaff ? (
                <div
                  style={{
                    height: '36px',
                    borderRadius: '8px',
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    padding: '0 12px',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: 'var(--color-primary-muted)',
                        color: 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {(appUser?.name || 'S').charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {appUser?.name || 'Staff Member'}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: 'var(--color-primary)',
                        background: 'var(--color-primary-muted)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        flexShrink: 0,
                      }}
                    >
                      You
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--color-foreground-subtle)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      flexShrink: 0,
                    }}
                  >
                    <i className="ti ti-lock" style={{ fontSize: '13px' }} />
                    Locked
                  </span>
                </div>
              ) : (
                <select
                  value={selectedStaffUid}
                  onChange={(e) => setSelectedStaffUid(e.target.value)}
                  style={{
                    height: '36px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    padding: '0 10px',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-foreground)',
                    outline: 'none',
                  }}
                >
                  <option value="">Select Photographer / Crew...</option>
                  {staffList.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {s.name} ({s.jobTitle || 'Staff'})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Due Back Date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
                Expected Return Date <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <DateField
                value={dueBackDateStr}
                onChange={(val) => setDueBackDateStr(val)}
                placeholder="Return Date"
              />
            </div>

            {/* Selected Gear Items Pill Tray */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase' }}>
                  Selected Gear · {selectedItems.length}
                </span>
                {selectedItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedGearIds([])}
                    style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer', fontSize: '11px' }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {selectedItems.length === 0 ? (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px dashed var(--color-border)',
                    textAlign: 'center',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-foreground-subtle)',
                  }}
                >
                  Click gear items in table to select
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {selectedItems.map((s) => (
                    <div
                      key={s.itemId}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: 'var(--color-surface-raised)',
                        border: '0.5px solid var(--color-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <i className="ti ti-camera" style={{ fontSize: '13px', color: 'var(--color-primary)' }} />
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleSelectGear(s.itemId)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--color-foreground-subtle)', cursor: 'pointer' }}
                      >
                        <i className="ti ti-x" style={{ fontSize: '13px' }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Condition / Handover Notes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
                Handover Notes / Accessories
              </label>
              <textarea
                rows={2}
                value={checkoutNotes}
                onChange={(e) => setCheckoutNotes(e.target.value)}
                placeholder="e.g. 2 batteries + dual charger handed over"
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

            {/* Submit Button */}
            <button
              type="button"
              disabled={checkoutSubmitting || selectedItems.length === 0}
              onClick={handleCheckoutSubmit}
              style={{
                height: '38px',
                borderRadius: '8px',
                background: 'var(--color-primary)',
                border: 'none',
                color: '#ffffff',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                cursor: checkoutSubmitting || selectedItems.length === 0 ? 'not-allowed' : 'pointer',
                opacity: checkoutSubmitting || selectedItems.length === 0 ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {checkoutSubmitting && <i className="ti ti-loader animate-spin" />}
              <span>Check out {selectedItems.length} items</span>
            </button>
          </div>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════
           TAB 2: CHECKIN RETURNS WORKSPACE
           ═══════════════════════════════════════════════════════════════════ */
        <div className="checkout-workspace-grid">
          {/* Active Checkouts List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
            {/* Search toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: '320px' }} className="w-full sm:w-[320px]">
                <i
                  className="ti ti-search"
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-foreground-subtle)',
                    fontSize: '15px',
                  }}
                />
                <input
                  type="text"
                  value={checkinSearch}
                  onChange={(e) => setCheckinSearch(e.target.value)}
                  placeholder="Search by gear name, code, staff, or event..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    padding: '0 10px 0 32px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground)',
                    outline: 'none',
                    fontFamily: 'var(--font-inter)',
                  }}
                />
              </div>

              <div style={{ flex: 1 }} className="hidden sm:block" />

              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                {isStaff ? (
                  <><b>{filteredCheckouts.length}</b> item{filteredCheckouts.length !== 1 ? 's' : ''} checked out to you</>
                ) : (
                  <>{filteredCheckouts.length} item{filteredCheckouts.length !== 1 ? 's' : ''} currently out</>
                )}
              </span>
            </div>

            {filteredCheckouts.length === 0 ? (
              <EmptyState
                icon="ti-check"
                title={isStaff ? 'No items checked out to you' : 'All gear is in studio'}
                description={
                  isStaff
                    ? 'You currently have no studio gear in your possession to return.'
                    : 'There are currently no items checked out in the field.'
                }
              />
            ) : (
              <div>
                {/* Desktop Table View (hidden on mobile < 768px) */}
                <div
                  className="hidden md:block"
                  style={{
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-surface-raised)' }}>
                        <th style={{ width: '42px', borderBottom: '0.5px solid var(--color-border-strong)', textAlign: 'center' }}></th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Item Checked Out
                        </th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Assigned To
                        </th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-strong)' }}>
                          Event / Shoot
                        </th>
                        <th style={{ textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-foreground-subtle)', padding: '10px 12px', borderBottom: '0.5px solid var(--color-border-strong)', width: '100px' }}>
                          Due Date
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCheckouts.map((co) => {
                        const isSelected = selectedCheckoutIds.includes(co.checkoutId)
                        const isLate = co.dueBack.getTime() < new Date().getTime()

                        return (
                          <tr
                            key={co.checkoutId}
                            onClick={() => toggleSelectCheckout(co.checkoutId)}
                            style={{
                              cursor: 'pointer',
                              background: isSelected ? 'var(--color-secondary-muted)' : 'transparent',
                              borderBottom: '0.5px solid var(--color-border)',
                              transition: 'all 0.1s ease',
                            }}
                          >
                            <td style={{ textAlign: 'center', padding: '10px 0' }}>
                              <i
                                className={isSelected ? 'ti ti-square-check-filled' : 'ti ti-square'}
                                style={{
                                  fontSize: '18px',
                                  color: isSelected ? 'var(--color-secondary)' : 'var(--color-foreground-subtle)',
                                }}
                              />
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                                  {co.itemName}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', fontFamily: 'monospace' }}>
                                  {co.itemCode}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--color-foreground)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div
                                  style={{
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    background: 'var(--color-primary-muted)',
                                    color: 'var(--color-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                  }}
                                >
                                  {co.staffName.charAt(0)}
                                </div>
                                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>{co.staffName}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--color-foreground-muted)', fontSize: 'var(--text-xs)' }}>
                              {co.eventName}
                            </td>
                            <td
                              style={{
                                padding: '10px 12px',
                                fontSize: 'var(--text-xs)',
                                fontWeight: isLate ? 700 : 500,
                                color: isLate ? 'var(--color-danger)' : 'var(--color-foreground-muted)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {isLate && <i className="ti ti-alert-triangle" style={{ fontSize: '12px' }} />}
                                <span>{formatShortDate(co.dueBack)}</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Cards (block on mobile < 768px) */}
                <div className="flex flex-col gap-2 md:hidden">
                  {paginatedCheckouts.map((co) => {
                    const isSelected = selectedCheckoutIds.includes(co.checkoutId)
                    const isLate = co.dueBack.getTime() < new Date().getTime()
                    return (
                      <div
                        key={co.checkoutId}
                        onClick={() => toggleSelectCheckout(co.checkoutId)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'var(--color-secondary-muted)' : 'var(--color-surface)',
                          border: `0.5px solid ${isSelected ? 'var(--color-secondary)' : isLate ? 'var(--color-danger)' : 'var(--color-border)'}`,
                          borderRadius: '10px',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <i
                              className={isSelected ? 'ti ti-square-check-filled' : 'ti ti-square'}
                              style={{
                                fontSize: '20px',
                                color: isSelected ? 'var(--color-secondary)' : 'var(--color-foreground-subtle)',
                                flexShrink: 0,
                              }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {co.itemName}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', fontFamily: 'monospace' }}>
                                {co.itemCode}
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontWeight: isLate ? 700 : 500,
                              fontSize: '11px',
                              color: isLate ? 'var(--color-danger)' : 'var(--color-foreground-muted)',
                              flexShrink: 0,
                            }}
                          >
                            {isLate && <i className="ti ti-alert-triangle" style={{ fontSize: '12px' }} />}
                            <span>{isLate ? 'OVERDUE: ' : 'Due: '}{formatShortDate(co.dueBack)}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', paddingLeft: '30px', flexWrap: 'wrap', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div
                              style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                background: 'var(--color-primary-muted)',
                                color: 'var(--color-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '9px',
                                fontWeight: 700,
                              }}
                            >
                              {co.staffName.charAt(0)}
                            </div>
                            <span>{co.staffName}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <i className="ti ti-calendar-event" style={{ fontSize: '12px' }} />
                            <span>{co.eventName}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* ─── CHECKIN RETURNS PAGINATION BAR ─────────────────── */}
                {filteredCheckouts.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px',
                      padding: '10px 14px',
                      background: 'var(--color-surface)',
                      border: '0.5px solid var(--color-border)',
                      borderRadius: '10px',
                      marginTop: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                        Showing <b>{Math.min(filteredCheckouts.length, (safeCheckinPage - 1) * checkinPageSize + 1)}</b>–<b>{Math.min(filteredCheckouts.length, safeCheckinPage * checkinPageSize)}</b> of <b>{filteredCheckouts.length}</b> items
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>Rows:</span>
                        <select
                          value={checkinPageSize}
                          onChange={(e) => {
                            setCheckinPageSize(Number(e.target.value))
                            setCheckinPage(1)
                          }}
                          style={{
                            fontFamily: 'var(--font-inter)',
                            height: '28px',
                            background: 'var(--color-surface-raised)',
                            border: '0.5px solid var(--color-border)',
                            borderRadius: '6px',
                            padding: '0 6px',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-foreground)',
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <option value={10}>10</option>
                          <option value={15}>15</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }} className="sm:!w-auto justify-between sm:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safeCheckinPage <= 1}
                        onClick={() => setCheckinPage((p) => Math.max(1, p - 1))}
                        style={{ height: '30px', padding: '0 10px', fontSize: 'var(--text-xs)', gap: '4px' }}
                      >
                        <i className="ti ti-chevron-left" />
                        Prev
                      </Button>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '0 6px', color: 'var(--color-foreground)', whiteSpace: 'nowrap' }}>
                        {safeCheckinPage} / {totalCheckinPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safeCheckinPage >= totalCheckinPages}
                        onClick={() => setCheckinPage((p) => Math.min(totalCheckinPages, p + 1))}
                        style={{ height: '30px', padding: '0 10px', fontSize: 'var(--text-xs)', gap: '4px' }}
                      >
                        Next
                        <i className="ti ti-chevron-right" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Return Inspection & Check-in Panel */}
          <div
            style={{
              position: 'sticky',
              top: '20px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>
              Return Inspection
            </div>

            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
              Selected <b>{selectedCheckoutIds.length} items</b> to return to studio availability.
            </div>

            {/* Condition on return */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
                Condition on Return
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {(['excellent', 'good', 'canUse', 'service'] as EquipmentCondition[]).map((cond) => {
                  const isSelected = checkinCondition === cond
                  return (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => setCheckinCondition(cond)}
                      style={{
                        padding: '6px 8px',
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
                      {cond}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Return Notes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-foreground-subtle)' }}>
                Inspection Notes / Damage / Missing Parts
              </label>
              <textarea
                rows={3}
                value={checkinNotes}
                onChange={(e) => setCheckinNotes(e.target.value)}
                placeholder="e.g. Returned clean, lens hood intact, battery recharged."
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

            {/* Checkin Action Button */}
            <button
              type="button"
              disabled={checkinSubmitting || selectedCheckoutIds.length === 0}
              onClick={handleCheckinSubmit}
              style={{
                height: '38px',
                borderRadius: '8px',
                background: 'var(--color-success)',
                border: 'none',
                color: '#ffffff',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                cursor: checkinSubmitting || selectedCheckoutIds.length === 0 ? 'not-allowed' : 'pointer',
                opacity: checkinSubmitting || selectedCheckoutIds.length === 0 ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {checkinSubmitting && <i className="ti ti-loader animate-spin" />}
              <span>Check in {selectedCheckoutIds.length} items</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
