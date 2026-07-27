'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { MobileNav } from '@/components/layout/MobileNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { appUser, loading } = useAuthStore()
  const { theme }            = useUIStore()
  const router               = useRouter()

  // Sync theme attribute to document element and body for global CSS variables
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.body.setAttribute('data-theme', theme)
  }, [theme])

  // Redirect unauthenticated users
  useEffect(() => {
    if (!loading && !appUser) router.replace('/login')
  }, [appUser, loading, router])

  // Full-screen spinner while checking auth
  if (loading) {
    return (
      <div
        data-theme={theme}
        style={{
          height: '100vh', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-background)',
        }}
      >
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          border: '2px solid var(--color-border)',
          borderTopColor: 'var(--color-primary)',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!appUser) return null

  return (
    <div
      data-theme={theme}
      style={{
        display: 'flex', height: '100vh', overflow: 'hidden',
        fontFamily: 'var(--font-inter)',
        background: 'var(--color-background)',
        color: 'var(--color-foreground)',
      }}
    >
      {/* Sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <main style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          background: 'var(--color-background)',
          // Extra bottom padding on mobile for the bottom nav bar
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          <div className="md:pb-0 pb-20" style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px' }}>
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden">
        <MobileNav />
      </div>
    </div>
  )
}
