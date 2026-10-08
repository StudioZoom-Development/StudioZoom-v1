'use client'

import React from 'react'
import Link from 'next/link'
import type { DashboardAggregates } from '@/lib/firebase/queries/dashboard'

interface PostProdRadarProps {
  radar: DashboardAggregates['postProdRadar']
  overdueCount: number
}

export function PostProdRadar({ radar, overdueCount }: PostProdRadarProps) {
  const tracks = [
    {
      key: 'photoTrack' as const,
      name: 'Photo Editing',
      icon: 'ti-photo',
      color: 'var(--color-primary)',
      data: radar.photoTrack,
    },
    {
      key: 'albumTrack' as const,
      name: 'Album Design',
      icon: 'ti-book',
      color: 'var(--color-secondary)',
      data: radar.albumTrack,
    },
    {
      key: 'videoTrack' as const,
      name: 'Video Highlights',
      icon: 'ti-video',
      color: 'var(--color-accent)',
      data: radar.videoTrack,
    },
    {
      key: 'fullVideoTrack' as const,
      name: 'Full Film Production',
      icon: 'ti-movie',
      color: 'var(--color-purple)',
      data: radar.fullVideoTrack,
    },
  ]

  const totalActive = tracks.reduce((acc, t) => acc + t.data.inProgress + t.data.inReview, 0)

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
            Post-Production Radar
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
            {totalActive} Active
          </span>
          {overdueCount > 0 && (
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
              {overdueCount} Overdue
            </span>
          )}
        </div>
        <Link
          href="/events/work-board"
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
          Board <i className="ti ti-arrow-right" style={{ fontSize: '12px' }} />
        </Link>
      </div>

      {/* Tracks Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {tracks.map((t) => {
          const inProgress = t.data.inProgress
          const inReview = t.data.inReview
          const completed = t.data.completed
          const total = Math.max(1, inProgress + inReview + completed)

          const inProgressPct = Math.round((inProgress / total) * 100)
          const inReviewPct = Math.round((inReview / total) * 100)
          const completedPct = Math.round((completed / total) * 100)

          return (
            <div
              key={t.key}
              style={{
                background: 'var(--color-background)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {/* Track Title */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <i className={`ti ${t.icon}`} style={{ fontSize: '14px', color: t.color }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-foreground)' }}>
                    {t.name}
                  </span>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-foreground)' }}>
                  {inProgress + inReview}
                </span>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  height: '5px',
                  borderRadius: '3px',
                  background: 'var(--color-surface-raised)',
                  overflow: 'hidden',
                  display: 'flex',
                }}
              >
                <div style={{ width: `${completedPct}%`, background: 'var(--color-success)' }} title={`Completed: ${completed}`} />
                <div style={{ width: `${inReviewPct}%`, background: 'var(--color-secondary)' }} title={`In Review: ${inReview}`} />
                <div style={{ width: `${inProgressPct}%`, background: t.color }} title={`In Progress: ${inProgress}`} />
              </div>

              {/* Status Breakdown Legend */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '9px',
                  color: 'var(--color-foreground-subtle)',
                }}
              >
                <span>{inProgress} Active</span>
                <span>{inReview} Review</span>
                <span style={{ color: 'var(--color-success)' }}>{completed} Done</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
