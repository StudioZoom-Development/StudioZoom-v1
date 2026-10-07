'use client'

import React from 'react'
import type { DashboardAggregates } from '@/lib/firebase/queries/dashboard'
import type { UserRole } from '@/types'

interface DashboardKpisProps {
  data: DashboardAggregates
  role: UserRole
}

export function DashboardKpis({ data, role }: DashboardKpisProps) {
  const isAdmin = role === 'admin'

  const adminCards = [
    {
      label: 'Revenue MTD',
      value: `₹${data.revenueMtd.toLocaleString('en-IN')}`,
      sub: data.revenueGrowthPct !== 0
        ? `${data.revenueGrowthPct > 0 ? '+' : ''}${data.revenueGrowthPct}% vs last month`
        : 'Collections this month',
      icon: 'ti-trending-up',
      iconColor: 'var(--color-success)',
      iconBg: 'var(--color-success-muted)',
      valueColor: 'var(--color-primary)',
    },
    {
      label: 'Pending Receivables',
      value: `₹${data.pendingReceivables.toLocaleString('en-IN')}`,
      sub: data.overdueClientsCount > 0
        ? `${data.overdueClientsCount} clients overdue`
        : 'All balances current',
      icon: 'ti-clock-dollar',
      iconColor: data.pendingReceivables > 0 ? 'var(--color-secondary)' : 'var(--color-foreground-muted)',
      iconBg: data.pendingReceivables > 0 ? 'var(--color-secondary-muted)' : 'var(--color-surface-raised)',
      valueColor: 'var(--color-foreground)',
    },
    {
      label: 'Active Projects',
      value: String(data.activeProjectsCount),
      sub: `${data.eventsThisMonthCount} shoots scheduled this month`,
      icon: 'ti-calendar-event',
      iconColor: 'var(--color-accent)',
      iconBg: 'var(--color-accent-muted)',
      valueColor: 'var(--color-foreground)',
    },
    {
      label: 'Action Needed',
      value: String(data.overdueEditingTasksCount + data.gearOverdueCount),
      sub: `${data.overdueEditingTasksCount} tasks · ${data.gearOverdueCount} overdue gear`,
      icon: 'ti-alert-triangle',
      iconColor: data.overdueEditingTasksCount + data.gearOverdueCount > 0 ? 'var(--color-danger)' : 'var(--color-success)',
      iconBg: data.overdueEditingTasksCount + data.gearOverdueCount > 0 ? 'var(--color-danger-muted)' : 'var(--color-success-muted)',
      valueColor: data.overdueEditingTasksCount + data.gearOverdueCount > 0 ? 'var(--color-danger)' : 'var(--color-success)',
    },
  ]

  const managerCards = [
    {
      label: 'Active Projects',
      value: String(data.activeProjectsCount),
      sub: `${data.eventsThisMonthCount} shoots scheduled this month`,
      icon: 'ti-calendar-event',
      iconColor: 'var(--color-accent)',
      iconBg: 'var(--color-accent-muted)',
      valueColor: 'var(--color-primary)',
    },
    {
      label: 'Overdue Editing Tasks',
      value: String(data.overdueEditingTasksCount),
      sub: data.overdueEditingTasksCount > 0 ? 'Past client delivery commitment' : 'All post-prod on track',
      icon: 'ti-alert-triangle',
      iconColor: data.overdueEditingTasksCount > 0 ? 'var(--color-danger)' : 'var(--color-success)',
      iconBg: data.overdueEditingTasksCount > 0 ? 'var(--color-danger-muted)' : 'var(--color-success-muted)',
      valueColor: data.overdueEditingTasksCount > 0 ? 'var(--color-danger)' : 'var(--color-foreground)',
    },
    {
      label: 'Awaiting Client Review',
      value: String(data.awaitingClientReviewCount),
      sub: 'Pending client feedback / sign-off',
      icon: 'ti-eye',
      iconColor: 'var(--color-secondary)',
      iconBg: 'var(--color-secondary-muted)',
      valueColor: 'var(--color-foreground)',
    },
    {
      label: 'Gear on Field',
      value: String(data.gearOnFieldCount),
      sub: data.gearOverdueCount > 0 ? `${data.gearOverdueCount} overdue for return` : 'In custody with staff',
      icon: 'ti-camera',
      iconColor: data.gearOverdueCount > 0 ? 'var(--color-danger)' : 'var(--color-accent)',
      iconBg: data.gearOverdueCount > 0 ? 'var(--color-danger-muted)' : 'var(--color-accent-muted)',
      valueColor: 'var(--color-foreground)',
    },
  ]

  const cards = isAdmin ? adminCards : managerCards

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
      {cards.map((card, i) => (
        <div
          key={i}
          className="transition-colors"
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {/* Card Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--color-foreground-muted)',
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
              }}
            >
              {card.label}
            </span>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: card.iconBg,
                color: card.iconColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className={`ti ${card.icon}`} style={{ fontSize: '13px' }} />
            </div>
          </div>

          {/* Metric Value */}
          <div
            style={{
              fontSize: 'clamp(1.15rem, 1.8vw, var(--text-xl))',
              fontWeight: 700,
              lineHeight: 1.15,
              color: card.valueColor,
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {card.value}
          </div>

          {/* Subtitle / Context */}
          <div
            style={{
              fontSize: '10px',
              color: 'var(--color-foreground-subtle)',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {card.sub}
          </div>
        </div>
      ))}
    </div>
  )
}
