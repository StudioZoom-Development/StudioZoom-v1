'use client'

import React from 'react'
import Link from 'next/link'
import type { DashboardAggregates } from '@/lib/firebase/queries/dashboard'

interface DashboardCashflowStripProps {
  months: DashboardAggregates['cashflowMonths']
}

export function DashboardCashflowStrip({ months }: DashboardCashflowStripProps) {
  const currentMonthData = months[months.length - 1] || { month: '', income: 0, outflow: 0, net: 0 }
  const isNetPositive = currentMonthData.net >= 0

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

          {/* Current Month Net Callout */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Net:</span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: isNetPositive ? 'var(--color-success)' : 'var(--color-danger)',
              }}
            >
              {isNetPositive ? '+' : ''}₹{Math.abs(currentMonthData.net).toLocaleString('en-IN')}
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
          }}
        >
          {months.map((m, idx) => {
            const incomeHeight = Math.max(6, Math.round((m.income / maxVal) * 115))
            const outflowHeight = Math.max(6, Math.round((m.outflow / maxVal) * 115))

            return (
              <div
                key={idx}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  height: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px' }}>
                  {/* Income Bar */}
                  <div
                    title={`Income: ₹${m.income.toLocaleString('en-IN')}`}
                    style={{
                      width: 'clamp(12px, 2.6vw, 20px)',
                      height: `${incomeHeight}px`,
                      borderRadius: '3px 3px 0 0',
                      background: 'var(--color-primary)',
                      transition: 'height 0.3s ease',
                    }}
                  />
                  {/* Outflow Bar */}
                  <div
                    title={`Outflow: ₹${m.outflow.toLocaleString('en-IN')}`}
                    style={{
                      width: 'clamp(12px, 2.6vw, 20px)',
                      height: `${outflowHeight}px`,
                      borderRadius: '3px 3px 0 0',
                      background: 'var(--color-secondary)',
                      opacity: 0.9,
                      transition: 'height 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* X-Axis Month Labels */}
        <div style={{ display: 'flex' }}>
          {months.map((m, idx) => (
            <div
              key={idx}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--color-foreground-subtle)',
              }}
            >
              {m.month}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
