'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'

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
  '/erp/equipment':      'Equipment',
  '/erp/quotations':     'Quotations',
  '/erp/invoices':       'Invoices',
  '/erp/expenses':       'Expenses',
  '/erp/cashflow':       'Cashflow',
  '/erp/accounts':       'Accounts & Budgets',
  '/settings':           'Settings',
  '/notifications':      'Notifications',
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function TopBar() {
  const pathname        = usePathname()
  const router          = useRouter()
  const appUser         = useAuthStore(s => s.appUser)
  const { setSidebarOpen } = useUIStore()

  const title = PAGE_TITLES[pathname]
    ?? Object.entries(PAGE_TITLES).find(([k]) => pathname.startsWith(k + '/'))?.[1]
    ?? 'Studio Zoom'

  return (
    <header style={{
      height: '56px', flexShrink: 0,
      background: 'var(--color-surface)',
      borderBottom: '0.5px solid var(--color-border)',
      display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px',
    }}>
      {/* Hamburger — mobile & tablet (hidden on lg+ / desktop) */}
      <button
        className="lg:hidden"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open navigation menu"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '6px',
          color: 'var(--color-foreground-muted)', display: 'flex', alignItems: 'center',
          borderRadius: '8px', flexShrink: 0,
        }}
      >
        <i className="ti ti-menu-2" style={{ fontSize: '22px' }} />
      </button>

      {/* Page title */}
      <div style={{
        fontSize: 'var(--text-lg)', fontWeight: 600,
        letterSpacing: '-0.01em', whiteSpace: 'nowrap',
        color: 'var(--color-foreground)',
        flexShrink: 0,
      }}>{title}</div>

      {/* Search — hidden on mobile/tablet (< lg), visible on desktop (1025px+) */}
      <div className="hidden lg:flex" style={{ flex: 1, justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: '340px', maxWidth: '100%' }}>
          <i className="ti ti-search" style={{
            fontSize: '16px', color: 'var(--color-foreground-subtle)',
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
          }} />
          <input
            placeholder="Search clients, events, equipment…"
            style={{
              fontFamily: 'var(--font-inter)', width: '100%', boxSizing: 'border-box',
              height: '36px', background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)', borderRadius: '8px',
              padding: '0 12px 0 34px', fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground)', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Spacer on mobile & tablet so right icons stay right */}
      <div className="flex-1 lg:hidden" />

      {/* Right: bell + avatar + role */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div
          style={{ position: 'relative', cursor: 'pointer',
            color: 'var(--color-foreground-muted)', display: 'flex' }}
          onClick={() => router.push('/notifications')}
          title="Notifications"
        >
          <i className="ti ti-bell" style={{ fontSize: '20px' }} />
          <span style={{
            position: 'absolute', top: '-2px', right: '-2px',
            width: '8px', height: '8px', borderRadius: '50%',
            background: 'var(--color-primary)',
            border: '2px solid var(--color-surface)',
          }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '50%',
            background: 'var(--color-primary-muted)', color: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'var(--text-xs)', fontWeight: 700,
          }}>
            {getInitials(appUser?.name ?? 'SZ')}
          </div>
          <span className="hidden sm:inline" style={{
            fontSize: 'var(--text-xs)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.04em',
            padding: '2px 8px', borderRadius: '10px',
            background: 'var(--color-accent-muted)', color: 'var(--color-accent)',
          }}>
            {appUser?.role}
          </span>
        </div>
      </div>
    </header>
  )
}
