'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { signOut } from '@/lib/firebase/auth'
import type { UserRole } from '@/types'

interface NavSectionOption {
  href: string
  icon: string
  label: string
  description: string
  roles?: UserRole[]
}

const CRM_SECTIONS: NavSectionOption[] = [
  { href: '/events',            icon: 'ti-route',          label: 'Events Board',     description: 'Event lifecycle, kanban stages & assignments' },
  { href: '/events/calendar',   icon: 'ti-calendar-event', label: 'Calendar',         description: 'Monthly & weekly shoot calendar' },
  { href: '/events/work-board', icon: 'ti-layout-kanban',  label: 'Work Board',       description: 'Production tasks, edits & deliverables' },
  { href: '/clients',           icon: 'ti-users',          label: 'Clients',          description: 'Client directory, history & balance' },
  { href: '/leads',             icon: 'ti-user-plus',      label: 'Leads & Inquiries', description: 'Prospective leads, stages & conversion' },
]

const HRMS_SECTIONS: NavSectionOption[] = [
  { href: '/hrms/attendance',  icon: 'ti-checklist',    label: 'Attendance',        description: 'Monthly grid & staff punch logs' },
  { href: '/hrms/timeclock',   icon: 'ti-clock',        label: 'Time Clock',        description: 'Live punch-in / punch-out tracking' },
  { href: '/hrms/timelogs',    icon: 'ti-history',      label: 'Time Logs',         description: 'Work hour entries & approval status' },
  { href: '/hrms/staff',       icon: 'ti-id-badge-2',   label: 'Staff Directory',   description: 'Full team profiles, documents & roles', roles: ['admin'] },
  { href: '/hrms/freelancers', icon: 'ti-user-star',    label: 'Freelancers',       description: 'Contractors, day rates & booking calendar', roles: ['admin', 'manager'] },
  { href: '/hrms/salary',      icon: 'ti-cash',         label: 'Salary & Advances', description: 'Payroll structure, advances & adjustments', roles: ['admin', 'manager'] },
  { href: '/hrms/payslips',    icon: 'ti-file-invoice', label: 'Payslips',          description: 'Monthly salary slips & payout status', roles: ['admin', 'staff'] },
]

