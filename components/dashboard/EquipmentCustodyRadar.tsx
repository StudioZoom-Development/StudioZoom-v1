'use client'

import React from 'react'
import Link from 'next/link'
import type { DashboardCheckoutItem } from '@/lib/firebase/queries/dashboard'

interface EquipmentCustodyRadarProps {
  gearOnFieldCount: number
  gearOverdueCount: number
  recentCheckouts: DashboardCheckoutItem[]
}

export function EquipmentCustodyRadar({
  gearOnFieldCount,
  gearOverdueCount,
  recentCheckouts,
}: EquipmentCustodyRadarProps) {
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
            Equipment Custody
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '1px 7px',
              borderRadius: '8px',
              background: 'var(--color-surface-raised)',
              color: 'var(--color-foreground-muted)',
              border: '0.5px solid var(--color-border)',
            }}
          >
            {gearOnFieldCount} On Field
          </span>
          {gearOverdueCount > 0 && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: '6px',
                background: 'var(--color-danger-muted)',
                color: 'var(--color-danger)',
              }}
            >
              {gearOverdueCount} Overdue
            </span>
          )}
        </div>
        <Link
          href="/erp/equipment"
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
          All Gear <i className="ti ti-arrow-right" style={{ fontSize: '12px' }} />
        </Link>
      </div>

      {/* Checkouts List */}
      {recentCheckouts.length === 0 ? (
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
          <i className="ti ti-camera-check" style={{ fontSize: '24px', color: 'var(--color-foreground-subtle)' }} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
            All gear in storage.
          </span>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '7px',
            flex: 1,
            overflowY: 'auto',
            paddingRight: '2px',
          }}
        >
          {recentCheckouts.map((co) => {
            const isDateValid = co.dueBackDate instanceof Date && !isNaN(co.dueBackDate.getTime())
            const dueStr = isDateValid
              ? co.dueBackDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
              : 'Today'

            return (
              <div
                key={co.checkoutId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '0.5px solid var(--color-border)',
                  background: 'var(--color-background)',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: co.isOverdue ? 'var(--color-danger-muted)' : 'var(--color-surface-raised)',
                    color: co.isOverdue ? 'var(--color-danger)' : 'var(--color-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <i className="ti ti-camera" style={{ fontSize: '16px' }} />
                </div>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      color: 'var(--color-foreground)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {co.itemName}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-foreground-muted)' }}>
                    With {co.staffName}
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: co.isOverdue ? 'var(--color-danger-muted)' : 'var(--color-surface-raised)',
                    color: co.isOverdue ? 'var(--color-danger)' : 'var(--color-foreground-muted)',
                    flexShrink: 0,
                  }}
                >
                  {co.isOverdue ? `Overdue (${dueStr})` : `Due ${dueStr}`}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
