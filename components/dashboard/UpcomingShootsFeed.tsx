'use client'

import React from 'react'
import Link from 'next/link'
import { Badge } from '@/components/shared/Badge'
import type { DashboardEventItem } from '@/lib/firebase/queries/dashboard'

interface UpcomingShootsFeedProps {
  events: DashboardEventItem[]
}

export function UpcomingShootsFeed({ events }: UpcomingShootsFeedProps) {
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
            Upcoming Shoots
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
            {events.length} in next 14d
          </span>
        </div>
        <Link
          href="/events"
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
          View all <i className="ti ti-arrow-right" style={{ fontSize: '12px' }} />
        </Link>
      </div>

      {/* Events List */}
      {events.length === 0 ? (
        <div
          style={{
            flex: 1,
            minHeight: '160px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: 'var(--color-foreground-muted)',
          }}
        >
          <i className="ti ti-calendar-check" style={{ fontSize: '28px', color: 'var(--color-foreground-subtle)' }} />
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>No shoots scheduled in the next 14 days</span>
          <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>
            New bookings will automatically appear here.
          </span>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            maxHeight: '230px',
            overflowY: 'auto',
            paddingRight: '2px',
          }}
        >
          {events.slice(0, 5).map((ev) => {
            const dateObj = ev.eventDate
            const monthStr = dateObj.toLocaleString('en-US', { month: 'short' }).toUpperCase()
            const dayStr = dateObj.getDate().toString()
            const fullDateFormatted = dateObj.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              weekday: 'short',
            })

            return (
              <Link
                key={ev.id}
                href={ev.projectId ? `/events` : `/clients/${ev.clientId}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {/* ── Desktop Layout (≥ 768px) ── */}
                <div
                  className="hidden md:flex transition-colors hover:bg-[var(--color-surface-raised)]"
                  style={{
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '0.5px solid var(--color-border)',
                    background: 'var(--color-background)',
                    cursor: 'pointer',
                  }}
                >
                  {/* Date Block */}
                  <div
                    style={{
                      width: '44px',
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      background: 'var(--color-surface)',
                      border: '0.5px solid var(--color-border)',
                      borderRadius: '8px',
                      padding: '4px 0',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: 'var(--color-foreground-subtle)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {monthStr}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-base)',
                        fontWeight: 700,
                        lineHeight: 1.1,
                        color: 'var(--color-foreground)',
                      }}
                    >
                      {dayStr}
                    </span>
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 600,
                        color: 'var(--color-foreground)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {ev.name}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-foreground-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>{ev.venue}</span>
                      <span>·</span>
                      <span>{ev.startTime}</span>
                      {ev.packageType && (
                        <>
                          <span>·</span>
                          <span style={{ color: 'var(--color-foreground-subtle)' }}>{ev.packageType}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Stage Pill */}
                  <div style={{ flexShrink: 0 }}>
                    <Badge variant={ev.stage} />
                  </div>

                  {/* Team Avatars */}
                  <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', paddingLeft: '4px' }}>
                    {ev.team.length === 0 ? (
                      <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)' }}>Unassigned</span>
                    ) : (
                      ev.team.map((tm, idx) => (
                        <div
                          key={idx}
                          title={`${tm.name}${tm.role ? ` (${tm.role})` : ''}`}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: 'var(--color-surface-overlay)',
                            border: '1.5px solid var(--color-surface)',
                            color: 'var(--color-foreground)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 700,
                            marginLeft: idx > 0 ? '-6px' : '0',
                          }}
                        >
                          {tm.init}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* ── Mobile Compact Card Layout (< 768px) ── */}
                <div
                  className="flex md:hidden transition-colors active:bg-[var(--color-surface-raised)]"
                  style={{
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '0.5px solid var(--color-border)',
                    background: 'var(--color-background)',
                    cursor: 'pointer',
                  }}
                >
                  {/* Card Header: Date & Stage Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--color-primary)',
                      }}
                    >
                      <i className="ti ti-calendar" style={{ fontSize: '13px' }} />
                      <span>{fullDateFormatted}</span>
                      <span style={{ color: 'var(--color-foreground-subtle)' }}>·</span>
                      <span style={{ color: 'var(--color-foreground-muted)', fontWeight: 500 }}>{ev.startTime}</span>
                    </div>
                    <Badge variant={ev.stage} />
                  </div>

                  {/* Card Body: Event Title & Venue */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 700,
                        color: 'var(--color-foreground)',
                        lineHeight: 1.3,
                      }}
                    >
                      {ev.name}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-foreground-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <i className="ti ti-map-pin" style={{ fontSize: '12px', color: 'var(--color-foreground-subtle)' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.venue}
                      </span>
                    </div>
                  </div>

                  {/* Card Footer: Package & Assigned Crew */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '6px',
                      borderTop: '0.5px solid var(--color-border)',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      {ev.packageType ? (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--color-surface-raised)',
                            color: 'var(--color-foreground-muted)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ev.packageType}
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Shoot</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {ev.team.length === 0 ? (
                        <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>No crew assigned</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {ev.team.map((tm, idx) => (
                            <div
                              key={idx}
                              title={`${tm.name}${tm.role ? ` (${tm.role})` : ''}`}
                              style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                background: 'var(--color-surface-overlay)',
                                border: '1.5px solid var(--color-surface)',
                                color: 'var(--color-foreground)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '9px',
                                fontWeight: 700,
                                marginLeft: idx > 0 ? '-5px' : '0',
                              }}
                            >
                              {tm.init}
                            </div>
                          ))}
                        </div>
                      )}
                      <i className="ti ti-chevron-right" style={{ fontSize: '14px', color: 'var(--color-foreground-subtle)' }} />
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
