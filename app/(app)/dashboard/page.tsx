'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import {
  subscribeToDashboardData,
  type DashboardAggregates,
} from '@/lib/firebase/queries/dashboard'
import { DashboardKpis } from '@/components/dashboard/DashboardKpis'
import { UpcomingShootsFeed } from '@/components/dashboard/UpcomingShootsFeed'
import { AttendancePulseWidget } from '@/components/dashboard/AttendancePulseWidget'
import { PostProdRadar } from '@/components/dashboard/PostProdRadar'
import { EquipmentCustodyRadar } from '@/components/dashboard/EquipmentCustodyRadar'
import { DashboardCashflowStrip } from '@/components/dashboard/DashboardCashflowStrip'

export default function DashboardPage() {
  const router = useRouter()
  const { appUser, loading: authLoading } = useAuthStore()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardAggregates | null>(null)

  // Redirect staff members directly to their Work Board
  useEffect(() => {
    if (!authLoading && appUser && appUser.role === 'staff') {
      router.replace('/events/work-board')
    }
  }, [authLoading, appUser, router])

  // Subscribe to reactive dashboard aggregates
  useEffect(() => {
    if (!appUser || appUser.role === 'staff') return

    const unsub = subscribeToDashboardData((snapshot) => {
      setData(snapshot)
      setLoading(false)
    })

    return () => unsub()
  }, [appUser])

  // Get dynamic time-of-day greeting
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  // Current formatted date
  const todayFormatted = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  // Loading or redirecting state
  if (authLoading || (appUser?.role === 'staff')) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: '12px',
          color: 'var(--color-foreground-muted)',
        }}
      >
        <i className="ti ti-loader-2 animate-spin" style={{ fontSize: '28px', color: 'var(--color-primary)' }} />
        <span style={{ fontSize: 'var(--text-sm)' }}>
          {appUser?.role === 'staff' ? 'Redirecting to Work Board...' : 'Loading Studio Zoom...'}
        </span>
      </div>
    )
  }

  const role = appUser?.role || 'admin'
  const firstName = appUser?.name?.trim().split(' ')[0] || 'Studio Leader'

  return (
    <div
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      {/* ─── 1. Header & Quick Action Dock ───────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        {/* Left: Greeting & Studio Date */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                color: 'var(--color-foreground)',
                margin: 0,
              }}
            >
              {getGreeting()},{' '}
              <span className="greeting-name-script">{firstName}</span>
            </h1>
          </div>

          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-foreground-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{todayFormatted} · Avadi Studio</span>
            {data && data.eventsThisMonthCount > 0 && (
              <>
                <span>·</span>
                <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>
                  {data.eventsThisMonthCount} shoots this month
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: Quick Action Buttons */}
        <div
          className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          <Link
            href="/clients/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              height: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              background: 'var(--color-primary)',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <i className="ti ti-plus" style={{ fontSize: '14px' }} />
            New Booking
          </Link>

          <Link
            href="/leads/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              height: '34px',
              padding: '0 11px',
              borderRadius: '8px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground)',
              fontSize: '11px',
              fontWeight: 500,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <i className="ti ti-user-plus" style={{ fontSize: '14px', color: 'var(--color-accent)' }} />
            New Lead
          </Link>

          <Link
            href="/erp/equipment/checkout"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              height: '34px',
              padding: '0 11px',
              borderRadius: '8px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground)',
              fontSize: '11px',
              fontWeight: 500,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <i className="ti ti-camera-plus" style={{ fontSize: '14px', color: 'var(--color-secondary)' }} />
            Checkout Gear
          </Link>

          {role === 'admin' && (
            <Link
              href="/erp/accounts"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                height: '34px',
                padding: '0 11px',
                borderRadius: '8px',
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                color: 'var(--color-foreground)',
                fontSize: '11px',
                fontWeight: 500,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <i className="ti ti-wallet" style={{ fontSize: '14px', color: 'var(--color-success)' }} />
              Accounts
            </Link>
          )}
        </div>
      </div>

      {/* ─── 2. Hero KPI Rail ────────────────────────────────────────────── */}
      {loading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '10px',
                padding: '12px',
                height: '68px',
                opacity: 0.6,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ width: '40%', height: '10px', background: 'var(--color-surface-raised)', borderRadius: '4px' }} />
              <div style={{ width: '60%', height: '20px', background: 'var(--color-surface-raised)', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
      ) : (
        <DashboardKpis data={data} role={role} />
      )}

      {/* ─── 3. Main Operational Command Center (Shoots 60% + Attendance 40%) ─── */}
      <div className="dashboard-ops-grid">
        <UpcomingShootsFeed events={data?.upcomingEvents || []} />
        <AttendancePulseWidget
          attendance={
            data?.attendanceSummary || {
              totalStaff: 0,
              clockedInCount: 0,
              records: [],
            }
          }
        />
      </div>

      {/* ─── 4. Health Radars & Executive Cashflow ──────────────────────── */}
      <div className={role === 'admin' ? 'dashboard-radars-grid-3' : 'dashboard-radars-grid-2'}>
        <PostProdRadar
          radar={
            data?.postProdRadar || {
              photoTrack:     { inProgress: 0, inReview: 0, completed: 0 },
              albumTrack:     { inProgress: 0, inReview: 0, completed: 0 },
              videoTrack:     { inProgress: 0, inReview: 0, completed: 0 },
              fullVideoTrack: { inProgress: 0, inReview: 0, completed: 0 },
            }
          }
          overdueCount={data?.overdueEditingTasksCount || 0}
        />
        <EquipmentCustodyRadar
          gearOnFieldCount={data?.gearOnFieldCount || 0}
          gearOverdueCount={data?.gearOverdueCount || 0}
          recentCheckouts={data?.recentCheckouts || []}
        />
        {role === 'admin' && data?.cashflowMonths && data.cashflowMonths.length > 0 && (
          <DashboardCashflowStrip months={data.cashflowMonths} />
        )}
      </div>
    </div>
  )
}
