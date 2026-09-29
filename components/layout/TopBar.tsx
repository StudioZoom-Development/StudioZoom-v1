'use client'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { signOut } from '@/lib/firebase/auth'
import { MobileSideDrawer } from './MobileSideDrawer'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':          'Dashboard',
  '/clients':            'Clients',
  '/clients/new':        'New Booking',
  '/leads':              'Leads',
  '/events':             'Events Board',
  '/events/calendar':    'Calendar',
  '/events/work-board':  'Work Board',
  '/events/editing':     'Editing Queue',
  '/hrms/attendance':    'Attendance',
  '/hrms/timeclock':     'Time Clock',
  '/hrms/timelogs':      'Time Log Review',
  '/hrms/staff':         'Staff',
  '/hrms/salary':        'Salary',
  '/hrms/payslips':      'Payslips',
  '/hrms/freelancers':   'Freelancers',
  '/erp/equipment':          'Equipment',
  '/erp/equipment/checkout': 'Equipment Check-out & Check-in',
  '/erp/equipment/held':     'Staff-Held Equipment',
  '/erp/quotations':         'Quotations',
  '/erp/invoices':       'Invoices',
  '/erp/expenses':       'Expenses',
  '/erp/expenses/new':   'Add Expense',
  '/erp/expenses/edit':  'Edit Expense',
  '/erp/cashflow':       'Cashflow',
  '/erp/accounts':       'Accounts & Budgets',
  '/settings':           'Settings',
  '/notifications':      'Notifications',
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getParentRoute(pathname: string): string | null {
  // 1. Explicit subpage mappings
  if (pathname === '/clients/new' || pathname === '/clients/drafts') return '/clients'
  if (pathname === '/leads/new') return '/leads'
  if (pathname === '/erp/expenses/new') return '/erp/expenses'
  if (pathname === '/erp/quotations/new') return '/erp/quotations'
  if (pathname === '/erp/equipment/checkout' || pathname === '/erp/equipment/held') return '/erp/equipment'
  if (pathname === '/settings/users/new') return '/settings'
  if (pathname === '/hrms/timelogs') return '/hrms/attendance'

  // 2. Edit subpages
  if (pathname.startsWith('/clients/') && pathname.endsWith('/edit')) {
    return pathname.replace(/\/edit$/, '')
  }
  if (pathname.startsWith('/erp/expenses/edit/')) {
    return '/erp/expenses'
  }

  // 3. Dynamic ID detail pages
  if (pathname.startsWith('/clients/')) return '/clients'
  if (pathname.startsWith('/leads/')) return '/leads'
  if (pathname.startsWith('/erp/equipment/')) return '/erp/equipment'
  if (pathname.startsWith('/hrms/staff/')) return '/hrms/staff'
  if (pathname.startsWith('/hrms/freelancers/')) return '/hrms/freelancers'
  if (pathname.startsWith('/hrms/salary/')) return '/hrms/salary'
  if (pathname.startsWith('/hrms/payslips/')) return '/hrms/payslips'

  return null
}

function getSectionForPath(pathname: string): 'crm' | 'hrms' | 'erp' | null {
  if (pathname === '/dashboard' || pathname === '/' || pathname === '/events') return null
  if (pathname.startsWith('/events') || pathname.startsWith('/clients') || pathname.startsWith('/leads')) {
    return 'crm'
  }
  if (pathname.startsWith('/hrms')) {
    return 'hrms'
  }
  if (pathname.startsWith('/erp')) {
    return 'erp'
  }
  return null
}

const SECTION_TITLES: Record<string, string> = {
  crm: 'CRM & Events',
  hrms: 'HRMS & Workforce',
  erp: 'ERP & Operations',
  profile: 'Staff Profile',
}

