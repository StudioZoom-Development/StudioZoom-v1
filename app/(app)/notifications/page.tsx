'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, isValid } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import {
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  fetchReferencedLeaveRequestsBatch,
} from '@/lib/firebase/queries/notifications'
import { subscribeToStaffOnly, type StaffMember } from '@/lib/firebase/queries/staff'
import type { AppNotification, LeaveRequest } from '@/types'

function formatRelativeTime(date?: Date): string {
  if (!date || isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr  = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 45) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24)  return `${diffHr}h ago`
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7)  return `${diffDay}d ago`
  return format(date, 'd MMM yyyy')
}

function formatLeaveDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const d = parseISO(dateStr)
    return isValid(d) ? format(d, 'd MMM yyyy') : dateStr
  } catch {
    return dateStr
  }
}

export default function NotificationsPage() {
  const router = useRouter()
  const appUser = useAuthStore(s => s.appUser)

  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all')
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [leaveRequestsMap, setLeaveRequestsMap] = useState<Map<string, LeaveRequest>>(new Map())
  const [staffList, setStaffList] = useState<StaffMember[]>([])

  // Recipient keys based on role and uid
  const userRole = appUser?.role
  const userUid = appUser?.uid
  const recipientKeys = useMemo(() => {
    if (!userUid) return []
    if (userRole === 'admin') return ['admin', userUid]
    if (userRole === 'manager') return ['manager', userUid]
    return [userUid]
  }, [userRole, userUid])

  // Staff lookup (Admin and Manager only, as staff role cannot query users collection)
  useEffect(() => {
    if (!appUser || (appUser.role !== 'admin' && appUser.role !== 'manager')) return
    const unsub = subscribeToStaffOnly(list => setStaffList(list))
    return () => unsub()
  }, [appUser?.role, appUser])

  const staffMap = useMemo(() => {
    const map = new Map<string, StaffMember>()
    for (const s of staffList) {
      map.set(s.uid, s)
    }
    return map
  }, [staffList])

  // Subscribe to notifications only when authenticated
  useEffect(() => {
    if (!appUser?.uid || recipientKeys.length === 0) return
    const unsub = subscribeToNotifications(recipientKeys, notifs => {
      setNotifications(notifs)
    })
    return () => unsub()
  }, [recipientKeys, appUser?.uid])

  // Batch-fetch referenced leave requests
  useEffect(() => {
    const reqIds = notifications
      .filter(n => n.referenceCollection === 'leaveRequests' && n.referenceId)
      .map(n => n.referenceId)

    if (reqIds.length === 0) return

    fetchReferencedLeaveRequestsBatch(reqIds).then(map => {
      setLeaveRequestsMap(map)
    })
  }, [notifications])

  // Filter list
  const filteredNotifications = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter(n => !n.isRead)
    }
    return notifications
  }, [notifications, activeTab])

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.isRead).length
  }, [notifications])

  const handleNotificationClick = useCallback(async (n: AppNotification) => {
    if (!n.isRead) {
      await markNotificationAsRead(n.notificationId).catch(err => {
        console.error('Failed to mark notification read:', err)
      })
    }

    const leaveReq = leaveRequestsMap.get(n.referenceId)

    if (n.type === 'leave_applied') {
      if ((appUser?.role === 'admin' || appUser?.role === 'manager') && leaveReq?.status === 'pending') {
        router.push(`/hrms/timelogs?highlight=${n.referenceId}`)
      } else {
        const dateParam = leaveReq?.date ? `?date=${leaveReq.date}` : ''
        router.push(`/hrms/attendance${dateParam}`)
      }
    } else if (n.type === 'leave_approved' || n.type === 'leave_rejected') {
      const dateParam = leaveReq?.date ? `?date=${leaveReq.date}` : ''
      router.push(`/hrms/attendance${dateParam}`)
    }
  }, [leaveRequestsMap, router, appUser?.role])

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsAsRead(recipientKeys)
    } catch (err) {
      console.error('Failed to mark all read:', err)
    }
  }, [recipientKeys])

  return (
    <div
      style={{
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
        padding: '24px',
        maxWidth: '860px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Header with Title & Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: 0,
              color: 'var(--color-foreground)',
            }}
          >
            Notifications
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
            Stay informed with real-time leave requests, approvals, and team updates.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            style={{
              height: '36px',
              padding: '0 16px',
              borderRadius: '8px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-inter)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="ti ti-check" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
            <span>Mark all as read</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '0.5px solid var(--color-border)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('all')}
          style={{
            background: activeTab === 'all' ? 'var(--color-surface-raised)' : 'transparent',
            color: activeTab === 'all' ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
            border: activeTab === 'all' ? '0.5px solid var(--color-border)' : '0.5px solid transparent',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-inter)',
          }}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setActiveTab('unread')}
          style={{
            background: activeTab === 'unread' ? 'var(--color-surface-raised)' : 'transparent',
            color: activeTab === 'unread' ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
            border: activeTab === 'unread' ? '0.5px solid var(--color-border)' : '0.5px solid transparent',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-inter)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>Unread</span>
          {unreadCount > 0 && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '0 5px',
                borderRadius: '8px',
                background: 'var(--color-danger)',
                color: '#ffffff',
                lineHeight: '16px',
              }}
            >
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notifications Card List */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {filteredNotifications.length === 0 ? (
          <div
            style={{
              padding: '60px 24px',
              textAlign: 'center',
              color: 'var(--color-foreground-muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <i className="ti ti-bell-off" style={{ fontSize: '36px', color: 'var(--color-foreground-subtle)' }} />
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              No notifications {activeTab === 'unread' ? 'unread' : 'found'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
              {activeTab === 'unread'
                ? 'All notifications have been marked as read.'
                : 'When team members apply for leave or review requests, they will appear here.'}
            </div>
          </div>
        ) : (
          filteredNotifications.map(n => {
            const leaveReq = leaveRequestsMap.get(n.referenceId)
            const applicantStaff = leaveReq ? staffMap.get(leaveReq.staffUid) : undefined
            const staffName = applicantStaff?.name || 'Staff member'

            let heading = 'Notification'
            let subHeading: string | null = null
            let details = ''
            let iconClass = 'ti ti-bell'
            let iconBg = 'var(--color-surface-raised)'
            let iconColor = 'var(--color-foreground-muted)'

            if (n.type === 'leave_applied') {
              heading = 'Leave Applied'
              subHeading = n.recipient === appUser?.uid ? 'You' : staffName
              const dateStr = formatLeaveDate(leaveReq?.date)
              const reasonStr = leaveReq?.reason?.trim() ? ` · Reason: ${leaveReq.reason}` : ''
              details = dateStr ? `Applied for: ${dateStr}${reasonStr}` : 'Leave requested'
              iconClass = 'ti ti-calendar-event'
              iconBg = 'var(--color-primary-muted)'
              iconColor = 'var(--color-primary)'
            } else if (n.type === 'leave_approved') {
              heading = 'Leave Request – Approved'
              const dateStr = formatLeaveDate(leaveReq?.date)
              details = dateStr ? `Date: ${dateStr}` : 'Your leave request was approved'
              iconClass = 'ti ti-circle-check'
              iconBg = 'var(--color-success-muted)'
              iconColor = 'var(--color-success)'
            } else if (n.type === 'leave_rejected') {
              heading = 'Leave Request – Rejected'
              const dateStr = formatLeaveDate(leaveReq?.date)
              details = dateStr ? `Date: ${dateStr}` : 'Your leave request was rejected'
              iconClass = 'ti ti-circle-x'
              iconBg = 'var(--color-danger-muted)'
              iconColor = 'var(--color-danger)'
            }

            return (
              <div
                key={n.notificationId}
                onClick={() => handleNotificationClick(n)}
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  borderBottom: '0.5px solid var(--color-border)',
                  cursor: 'pointer',
                  background: n.isRead ? 'transparent' : 'var(--color-surface-raised)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--color-surface-raised)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = n.isRead ? 'transparent' : 'var(--color-surface-raised)'
                }}
              >
                {/* Icon Circle */}
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: iconBg,
                    color: iconColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <i className={iconClass} style={{ fontSize: '20px' }} />
                </div>

                {/* Content Column */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: n.isRead ? 600 : 700,
                        color: 'var(--color-foreground)',
                      }}
                    >
                      {heading}
                    </span>
                    {subHeading && (
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          padding: '1px 8px',
                          borderRadius: '8px',
                          background: 'var(--color-surface-raised)',
                          color: 'var(--color-foreground-muted)',
                        }}
                      >
                        {subHeading}
                      </span>
                    )}
                    {leaveReq?.status && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '1px 8px',
                          borderRadius: '8px',
                          textTransform: 'capitalize',
                          background:
                            leaveReq.status === 'approved'
                              ? 'var(--color-success-muted)'
                              : leaveReq.status === 'rejected'
                              ? 'var(--color-danger-muted)'
                              : 'var(--color-surface-raised)',
                          color:
                            leaveReq.status === 'approved'
                              ? 'var(--color-success)'
                              : leaveReq.status === 'rejected'
                              ? 'var(--color-danger)'
                              : 'var(--color-foreground-muted)',
                        }}
                      >
                        {leaveReq.status}
                      </span>
                    )}
                    {!n.isRead && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: 'var(--color-primary)',
                          background: 'var(--color-primary-muted)',
                          padding: '1px 6px',
                          borderRadius: '6px',
                          textTransform: 'uppercase',
                        }}
                      >
                        New
                      </span>
                    )}
                  </div>

                  {details && (
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-foreground-muted)',
                        marginTop: '2px',
                      }}
                    >
                      {details}
                    </div>
                  )}
                </div>

                {/* Right: Timestamp + Arrow */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    {formatRelativeTime(n.createdAt)}
                  </span>
                  <i className="ti ti-chevron-right" style={{ fontSize: '16px', color: 'var(--color-foreground-subtle)' }} />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
