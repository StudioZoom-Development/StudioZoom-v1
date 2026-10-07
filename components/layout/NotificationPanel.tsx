'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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
  return format(date, 'd MMM')
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

export function NotificationPanel() {
  const router = useRouter()
  const appUser = useAuthStore(s => s.appUser)
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [leaveRequestsMap, setLeaveRequestsMap] = useState<Map<string, LeaveRequest>>(new Map())
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

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

  // Fetch referenced leave requests
  useEffect(() => {
    const reqIds = notifications
      .filter(n => n.referenceCollection === 'leaveRequests' && n.referenceId)
      .map(n => n.referenceId)

    if (reqIds.length === 0) return

    fetchReferencedLeaveRequestsBatch(reqIds).then(map => {
      setLeaveRequestsMap(map)
    })
  }, [notifications])

  // Count unread
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.isRead).length
  }, [notifications])

  // Mark all as read when opening panel (per requirements specification)
  const handleToggle = useCallback(() => {
    const next = !isOpen
    setIsOpen(next)
    if (next && unreadCount > 0) {
      markAllNotificationsAsRead(recipientKeys).catch(err => {
        console.error('Failed to mark notifications read on open:', err)
      })
    }
  }, [isOpen, unreadCount, recipientKeys])

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleNotificationClick = useCallback(async (n: AppNotification) => {
    // Mark as read if not already read
    if (!n.isRead) {
      await markNotificationAsRead(n.notificationId).catch(err => {
        console.error('Failed to mark read:', err)
      })
    }
    setIsOpen(false)

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

  const handleMarkAllRead = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await markAllNotificationsAsRead(recipientKeys)
    } catch (err) {
      console.error('Failed to mark all read:', err)
    }
  }, [recipientKeys])

  return (
    <div ref={panelRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {/* ── Top-Right Bell Icon & Badge ─────────────────────────────────── */}
      <div
        id="notification-bell-btn"
        onClick={handleToggle}
        title="Notifications"
        style={{
          position: 'relative',
          cursor: 'pointer',
          color: isOpen ? 'var(--color-foreground)' : 'var(--color-foreground-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: isOpen ? 'var(--color-surface-raised)' : 'transparent',
          transition: 'color 0.15s, background 0.15s',
        }}
      >
        <i className="ti ti-bell" style={{ fontSize: '20px' }} />

        {/* Numeric red badge: only rendered when unreadCount > 0 */}
        {unreadCount > 0 && (
          <span
            id="notification-badge-count"
            style={{
              position: 'absolute',
              top: '-3px',
              right: '-3px',
              minWidth: '17px',
              height: '17px',
              padding: '0 4px',
              borderRadius: '9px',
              background: 'var(--color-danger)',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1.5px solid var(--color-surface)',
              lineHeight: 1,
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>

      {/* ── Notification Dropdown Flyout Panel ───────────────────────────── */}
      {isOpen && (
        <div
          id="notification-flyout-panel"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '380px',
            maxWidth: 'calc(100vw - 28px)',
            background: 'var(--color-surface-overlay)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'var(--font-inter)',
            animation: 'dropdownFadeIn 0.15s ease-out',
          }}
        >
          {/* Panel Header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '0.5px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-surface)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    padding: '1px 7px',
                    borderRadius: '8px',
                    background: 'var(--color-primary-muted)',
                    color: 'var(--color-primary)',
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                id="mark-all-notifications-read-btn"
                onClick={handleMarkAllRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-primary)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: '4px',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Panel Content List */}
          <div
            style={{
              maxHeight: '390px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--color-foreground-muted)',
                }}
              >
                <i className="ti ti-bell-off" style={{ fontSize: '32px', color: 'var(--color-foreground-subtle)' }} />
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                  No notifications yet
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                  You are all caught up!
                </div>
              </div>
            ) : (
              notifications.map(n => {
                const leaveReq = leaveRequestsMap.get(n.referenceId)
                const applicantStaff = leaveReq ? staffMap.get(leaveReq.staffUid) : undefined
                const staffName = applicantStaff?.name || 'Staff member'

                // Header & Details based on notification type
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
                  const reasonStr = leaveReq?.reason?.trim() ? ` · ${leaveReq.reason}` : ''
                  details = dateStr ? `For: ${dateStr}${reasonStr}` : 'Leave requested'
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
                    id={`notification-item-${n.notificationId}`}
                    onClick={() => handleNotificationClick(n)}
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
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
                    {/* Left Icon Pill */}
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        background: iconBg,
                        color: iconColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      <i className={iconClass} style={{ fontSize: '18px' }} />
                    </div>

                    {/* Content Column */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: 'var(--text-sm)',
                            fontWeight: n.isRead ? 500 : 700,
                            color: 'var(--color-foreground)',
                            lineHeight: 1.2,
                          }}
                        >
                          {heading}
                        </span>
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-foreground-subtle)',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>

                      {/* Sub-heading & Status */}
                      {(subHeading || leaveReq?.status) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {subHeading && (
                            <span
                              style={{
                                fontSize: 'var(--text-xs)',
                                fontWeight: 600,
                                color: 'var(--color-foreground)',
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
                                padding: '1px 6px',
                                borderRadius: '4px',
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
                        </div>
                      )}

                      {/* Details (Date & Reason) */}
                      {details && (
                        <div
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-foreground-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={details}
                        >
                          {details}
                        </div>
                      )}
                    </div>

                    {/* Unread dot */}
                    {!n.isRead && (
                      <span
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: 'var(--color-primary)',
                          flexShrink: 0,
                          alignSelf: 'center',
                        }}
                      />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
