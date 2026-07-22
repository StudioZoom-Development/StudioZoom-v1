'use client'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from '@/lib/firebase/auth'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import type { UserRole } from '@/types'

interface NavItem {
  id:    string
  label: string
  icon:  string
  href:  string
  roles: UserRole[]
}

const CRM_ITEMS: NavItem[] = [
  { id: 'events',     label: 'Events Board', icon: 'ti-route',           href: '/events',            roles: ['admin','manager'] },
  { id: 'calendar',   label: 'Calendar',     icon: 'ti-calendar-event',  href: '/events/calendar',   roles: ['admin','manager'] },
  { id: 'work-board', label: 'Work Board',   icon: 'ti-layout-kanban',   href: '/events/work-board', roles: ['admin','manager'] },
  { id: 'editing',    label: 'Editing Queue',icon: 'ti-wand',            href: '/events/editing',    roles: ['admin','manager','staff'] },
  { id: 'clients',    label: 'Clients',      icon: 'ti-users',           href: '/clients',           roles: ['admin','manager'] },
  { id: 'leads',      label: 'Leads',        icon: 'ti-user-plus',       href: '/leads',             roles: ['admin','manager'] },
]

const HRMS_ITEMS: NavItem[] = [
  { id: 'attendance',  label: 'Attendance',  icon: 'ti-checklist',    href: '/hrms/attendance',  roles: ['admin','manager','staff'] },
  { id: 'timeclock',   label: 'Time Clock',  icon: 'ti-clock',        href: '/hrms/timeclock',   roles: ['admin','manager','staff'] },
  { id: 'timelogs',    label: 'Time Logs',   icon: 'ti-history',      href: '/hrms/timelogs',    roles: ['admin','manager'] },
  { id: 'staff',       label: 'Staff',       icon: 'ti-id-badge-2',   href: '/hrms/staff',       roles: ['admin'] },
  { id: 'freelancers', label: 'Freelancers', icon: 'ti-user-star',    href: '/hrms/freelancers', roles: ['admin','manager'] },
  { id: 'salary',      label: 'Salary',      icon: 'ti-cash',         href: '/hrms/salary',      roles: ['admin'] },
  { id: 'payslips',    label: 'Payslips',    icon: 'ti-file-invoice', href: '/hrms/payslips',    roles: ['admin','staff'] },
]

const ERP_ITEMS: NavItem[] = [
  { id: 'equipment',  label: 'Equipment',  icon: 'ti-camera',    href: '/erp/equipment',  roles: ['admin','manager'] },
  { id: 'quotations', label: 'Quotations', icon: 'ti-file-text', href: '/erp/quotations', roles: ['admin','manager'] },
  { id: 'invoices',   label: 'Invoices',   icon: 'ti-receipt',   href: '/erp/invoices',   roles: ['admin'] },
  { id: 'expenses',   label: 'Expenses',   icon: 'ti-wallet',    href: '/erp/expenses',   roles: ['admin'] },
  { id: 'cashflow',   label: 'Cashflow',   icon: 'ti-chart-bar', href: '/erp/cashflow',   roles: ['admin'] },
  { id: 'accounts',   label: 'Accounts',   icon: 'ti-scale',     href: '/erp/accounts',   roles: ['admin'] },
]

const NAV_GROUPS = [
  { label: 'CRM',  items: CRM_ITEMS  },
  { label: 'HRMS', items: HRMS_ITEMS },
  { label: 'ERP',  items: ERP_ITEMS  },
]

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const appUser  = useAuthStore(s => s.appUser)
  const { theme, toggleTheme } = useUIStore()
  const role = appUser?.role ?? 'staff'

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  const handleSignOut = async () => {
    await signOut()
    router.replace('/login')
  }

  return (
    <aside style={{
      width: '220px', flexShrink: 0,
      background: 'var(--color-surface)',
      borderRight: '0.5px solid var(--color-border)',
      display: 'flex', flexDirection: 'column', height: '100vh',
    }}>
      {/* Logo */}
      <div style={{
        height: '56px', display: 'flex', alignItems: 'center',
        gap: '10px', padding: '0 16px',
        borderBottom: '0.5px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px',
          background: 'linear-gradient(135deg, var(--color-primary) 0%, #8b3a72 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <i className="ti ti-aperture" style={{ fontSize: '18px', color: '#ffffff' }} />
        </div>
        <div style={{
          fontSize: 'var(--text-base)', fontWeight: 700,
          letterSpacing: '-0.01em', whiteSpace: 'nowrap',
          color: 'var(--color-foreground)',
        }}>Studio Zoom</div>
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '2px',
      }}>
        {/* Dashboard — all roles */}
        <NavLink
          href="/dashboard" icon="ti-layout-dashboard" label="Dashboard"
          active={isActive('/dashboard')} onClick={() => router.push('/dashboard')}
        />

        {NAV_GROUPS.map(group => {
          const visible = group.items.filter(item => item.roles.includes(role))
          if (!visible.length) return null
          return (
            <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{
                fontSize: 'var(--text-xs)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                margin: '16px 0 4px', padding: '0 10px',
              }}>{group.label}</div>
              {visible.map(item => (
                <NavLink
                  key={item.id}
                  href={item.href} icon={item.icon} label={item.label}
                  active={isActive(item.href)}
                  onClick={() => router.push(item.href)}
                />
              ))}
            </div>
          )
        })}
      </nav>

      {/* Bottom: Settings + User card */}
      <div style={{
        borderTop: '0.5px solid var(--color-border)',
        padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '8px',
        flexShrink: 0,
      }}>
        {role === 'admin' && (
          <NavLink
            href="/settings" icon="ti-settings" label="Settings"
            active={isActive('/settings')} onClick={() => router.push('/settings')}
          />
        )}
        {/* User card */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 10px', borderRadius: '10px',
          background: 'var(--color-surface-raised)',
          border: '0.5px solid var(--color-border)',
        }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: 'var(--color-primary-muted)', color: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'var(--text-xs)', fontWeight: 700, flexShrink: 0,
          }}>
            {getInitials(appUser?.name ?? 'SZ')}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{
              fontSize: 'var(--text-sm)', fontWeight: 600,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              color: 'var(--color-foreground)',
            }}>{appUser?.name}</div>
            <span style={{
              fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)',
              textTransform: 'capitalize',
            }}>{role}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={toggleTheme}
              style={{
                cursor: 'pointer', background: 'none', border: 'none', padding: '4px',
                color: 'var(--color-foreground-muted)', display: 'flex', alignItems: 'center',
                borderRadius: '6px',
              }}
              title="Toggle theme"
            >
              <i className={`ti ${theme === 'dark' ? 'ti-sun' : 'ti-moon'}`}
                 style={{ fontSize: '16px' }} />
            </button>
            <button
              onClick={handleSignOut}
              style={{
                cursor: 'pointer', background: 'none', border: 'none', padding: '4px',
                color: 'var(--color-foreground-muted)', display: 'flex', alignItems: 'center',
                borderRadius: '6px',
              }}
              title="Sign out"
            >
              <i className="ti ti-logout" style={{ fontSize: '16px' }} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}

// ── Reusable nav item ─────────────────────────────────────────────────────
function NavLink({ href: _href, icon, label, active, onClick }: {
  href: string; icon: string; label: string; active: boolean; onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        height: '40px', padding: '0 10px', borderRadius: '8px', cursor: 'pointer',
        fontSize: 'var(--text-sm)', fontWeight: 500,
        background: active ? 'var(--color-primary-muted)' : 'transparent',
        color: active ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: '20px' }} />
      <span>{label}</span>
    </div>
  )
}