const ERP_SECTIONS: NavSectionOption[] = [
  { href: '/erp/equipment',  icon: 'ti-camera',    label: 'Equipment Inventory', description: 'Cameras, lenses, lighting & gear custody', roles: ['admin', 'manager', 'staff'] },
  { href: '/erp/quotations', icon: 'ti-file-text', label: 'Quotations',          description: 'Estimates, package pricing & client proposals', roles: ['admin', 'manager'] },
  { href: '/erp/invoices',   icon: 'ti-receipt',   label: 'Invoices',            description: 'GST tax invoices, billing & payments', roles: ['admin'] },
  { href: '/erp/expenses',   icon: 'ti-wallet',    label: 'Expenses',            description: 'Production costs, petty cash & travel', roles: ['admin'] },
  { href: '/erp/accounts',   icon: 'ti-scale',     label: 'Accounts & Budgets',  description: 'Ledgers, studio accounts & margins', roles: ['admin'] },
]

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function MobileNav() {
  const pathname = usePathname()
  const router   = useRouter()
  const appUser  = useAuthStore(s => s.appUser)
  const {
    theme,
    toggleTheme,
    mobileSection,
    setMobileSection,
    isMobileNewOpen,
    setIsMobileNewOpen,
  } = useUIStore()
  const role     = appUser?.role ?? 'staff'

  // activeSection alias to mobileSection in store
  const activeSection = mobileSection
  const setActiveSection = setMobileSection
  const isNewOpen = isMobileNewOpen
  const setIsNewOpen = setIsMobileNewOpen

  // Automatically close overlays when route changes
  useEffect(() => {
    setMobileSection(null)
    setIsMobileNewOpen(false)
  }, [pathname, setMobileSection, setIsMobileNewOpen])

  // Do not render bottom nav on /events (Events Board screens use dedicated full-screen layouts)
  if (pathname === '/events') {
    return null
  }

  const handleSignOut = async () => {
    setMobileSection(null)
    setIsMobileNewOpen(false)
    await signOut()
    router.replace('/login')
  }

  const navigateTo = (href: string) => {
    setMobileSection(null)
    setIsMobileNewOpen(false)
    if (href === '/erp/equipment?action=new') {
      window.dispatchEvent(new CustomEvent('studio-open-equipment-add'))
    }
    router.push(href)
  }

  const toggleSection = (section: 'crm' | 'hrms' | 'erp' | 'profile') => {
    setIsMobileNewOpen(false)
    setMobileSection(mobileSection === section ? null : section)
  }

  const toggleNew = () => {
    setMobileSection(null)
    setIsMobileNewOpen(!isMobileNewOpen)
  }

  // ─── ADMIN & MANAGER MOBILE NAVIGATION ─────────────────────────────────────
  if (role === 'admin' || role === 'manager') {
    const isHomeActive = pathname === '/dashboard'
    const isCrmActive  = pathname.startsWith('/events') || pathname.startsWith('/clients') || pathname.startsWith('/leads')
    const isHrmsActive = pathname.startsWith('/hrms')
    const isErpActive  = pathname.startsWith('/erp')

    // Section menu config
    let sectionTitle = ''
    let sectionBadge = ''
    let sectionItems: NavSectionOption[] = []

    if (activeSection === 'crm') {
      sectionBadge = 'CRM'
      sectionTitle = 'CRM & Events'
      sectionItems = CRM_SECTIONS
    } else if (activeSection === 'hrms') {
      sectionBadge = 'HRMS'
      sectionTitle = 'HRMS & Workforce'
      sectionItems = HRMS_SECTIONS.filter(item => !item.roles || item.roles.includes(role))
    } else if (activeSection === 'erp') {
      sectionBadge = 'ERP'
      sectionTitle = 'ERP & Operations'
      sectionItems = ERP_SECTIONS.filter(item => !item.roles || item.roles.includes(role))
    }

    return (
      <>
        {/* ── OPTION 3: FULL-SCREEN SECTION MENU OVERLAY (Docked above nav bar) ── */}
        {activeSection && (
          <div
            style={{
              position: 'fixed',
              top: '56px',
              left: 0,
              right: 0,
              bottom: 'calc(64px + env(safe-area-inset-bottom))',
              background: 'var(--color-surface)',
              zIndex: 65,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y',
              animation: 'sectionMenuFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Overlay Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px 14px',
                borderBottom: '0.5px solid var(--color-border)',
                background: 'var(--color-surface)',
                position: 'sticky',
                top: 0,
                zIndex: 2,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--color-primary)',
                      background: 'var(--color-primary-muted)',
                      padding: '2px 8px',
                      borderRadius: '10px',
                    }}
                  >
                    {sectionBadge}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>
                    {sectionItems.length} modules
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-xl)',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: 'var(--color-foreground)',
                  }}
                >
                  {sectionTitle}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection(null)}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-foreground-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
                title="Close"
              >
                <i className="ti ti-x" style={{ fontSize: '18px' }} />
              </button>
            </div>

            {/* Menu Option Cards */}
            <div
              style={{
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                flex: 1,
              }}
            >
              {sectionItems.map(item => {
                // An item is active if exact match, or prefix match ONLY IF no sibling item has a more specific matching href
                const isCurrent =
                  pathname === item.href ||
                  (item.href !== '/dashboard' &&
                    pathname.startsWith(item.href + '/') &&
                    !sectionItems.some(
                      other =>
                        other.href !== item.href &&
                        other.href.startsWith(item.href) &&
                        (pathname === other.href || pathname.startsWith(other.href + '/'))
                    ))

                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => navigateTo(item.href)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '14px 16px',
                      borderRadius: '14px',
                      background: isCurrent ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                      border: isCurrent ? '0.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: isCurrent ? 'var(--color-primary)' : 'var(--color-surface)',
                        color: isCurrent ? '#ffffff' : 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        border: isCurrent ? 'none' : '0.5px solid var(--color-border)',
                        boxShadow: isCurrent ? '0 4px 12px rgba(198, 83, 159, 0.35)' : 'none',
                      }}
                    >
                      <i className={`ti ${item.icon}`} style={{ fontSize: '20px' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 'var(--text-base)',
                          fontWeight: 700,
                          color: isCurrent ? 'var(--color-primary)' : 'var(--color-foreground)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span>{item.label}</span>
                        {isCurrent && (
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              padding: '2px 6px',
                              borderRadius: '6px',
                              background: 'var(--color-primary)',
                              color: '#ffffff',
                            }}
                          >
                            Active
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-foreground-muted)',
                          marginTop: '2px',
                          lineHeight: '1.3',
                        }}
                      >
                        {item.description}
                      </div>
                    </div>
                    <i
                      className="ti ti-chevron-right"
                      style={{
                        fontSize: '18px',
                        color: isCurrent ? 'var(--color-primary)' : 'var(--color-foreground-subtle)',
                        flexShrink: 0,
                      }}
                    />
                  </button>
                )
              })}
            </div>

            {/* Bottom Dismiss Hint */}
            <div
              style={{
                textAlign: 'center',
                padding: '12px 20px',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-foreground-subtle)',
                borderTop: '0.5px solid var(--color-border)',
                background: 'var(--color-surface)',
              }}
            >
              Select a module or tap ✕ above to dismiss
            </div>
          </div>
        )}

        {/* ── [NEW +] THE ONLY BOTTOM OPENER (Docked cleanly above nav bar) ── */}
        {isNewOpen && (
          <div
            onClick={() => setIsNewOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              bottom: 'calc(64px + env(safe-area-inset-bottom))',
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(4px)',
              zIndex: 55,
              animation: 'mobileFadeIn 0.2s ease',
            }}
          />
        )}

        {isNewOpen && (
          <div
            style={{
              position: 'fixed',
              bottom: 'calc(64px + env(safe-area-inset-bottom))',
              left: 0,
              right: 0,
              background: 'var(--color-surface)',
              borderTop: '0.5px solid var(--color-border-strong)',
              borderRadius: '24px 24px 0 0',
              boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.5)',
              zIndex: 60,
              padding: '12px 18px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              animation: 'dockedDrawerSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              maxHeight: '80vh',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y',
            }}
          >
            {/* Sheet Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 6px' }}>
              <div
                style={{
                  width: '38px',
                  height: '4px',
                  borderRadius: '999px',
                  background: 'var(--color-border-strong)',
                  opacity: 0.8,
                }}
              />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--color-primary)',
                      background: 'var(--color-primary-muted)',
                      padding: '2px 8px',
                      borderRadius: '10px',
                    }}
                  >
                    Quick Actions
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                    Studio Zoom
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-lg)',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: 'var(--color-foreground)',
                    marginTop: '3px',
                  }}
                >
                  Create & Schedule
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewOpen(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-foreground-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
                title="Close"
              >
                <i className="ti ti-x" style={{ fontSize: '16px' }} />
              </button>
            </div>

            {/* HERO CARD: New Client & Booking */}
            <button
              type="button"
              onClick={() => navigateTo('/clients/new')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                width: '100%',
                padding: '14px 16px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, var(--color-primary-muted) 0%, var(--color-surface-overlay) 100%)',
                border: '0.5px solid var(--color-primary)',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                transition: 'transform 0.15s ease',
              }}
            >
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '14px',
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 14px rgba(198, 83, 159, 0.4)',
                }}
              >
                <i className="ti ti-calendar-plus" style={{ fontSize: '24px' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-primary)',
                    }}
                  >
                    Flagship Flow
                  </span>
                  <span
                    style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: 'var(--color-primary)',
                    }}
                  />
                  <span style={{ fontSize: '9px', color: 'var(--color-foreground-subtle)' }}>Wizard</span>
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 700,
                    color: 'var(--color-foreground)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  New Client & Booking
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-foreground-muted)',
                    marginTop: '2px',
                    lineHeight: '1.3',
                  }}
                >
                  Single day, multi-date or recurring event booking
                </div>
              </div>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--color-primary-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <i
                  className="ti ti-arrow-right"
                  style={{
                    fontSize: '16px',
                    color: 'var(--color-primary)',
                  }}
                />
              </div>
            </button>

            {/* SECTION LABEL */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 2px',
                marginTop: '2px',
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-foreground-subtle)',
                }}
              >
                Direct Creation Shortcuts
              </span>
              <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)' }}>Fast jump</span>
            </div>

            {/* 2x2 ACTION GRID */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '10px',
              }}
            >
              {/* 1. New Lead */}
              <button
                type="button"
                onClick={() => navigateTo('/leads/new')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'var(--color-secondary-muted)',
                      color: 'var(--color-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <i className="ti ti-user-plus" style={{ fontSize: '18px' }} />
                  </div>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--color-secondary)',
                    }}
                  >
                    CRM
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                    New Lead
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                    Capture inquiry & dates
                  </div>
                </div>
              </button>

              {/* 2. New Staff (Admin Only) or Calendar (Manager) */}
              {role === 'admin' ? (
                <button
                  type="button"
                  onClick={() => navigateTo('/settings/users/new')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '12px 14px',
                    borderRadius: '14px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '10px',
                        background: 'var(--color-accent-muted)',
                        color: 'var(--color-accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <i className="ti ti-id-badge-2" style={{ fontSize: '18px' }} />
                    </div>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--color-accent)',
                      }}
                    >
                      TEAM
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                      New Staff
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                      Register studio employee
                    </div>
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigateTo('/events/calendar')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '12px 14px',
                    borderRadius: '14px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '10px',
                        background: 'var(--color-accent-muted)',
                        color: 'var(--color-accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <i className="ti ti-calendar-event" style={{ fontSize: '18px' }} />
                    </div>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--color-accent)',
                      }}
                    >
                      SCHEDULE
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                      Calendar
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                      View schedule & shoots
                    </div>
                  </div>
                </button>
              )}

              {/* 3. New Freelancer */}
              <button
                type="button"
                onClick={() => navigateTo('/hrms/freelancers?action=new')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'var(--color-purple-muted)',
                      color: 'var(--color-purple)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <i className="ti ti-user-star" style={{ fontSize: '18px' }} />
                  </div>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--color-purple)',
                    }}
                  >
                    CONTRACT
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                    New Freelancer
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                    Onboard contractor
                  </div>
                </div>
              </button>

              {/* 4. New Task */}
              <button
                type="button"
                onClick={() => navigateTo('/events/work-board?action=new')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'var(--color-success-muted)',
                      color: 'var(--color-success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <i className="ti ti-checklist" style={{ fontSize: '18px' }} />
                  </div>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--color-success)',
                    }}
                  >
                    TASK
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                    New Task
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                    Create work item & assign
                  </div>
                </div>
              </button>

              {/* 5. New Equipment */}
              <button
                id="mobile-new-equipment"
                type="button"
                onClick={() => navigateTo('/erp/equipment?action=new')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'var(--color-primary-muted)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <i className="ti ti-camera" style={{ fontSize: '18px' }} />
                  </div>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--color-primary)',
                    }}
                  >
                    GEAR
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                    New Equipment
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                    Add camera, lens or gear
                  </div>
                </div>
              </button>

              {/* 6. New Expense */}
              <button
                id="mobile-new-expense"
                type="button"
                onClick={() => navigateTo('/erp/expenses/new')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'var(--color-danger-muted)',
                      color: 'var(--color-danger)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <i className="ti ti-wallet" style={{ fontSize: '18px' }} />
                  </div>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--color-danger)',
                    }}
                  >
                    EXPENSE
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                    New Expense
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-foreground-muted)', marginTop: '2px' }}>
                    Log studio or shoot cost
                  </div>
                </div>
              </button>
            </div>

            {/* Footer Hint */}
            <div
              style={{
                textAlign: 'center',
                fontSize: '10px',
                color: 'var(--color-foreground-subtle)',
                marginTop: '2px',
              }}
            >
              Tap outside or press the button below to close
            </div>
          </div>
        )}

        {/* ─── BOTTOM NAV BAR (ALWAYS VISIBLE & DOCKED) ─── */}
        <nav
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 70,
            height: '64px',
            background: 'var(--color-surface)',
            borderTop: '0.5px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            paddingBottom: 'env(safe-area-inset-bottom)',
            boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.2)',
          }}
        >
          {/* 1. Home */}
          <Link
            id="mobile-nav-home"
            href="/dashboard"
            onClick={() => {
              setActiveSection(null)
              setIsNewOpen(false)
            }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              height: '100%',
              textDecoration: 'none',
              cursor: 'pointer',
              color: isHomeActive && !activeSection && !isNewOpen ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
              transition: 'color 0.15s ease',
            }}
          >
            <i className="ti ti-layout-dashboard" style={{ fontSize: '20px' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: isHomeActive && !activeSection && !isNewOpen ? 700 : 600 }}>
              Home
            </span>
          </Link>

          {/* 2. CRM (Full-screen Overlay Trigger) */}
          <button
            id="mobile-nav-crm"
            type="button"
            onClick={() => toggleSection('crm')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              height: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeSection === 'crm' || (isCrmActive && !activeSection && !isNewOpen) ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
              transition: 'color 0.15s ease',
            }}
          >
            <i className="ti ti-route" style={{ fontSize: '20px' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: activeSection === 'crm' || (isCrmActive && !activeSection && !isNewOpen) ? 700 : 600 }}>
              CRM
            </span>
          </button>

          {/* 3. New (+) Prominent Center Button (Bottom Opener) */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button
              id="mobile-new-btn"
              type="button"
              onClick={toggleNew}
              title={isNewOpen ? 'Close Actions' : 'Quick Actions'}
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: 'var(--color-primary)',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 4px 14px rgba(198, 83, 159, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transform: `translateY(-8px) rotate(${isNewOpen ? '45deg' : '0deg'})`,
                transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: '24px', strokeWidth: 2.5 }} />
            </button>
          </div>

          {/* 4. HRMS (Full-screen Overlay Trigger) */}
          <button
            id="mobile-nav-hrms"
            type="button"
            onClick={() => toggleSection('hrms')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              height: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeSection === 'hrms' || (isHrmsActive && !activeSection && !isNewOpen) ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
              transition: 'color 0.15s ease',
            }}
          >
            <i className="ti ti-id-badge-2" style={{ fontSize: '20px' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: activeSection === 'hrms' || (isHrmsActive && !activeSection && !isNewOpen) ? 700 : 600 }}>
              HRMS
            </span>
          </button>

          {/* 5. ERP (Full-screen Overlay Trigger) */}
          <button
            id="mobile-nav-erp"
            type="button"
            onClick={() => toggleSection('erp')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              height: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeSection === 'erp' || (isErpActive && !activeSection && !isNewOpen) ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
              transition: 'color 0.15s ease',
            }}
          >
            <i className="ti ti-briefcase" style={{ fontSize: '20px' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: activeSection === 'erp' || (isErpActive && !activeSection && !isNewOpen) ? 700 : 600 }}>
              ERP
            </span>
          </button>
        </nav>

        <style>{`
          @keyframes mobileFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes sectionMenuFadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes dockedDrawerSlideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </>
    )
  }

  // ─── STAFF MOBILE NAVIGATION ─────────────────────────────────────────────
  const isClockActive      = pathname === '/hrms/timeclock'
  const isAttendanceActive = pathname === '/hrms/attendance'
  const isWorkActive       = pathname === '/events/work-board'
  const isEquipmentActive  = pathname.startsWith('/erp/equipment')
  const isPayslipsActive   = pathname === '/hrms/payslips'

  return (
    <>
      {/* Staff Profile Full-screen Section Overlay (Docked above nav bar) */}
      {activeSection === 'profile' && (
        <div
          style={{
            position: 'fixed',
            top: '56px',
            left: 0,
            right: 0,
            bottom: 'calc(64px + env(safe-area-inset-bottom))',
            background: 'var(--color-surface)',
            zIndex: 65,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            animation: 'sectionMenuFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px 14px',
              borderBottom: '0.5px solid var(--color-border)',
              background: 'var(--color-surface)',
              position: 'sticky',
              top: 0,
              zIndex: 2,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-accent)',
                  background: 'var(--color-accent-muted)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                }}
              >
                ACCOUNT
              </span>
              <div
                style={{
                  fontSize: 'var(--text-xl)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: 'var(--color-foreground)',
                  marginTop: '2px',
                }}
              >
                Staff Account
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection(null)}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                color: 'var(--color-foreground-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
              title="Close"
            >
              <i className="ti ti-x" style={{ fontSize: '18px' }} />
            </button>
          </div>

          <div
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              flex: 1,
            }}
          >
            {/* User Card */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '16px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '16px',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'var(--color-primary-muted)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-base)',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {getInitials(appUser?.name ?? 'SZ')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 700,
                    color: 'var(--color-foreground)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {appUser?.name || 'Studio Zoom Staff'}
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-foreground-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: '2px',
                  }}
                >
                  {appUser?.email || ''}
                </div>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: '8px',
                  background: 'var(--color-accent-muted)',
                  color: 'var(--color-accent)',
                  flexShrink: 0,
                }}
              >
                Staff
              </span>
            </div>

            {/* My Payslips link in drawer */}
            <button
              type="button"
              onClick={() => navigateTo('/hrms/payslips')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                width: '100%',
                padding: '14px 16px',
                borderRadius: '14px',
                background: isPayslipsActive ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                border: `0.5px solid ${isPayslipsActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                color: isPayslipsActive ? 'var(--color-primary)' : 'var(--color-foreground)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'var(--color-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  border: '0.5px solid var(--color-border)',
                }}
              >
                <i className="ti ti-file-invoice" style={{ fontSize: '18px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>My Payslips</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  View salary slips & monthly payouts
                </div>
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize: '16px', color: 'var(--color-foreground-muted)' }} />
            </button>

            {/* Equipment Inventory link in drawer */}
            <button
              type="button"
              onClick={() => navigateTo('/erp/equipment')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                width: '100%',
                padding: '14px 16px',
                borderRadius: '14px',
                background: isEquipmentActive ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                border: `0.5px solid ${isEquipmentActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                color: isEquipmentActive ? 'var(--color-primary)' : 'var(--color-foreground)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'var(--color-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  border: '0.5px solid var(--color-border)',
                }}
              >
                <i className="ti ti-camera" style={{ fontSize: '18px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Equipment Inventory</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  Check in & check out studio gear
                </div>
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize: '16px', color: 'var(--color-foreground-muted)' }} />
            </button>

            {/* Theme Switcher */}
            <button
              type="button"
              onClick={toggleTheme}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                width: '100%',
                padding: '14px 16px',
                borderRadius: '14px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                color: 'var(--color-foreground)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'var(--color-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  border: '0.5px solid var(--color-border)',
                }}
              >
                <i className={`ti ${theme === 'dark' ? 'ti-sun' : 'ti-moon'}`} style={{ fontSize: '18px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Theme Mode</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  Currently using {theme} theme
                </div>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: 'var(--color-surface)',
                  color: 'var(--color-foreground-muted)',
                  border: '0.5px solid var(--color-border)',
                }}
              >
                {theme}
              </span>
            </button>

            {/* Sign Out */}
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                width: '100%',
                padding: '14px 16px',
                borderRadius: '14px',
                background: 'var(--color-danger-muted)',
                border: '0.5px solid var(--color-danger)',
                color: 'var(--color-danger)',
                cursor: 'pointer',
                textAlign: 'left',
                marginTop: 'auto',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'var(--color-danger)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <i className="ti ti-logout" style={{ fontSize: '18px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>Log Out</div>
                <div style={{ fontSize: 'var(--text-xs)', opacity: 0.8 }}>Sign out of this device</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ─── STAFF BOTTOM NAV BAR ─── */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 70,
          height: '64px',
          background: 'var(--color-surface)',
          borderTop: '0.5px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.2)',
        }}
      >
        {/* 1. Time Clock */}
        <Link
          id="mobile-staff-clock"
          href="/hrms/timeclock"
          onClick={() => setActiveSection(null)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            height: '100%',
            textDecoration: 'none',
            cursor: 'pointer',
            color: isClockActive && !activeSection ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
            transition: 'color 0.15s ease',
          }}
        >
          <i className="ti ti-clock" style={{ fontSize: '20px' }} />
          <span style={{ fontSize: '0.62rem', fontWeight: isClockActive && !activeSection ? 700 : 600 }}>Clock</span>
        </Link>

        {/* 2. Work Board */}
        <Link
          id="mobile-staff-work"
          href="/events/work-board"
          onClick={() => setActiveSection(null)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            height: '100%',
            textDecoration: 'none',
            cursor: 'pointer',
            color: isWorkActive && !activeSection ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
            transition: 'color 0.15s ease',
          }}
        >
          <i className="ti ti-layout-kanban" style={{ fontSize: '20px' }} />
          <span style={{ fontSize: '0.62rem', fontWeight: isWorkActive && !activeSection ? 700 : 600 }}>
            Work
          </span>
        </Link>

        {/* 3. Equipment Inventory & Custody */}
        <Link
          id="mobile-staff-equipment"
          href="/erp/equipment"
          onClick={() => setActiveSection(null)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            height: '100%',
            textDecoration: 'none',
            cursor: 'pointer',
            color: isEquipmentActive && !activeSection ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
            transition: 'color 0.15s ease',
          }}
        >
          <i className="ti ti-camera" style={{ fontSize: '20px' }} />
          <span style={{ fontSize: '0.62rem', fontWeight: isEquipmentActive && !activeSection ? 700 : 600 }}>
            Gear
          </span>
        </Link>

        {/* 4. My Attendance */}
        <Link
          id="mobile-staff-attendance"
          href="/hrms/attendance"
          onClick={() => setActiveSection(null)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            height: '100%',
            textDecoration: 'none',
            cursor: 'pointer',
            color: isAttendanceActive && !activeSection ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
            transition: 'color 0.15s ease',
          }}
        >
          <i className="ti ti-checklist" style={{ fontSize: '20px' }} />
          <span style={{ fontSize: '0.62rem', fontWeight: isAttendanceActive && !activeSection ? 700 : 600 }}>
            Attendance
          </span>
        </Link>

        {/* 5. Profile */}
        <button
          id="mobile-staff-profile"
          type="button"
          onClick={() => toggleSection('profile')}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            height: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeSection === 'profile' ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
            transition: 'color 0.15s ease',
          }}
        >
          <i className="ti ti-user" style={{ fontSize: '20px' }} />
          <span style={{ fontSize: '0.62rem', fontWeight: activeSection === 'profile' ? 700 : 600 }}>Profile</span>
        </button>
      </nav>

      <style>{`
        @keyframes mobileFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes sectionMenuFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