export function TopBar() {
  const pathname = usePathname()
  const router   = useRouter()
  const appUser  = useAuthStore(s => s.appUser)
  const {
    theme,
    toggleTheme,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    mobileSection,
    setMobileSection,
  } = useUIStore()
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false)

  const role = appUser?.role ?? 'staff'
  const isAdminOrManager = role === 'admin' || role === 'manager'

  // When a mobile section overlay is active, TopBar acts as the header for that section (with back button)
  const isHomePage =
    !mobileSection && (
      pathname === '/dashboard' ||
      pathname === '/' ||
      (!isAdminOrManager && pathname === '/hrms/timeclock')
    )

  const title = mobileSection
    ? (SECTION_TITLES[mobileSection] ?? 'Studio Zoom')
    : (PAGE_TITLES[pathname]
        ?? Object.entries(PAGE_TITLES).find(([k]) => pathname.startsWith(k + '/'))?.[1]
        ?? 'Studio Zoom')

  const handleBack = () => {
    // 1. Settings drawer/tab back handling
    if (pathname === '/settings') {
      if (typeof window !== 'undefined' && window.location.search.includes('tab=')) {
        router.push('/settings')
        return
      }
      window.dispatchEvent(new CustomEvent('studio-settings-back'))
      if (typeof window !== 'undefined' && window.sessionStorage.getItem('studio_settings_mobile_open') === 'true') {
        return
      }
    }

    // 2. If a mobile section overlay is open, back button closes it
    if (mobileSection) {
      setMobileSection(null)
      return
    }

    // 3. Child/Detail page hierarchy — always return to the parent module
    const parentRoute = getParentRoute(pathname)
    if (parentRoute) {
      router.push(parentRoute)
      return
    }

    // 4. Module page hierarchy for Admin/Manager — return to section menu
    if (isAdminOrManager) {
      const section = getSectionForPath(pathname)
      if (section) {
        setMobileSection(section)
        return
      }
    }

    // 5. Staff users returning from inner staff modules
    if (!isAdminOrManager) {
      router.push('/hrms/timeclock')
      return
    }

    // 6. Fallback to browser back or dashboard
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/dashboard')
    }
  }

  const handleSignOut = async () => {
    setSettingsDrawerOpen(false)
    await signOut()
    router.replace('/login')
  }

  return (
    <>
      <style>{`
        .app-topbar-header {
          height: 56px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          gap: 12px;
          box-shadow: none;
          background: ${isHomePage ? 'var(--color-surface)' : 'var(--color-background)'};
          border-bottom: ${isHomePage ? '0.5px solid var(--color-border)' : 'none'};
        }
        @media (min-width: 768px) {
          .app-topbar-header {
            background: var(--color-surface) !important;
            border-bottom: 0.5px solid var(--color-border) !important;
          }
        }
      `}</style>
      <header className="app-topbar-header">
        {/* ─── MOBILE VIEW (< 768px) ─── */}
        <div className="flex md:hidden items-center justify-between w-full">
          {isHomePage ? (
            <>
              {/* Left Corner: Settings Button for Admin/Manager, empty spacer for Staff */}
              {isAdminOrManager ? (
                <div style={{ display: 'flex', alignItems: 'center', width: '36px', flexShrink: 0 }}>
                  <button
                    id="mobile-topbar-settings-btn"
                    type="button"
                    onClick={() => setSettingsDrawerOpen(true)}
                    title="Settings"
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      color: 'var(--color-foreground)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <i className="ti ti-settings" style={{ fontSize: '18px' }} />
                  </button>
                </div>
              ) : (
                <div style={{ width: '36px', height: '36px', flexShrink: 0 }} />
              )}

              {/* Centre: Brand Logo & Name */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  overflow: 'hidden',
                  padding: '0 8px',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="Studio Zoom Logo"
                  style={{ height: '26px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
                />
                <span
                  style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: 'var(--color-foreground)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Studio Zoom
                </span>
              </div>

              {/* Right Corner: Notification Bell (36px width for symmetric balance) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '36px', flexShrink: 0 }}>
                <div
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    color: 'var(--color-foreground-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                  }}
                  onClick={() => router.push('/notifications')}
                  title="Notifications"
                >
                  <i className="ti ti-bell" style={{ fontSize: '18px' }} />
                  <span
                    style={{
                      position: 'absolute',
                      top: '7px',
                      right: '7px',
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: 'var(--color-primary)',
                      border: '1.5px solid var(--color-surface)',
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Inner Pages: Back Button */}
              <div style={{ display: 'flex', alignItems: 'center', width: '36px', flexShrink: 0 }}>
                <button
                  id="mobile-topbar-back-btn"
                  type="button"
                  onClick={handleBack}
                  title="Back"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    color: 'var(--color-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <i className="ti ti-arrow-left" style={{ fontSize: '20px' }} />
                </button>
              </div>

              {/* Inner Pages: Mobile Page Title */}
              <div
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: 'var(--text-base)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: 'var(--color-foreground)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  padding: '0 8px',
                }}
              >
                {title}
              </div>

              {/* Inner Pages Right: Notification Bell (maintains 36px symmetric balance) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '36px', flexShrink: 0 }}>
                <div
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    color: 'var(--color-foreground-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                  }}
                  onClick={() => router.push('/notifications')}
                  title="Notifications"
                >
                  <i className="ti ti-bell" style={{ fontSize: '18px' }} />
                  <span
                    style={{
                      position: 'absolute',
                      top: '7px',
                      right: '7px',
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: 'var(--color-primary)',
                      border: '1.5px solid var(--color-surface)',
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* ─── DESKTOP VIEW (>= 768px) ─── */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          <button
            onClick={toggleSidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: '6px',
              color: 'var(--color-foreground-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              transition: 'color 0.15s, background 0.15s',
            }}
            className="hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]"
          >
            <i
              className={`ti ${sidebarCollapsed ? 'ti-layout-sidebar-left-expand' : 'ti-layout-sidebar-left-collapse'}`}
              style={{ fontSize: '18px' }}
            />
          </button>

          <div
            style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              color: 'var(--color-foreground)',
            }}
          >
            {title}
          </div>
        </div>

        {/* Desktop Search */}
        <div className="hidden md:flex" style={{ flex: 1, minWidth: 0, justifyContent: 'center', padding: '0 8px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '340px', minWidth: '140px' }}>
            <i
              className="ti ti-search"
              style={{
                fontSize: '16px',
                color: 'var(--color-foreground-subtle)',
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            />
            <input
              placeholder="Search clients, events, equipment…"
              style={{
                fontFamily: 'var(--font-inter)',
                width: '100%',
                boxSizing: 'border-box',
                height: '36px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '8px',
                padding: '0 12px 0 34px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Desktop Right: Bell + Avatar + Role */}
        <div className="hidden md:flex items-center gap-3 flex-shrink-0">
          <div
            style={{
              position: 'relative',
              cursor: 'pointer',
              color: 'var(--color-foreground-muted)',
              display: 'flex',
            }}
            onClick={() => router.push('/notifications')}
            title="Notifications"
          >
            <i className="ti ti-bell" style={{ fontSize: '20px' }} />
            <span
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--color-primary)',
                border: '2px solid var(--color-surface)',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
              }}
            >
              {getInitials(appUser?.name ?? 'SZ')}
            </div>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'var(--color-accent-muted)',
                color: 'var(--color-accent)',
              }}
            >
              {appUser?.role}
            </span>
          </div>
        </div>
      </header>

      {/* ─── ADMIN / MANAGER SETTINGS & PROFILE LEFT SLIDE-IN DRAWER ─── */}
      {isAdminOrManager && (
        <MobileSideDrawer
          isOpen={settingsDrawerOpen}
          onClose={() => setSettingsDrawerOpen(false)}
          title="Settings & Account"
          subtitle="Studio configuration, theme & preferences"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* User Profile Card */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '12px',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: 'var(--color-primary-muted)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-sm)',
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
                  {appUser?.name || 'Studio Zoom User'}
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-foreground-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {appUser?.email || ''}
                </div>
              </div>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '3px 8px',
                  borderRadius: '10px',
                  background: 'var(--color-accent-muted)',
                  color: 'var(--color-accent)',
                  flexShrink: 0,
                }}
              >
                {role}
              </span>
            </div>

            {/* Menu Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Settings Navigation Link */}
              <button
                type="button"
                onClick={() => {
                  setSettingsDrawerOpen(false)
                  router.push('/settings')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'transparent',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-foreground)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-raised)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-foreground)',
                  }}
                >
                  <i className="ti ti-settings" style={{ fontSize: '18px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>System Settings</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                    Branding, packages, pricing & configurations
                  </div>
                </div>
                <i className="ti ti-chevron-right" style={{ fontSize: '16px', color: 'var(--color-foreground-subtle)' }} />
              </button>

              {/* Theme Toggle Button */}
              <button
                type="button"
                onClick={toggleTheme}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'transparent',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-foreground)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-raised)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-foreground)',
                  }}
                >
                  <i className={`ti ${theme === 'dark' ? 'ti-sun' : 'ti-moon'}`} style={{ fontSize: '18px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                    {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                    Switch visual appearance to {theme === 'dark' ? 'light' : 'dark'}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'var(--color-surface-raised)',
                    color: 'var(--color-foreground-muted)',
                  }}
                >
                  {theme}
                </span>
              </button>

              {/* Sign Out Button */}
              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'var(--color-danger-muted)',
                  border: '0.5px solid var(--color-danger)',
                  color: 'var(--color-danger)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginTop: '6px',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <i className="ti ti-logout" style={{ fontSize: '18px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Log Out</div>
                  <div style={{ fontSize: 'var(--text-xs)', opacity: 0.8 }}>End active session on this device</div>
                </div>
              </button>
            </div>
          </div>
        </MobileSideDrawer>
      )}
    </>
  )
}
