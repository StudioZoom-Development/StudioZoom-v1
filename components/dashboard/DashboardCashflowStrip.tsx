'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import type { DashboardAggregates } from '@/lib/firebase/queries/dashboard'

interface DashboardCashflowStripProps {
  months: DashboardAggregates['cashflowMonths']
}

function formatINR(val: number): string {
  const abs = Math.abs(val)
  const formatted = '₹' + abs.toLocaleString('en-IN')
  return val < 0 ? `−${formatted}` : formatted
}

function formatCompactINR(val: number): string {
  const abs = Math.abs(val)
  let str = ''
  if (abs >= 10000000) {
    str = (abs / 10000000).toFixed(1) + 'Cr'
  } else if (abs >= 100000) {
    str = (abs / 100000).toFixed(1) + 'L'
  } else if (abs >= 1000) {
    str = (abs / 1000).toFixed(1) + 'k'
  } else {
    str = abs.toLocaleString('en-IN')
  }
  return (val < 0 ? '−₹' : '₹') + str
}

export function DashboardCashflowStrip({ months }: DashboardCashflowStripProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const currentMonthData = months[months.length - 1] || { month: '', income: 0, outflow: 0, net: 0 }
  const activeData = (hoveredIdx !== null ? months[hoveredIdx] : null) || currentMonthData
  const isActiveNetPositive = activeData.net >= 0

  // Calculate highest bar value for scaling
  const maxVal = Math.max(
    1,
    ...months.map(m => Math.max(m.income, m.outflow))
  )

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Executive Cashflow
            </span>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: '4px',
                background: 'var(--color-primary-muted)',
                color: 'var(--color-primary)',
              }}
            >
              ADMIN
            </span>
          </div>
          <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
            Last 6 months collection vs outflow
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: 'var(--color-primary)' }} />
              <span style={{ fontSize: '10px', color: 'var(--color-foreground-muted)' }}>In</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: 'var(--color-secondary)' }} />
              <span style={{ fontSize: '10px', color: 'var(--color-foreground-muted)' }}>Out</span>
            </div>
          </div>

          {/* Current / Hovered Month Net Callout */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
              {activeData.month} Net:
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: activeData.net === 0
                  ? 'var(--color-foreground-muted)'
                  : isActiveNetPositive
                  ? 'var(--color-success)'
                  : 'var(--color-danger)',
              }}
            >
              {formatCompactINR(activeData.net)}
            </span>
          </div>

          <Link
            href="/erp/cashflow"
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
            Hub <i className="ti ti-arrow-right" style={{ fontSize: '12px' }} />
          </Link>
        </div>
      </div>

      {/* Chart Area Wrapper */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', gap: '6px' }}>
        {/* Chart Canvas */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            height: '135px',
            paddingBottom: '8px',
            borderBottom: '0.5px solid var(--color-border)',
            position: 'relative',
          }}
        >
          {months.map((m, idx) => {
            const incomeHeight = Math.max(6, Math.round((m.income / maxVal) * 115))
            const outflowHeight = Math.max(6, Math.round((m.outflow / maxVal) * 115))
            const isHovered = hoveredIdx === idx

            return (
              <div
                key={idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  height: '100%',
                  position: 'relative',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  background: isHovered ? 'var(--color-surface-raised)' : 'transparent',
                  transition: 'background 0.2s ease',
                  padding: '0 2px',
                }}
              >
                {/* Floating Tooltip Card */}
                {isHovered && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 6px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'var(--color-surface-overlay)',
                      border: '0.5px solid var(--color-border-strong)',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                      zIndex: 50,
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      minWidth: '145px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--color-foreground)',
                        borderBottom: '0.5px solid var(--color-border)',
                        paddingBottom: '3px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span>{m.fullMonthLabel || m.month}</span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: m.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                        }}
                      >
                        {formatCompactINR(m.net)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', gap: '8px' }}>
                      <span style={{ color: 'var(--color-foreground-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '2px', background: 'var(--color-primary)' }} />
                        Inflow:
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>₹{m.income.toLocaleString('en-IN')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', gap: '8px' }}>
                      <span style={{ color: 'var(--color-foreground-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '2px', background: 'var(--color-secondary)' }} />
                        Outflow:
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>₹{m.outflow.toLocaleString('en-IN')}</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '10px',
                        paddingTop: '3px',
                        borderTop: '0.5px solid var(--color-border)',
                        gap: '8px',
                      }}
                    >
                      <span style={{ color: 'var(--color-foreground-subtle)' }}>Net:</span>
                      <span style={{ fontWeight: 700, color: m.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {formatINR(m.net)}
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px' }}>
                  {/* Income Bar */}
                  <div
                    style={{
                      width: 'clamp(12px, 2.6vw, 20px)',
                      height: `${incomeHeight}px`,
                      borderRadius: '3px 3px 0 0',
                      background: 'var(--color-primary)',
                      filter: isHovered ? 'brightness(1.15)' : 'none',
                      transition: 'height 0.3s ease, filter 0.2s ease',
                    }}
                  />
                  {/* Outflow Bar */}
                  <div
                    style={{
                      width: 'clamp(12px, 2.6vw, 20px)',
                      height: `${outflowHeight}px`,
                      borderRadius: '3px 3px 0 0',
                      background: 'var(--color-secondary)',
                      opacity: isHovered ? 1 : 0.9,
                      filter: isHovered ? 'brightness(1.15)' : 'none',
                      transition: 'height 0.3s ease, opacity 0.2s ease, filter 0.2s ease',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* X-Axis Month Labels */}
        <div style={{ display: 'flex' }}>
          {months.map((m, idx) => {
            const isHovered = hoveredIdx === idx
            return (
              <div
                key={idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: '11px',
                  fontWeight: isHovered ? 700 : 500,
                  color: isHovered ? 'var(--color-foreground)' : 'var(--color-foreground-subtle)',
                  cursor: 'pointer',
                  transition: 'color 0.2s ease',
                }}
              >
                {m.month}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
