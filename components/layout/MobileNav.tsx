'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/types'

interface MobileNavItem {
  href:  string
  icon:  string
  label: string
  roles: UserRole[]
}

const MOBILE_NAV: MobileNavItem[] = [
  { href: '/dashboard',       icon: 'ti-layout-dashboard', label: 'Home',     roles: ['admin','manager','staff'] },
  { href: '/events',          icon: 'ti-route',            label: 'Events',   roles: ['admin','manager'] },
  { href: '/events/editing',  icon: 'ti-wand',             label: 'Editing',  roles: ['admin','manager','staff'] },
  { href: '/hrms/attendance', icon: 'ti-checklist',        label: 'HRMS',     roles: ['admin','manager','staff'] },
  { href: '/hrms/timeclock',  icon: 'ti-clock',            label: 'Clock',    roles: ['admin','manager','staff'] },
]

export function MobileNav() {
  const pathname = usePathname()
  const router   = useRouter()
  const appUser  = useAuthStore(s => s.appUser)
  const role     = appUser?.role ?? 'staff'

  const visible = MOBILE_NAV.filter(item => item.roles.includes(role))

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      height: '64px',
      background: 'var(--color-surface)',
      borderTop: '0.5px solid var(--color-border)',
      display: 'flex', alignItems: 'center',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {visible.map(item => {
        const active = isActive(item.href)
        return (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '2px', height: '100%',
              background: 'none', border: 'none', cursor: 'pointer',
              color: active ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
              transition: 'color 0.15s',
            }}
          >
            <i className={`ti ${item.icon}`} style={{ fontSize: '22px' }} />
            <span style={{
              fontSize: '0.625rem', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
