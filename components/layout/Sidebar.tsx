'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from '@/lib/firebase/auth'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { NAV_GROUPS, ALL_NAV_HREFS } from './navItems'
import type { UserRole } from '@/types'

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const appUser  = useAuthStore(s => s.appUser)
  const { theme, toggleTheme } = useUIStore()
  const role = appUser?.role ?? 'staff'

  const allHrefs = [
    ...ALL_NAV_HREFS,
    ...(role === 'admin' ? ['/settings'] : []),
  ]

  const isActive = (href: string): boolean => {
    if (pathname === href) return true
    if (pathname.startsWith(href + '/')) {
      const hasMoreSpecificMatch = allHrefs.some(
        other => other !== href && other.startsWith(href) && (pathname === other || pathname.startsWith(other + '/'))
      )
      return !hasMoreSpecificMatch
    }
    return false
  }

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Studio Zoom Logo"
          style={{ height: '30px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
        />
        <div style={{
          fontSize: 'var(--text-base)', fontWeight: 700,
          letterSpacing: '-0.01em', whiteSpace: 'nowrap',
          color: 'var(--color-foreground)',
        }}>Studio Zoom</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{
          padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '2px',
        }}>
          {/* Dashboard — all roles */}
          <NavLink
            href="/dashboard" icon="ti-layout-dashboard" label="Dashboard"
            active={isActive('/dashboard')}
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
                  />
                ))}
              </div>
            )
          })}
        </div>
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
            active={isActive('/settings')}
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
function NavLink({ href, icon, label, active }: {
  href: string; icon: string; label: string; active: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        height: '40px', padding: '0 10px', borderRadius: '8px', cursor: 'pointer',
        fontSize: 'var(--text-sm)', fontWeight: 500, boxSizing: 'border-box',
        textDecoration: 'none',
        background: active
          ? 'var(--color-primary-muted)'
          : hovered
          ? 'var(--color-surface-raised)'
          : 'transparent',
        color: active ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: '20px', flexShrink: 0 }} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </Link>
  )
}
