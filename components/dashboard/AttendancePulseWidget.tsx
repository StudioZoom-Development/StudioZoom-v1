'use client'

import React from 'react'
import Link from 'next/link'
import type { DashboardAggregates } from '@/lib/firebase/queries/dashboard'

interface AttendancePulseWidgetProps {
  attendance: DashboardAggregates['attendanceSummary']
}

function getInitials(name: string): string {
  if (!name) return 'SZ'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function AttendancePulseWidget({ attendance }: AttendancePulseWidgetProps) {
  const { totalStaff, clockedInCount, records } = attendance

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '12px',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
            Today&apos;s Attendance
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '1px 7px',
              borderRadius: '8px',
              background: clockedInCount > 0 ? 'var(--color-success-muted)' : 'var(--color-surface-raised)',
              color: clockedInCount > 0 ? 'var(--color-success)' : 'var(--color-foreground-muted)',
              border: '0.5px solid var(--color-border)',
            }}
          >
            {clockedInCount} / {totalStaff} In
          </span>
        </div>
        <Link
          href="/hrms/attendance"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--color-accent)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          View Grid <i className="ti ti-arrow-right" style={{ fontSize: '12px' }} />
        </Link>
      </div>

      {/* Staff List */}
      {records.length === 0 ? (
        <div
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--color-foreground-muted)',
          }}
        >
          <i className="ti ti-users" style={{ fontSize: '24px', color: 'var(--color-foreground-subtle)' }} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
            No staff records available for today.
          </span>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            maxHeight: '230px',
            overflowY: 'auto',
            paddingRight: '2px',
          }}
        >
          {records.map((st) => {
            const isPresent = st.status === 'present'
            const dotColor = isPresent ? 'var(--color-success)' : 'var(--color-foreground-subtle)'

            return (
              <div
                key={st.uid}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '7px 8px',
                  borderRadius: '6px',
                  borderBottom: '0.5px solid var(--color-border)',
                }}
              >
                {/* Initials Avatar */}
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: 'var(--color-primary-muted)',
                    color: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {getInitials(st.name)}
                </div>

                {/* Name & Role */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      color: 'var(--color-foreground)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {st.name}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--color-foreground-subtle)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {st.role}
                  </span>
                </div>

                {/* Clock-in Time */}
                <span
                  style={{
                    fontSize: '11px',
                    color: isPresent ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)',
                    fontWeight: isPresent ? 500 : 400,
                    flexShrink: 0,
                  }}
                >
                  {st.time && st.time !== 'Invalid Date' ? st.time : isPresent ? 'Checked in' : 'Not in yet'}
                </span>

                {/* Status Dot */}
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                  }}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
