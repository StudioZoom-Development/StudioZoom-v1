'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from '@/lib/firebase/auth'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { NAV_GROUPS, ALL_NAV_HREFS } from './navItems'
import type { UserRole } from '@/types'

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function NavLink({
  href, icon, label, active, onClick,
}: {
  href: string; icon: string; label: string; active: boolean; onClick: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        height: '44px', padding: '0 12px', borderRadius: '8px', cursor: 'pointer',
        fontSize: 'var(--text-sm)', fontWeight: 500, boxSizing: 'border-box',
        textDecoration: 'none',
        background: active ? 'var(--color-primary-muted)' : 'transparent',
        color: active ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: '20px', flexShrink: 0 }} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </Link>
  )
}

export function MobileDrawer() {
  const pathname               = usePathname()
  const router                 = useRouter()
  const appUser                = useAuthStore(s => s.appUser)
  const { theme, toggleTheme, sidebarOpen, setSidebarOpen } = useUIStore()
  const role: UserRole         = appUser?.role ?? 'staff'

  // Track whether the drawer is in the DOM (for CSS transition)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (sidebarOpen) {
      setMounted(true)
      // Small delay so the CSS transition fires after mount
      const t = setTimeout(() => setVisible(true), 10)
      return () => clearTimeout(t)
    } else {
      setVisible(false)
      // Wait for slide-out animation before unmounting
      const t = setTimeout(() => setMounted(false), 280)
      return () => clearTimeout(t)
    }
  }, [sidebarOpen])

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden'
      document.body.classList.add('drawer-open')
    } else {
      document.body.style.overflow = ''
      document.body.classList.remove('drawer-open')
    }
    return () => {
      document.body.style.overflow = ''
      document.body.classList.remove('drawer-open')
    }
  }, [sidebarOpen])

  const close = () => setSidebarOpen(false)

  const allHrefs = [...ALL_NAV_HREFS, ...(role === 'admin' ? ['/settings'] : [])]

  const isActive = (href: string): boolean => {
    if (pathname === href) return true
    if (pathname.startsWith(href + '/')) {
      const hasMoreSpecific = allHrefs.some(
        other => other !== href && other.startsWith(href) &&
          (pathname === other || pathname.startsWith(other + '/'))
      )
      return !hasMoreSpecific
    }
    return false
  }

  const handleNavClick = (href: string) => {
    close()
    router.push(href)
  }

  const handleSignOut = async () => {
    close()
    await signOut()
    router.replace('/login')
  }

  if (!mounted) return null

  return (
    // Wrapper — only shown on mobile & tablet (< lg). On lg+ the desktop Sidebar renders instead.
    <div className="lg:hidden">
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.28s ease',
          pointerEvents: 'auto',
        }}
      />

      {/* Drawer panel */}
      <aside
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: '70vw', maxWidth: '320px',
          zIndex: 61,
          background: 'var(--color-surface)',
          borderRight: '0.5px solid var(--color-border)',
          display: 'flex', flexDirection: 'column',
          transform: visible ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* Logo header */}
        <div style={{
          height: '56px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: '10px', padding: '0 16px',
          borderBottom: '0.5px solid var(--color-border)',
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

          {/* Close button */}
          <button
            onClick={close}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', padding: '4px',
              color: 'var(--color-foreground-muted)',
              display: 'flex', alignItems: 'center',
            }}
          >
            <i className="ti ti-x" style={{ fontSize: '18px' }} />
          </button>
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
              onClick={() => handleNavClick('/dashboard')}
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
                      onClick={() => handleNavClick(item.href)}
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
              onClick={() => handleNavClick('/settings')}
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
    </div>
  )
}
