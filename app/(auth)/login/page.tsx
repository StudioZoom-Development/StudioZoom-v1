'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { doc, getDoc } from 'firebase/firestore'
import { signIn } from '@/lib/firebase/auth'
import { db } from '@/lib/firebase/config'
import { useUIStore } from '@/store/uiStore'
import { BackgroundBeams } from '@/components/shared/BackgroundBeams'
import { useAuthStore } from '@/store/authStore'
import type { AppUser } from '@/types'

const loginSchema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router      = useRouter()
  const { theme }   = useUIStore()
  const { appUser, loading: authLoading } = useAuthStore()
  const [error, setError]               = useState<string | null>(null)
  const [loading, setLoading]           = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Auto-redirect if already signed in
  useEffect(() => {
    if (!authLoading && appUser) {
      router.replace(appUser.role === 'staff' ? '/hrms/timeclock' : '/dashboard')
    }
  }, [appUser, authLoading, router])

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setError(null)
    setLoading(true)
    try {
      const cred = await signIn(data.email, data.password)
      try {
        const userDoc = await getDoc(doc(db, 'users', cred.user.uid))
        if (userDoc.exists()) {
          const u = { uid: cred.user.uid, ...userDoc.data() } as AppUser
          useAuthStore.getState().setAppUser(u)
          useAuthStore.getState().setLoading(false)
          router.replace(u.role === 'staff' ? '/hrms/timeclock' : '/dashboard')
          return
        }
      } catch (docErr) {
        console.warn('Could not prefetch user profile:', docErr)
      }
      router.replace('/dashboard')
    } catch (err: unknown) {
      useAuthStore.getState().setLoading(false)
      const msg = (err as { code?: string })?.code
      if (msg === 'auth/user-not-found' || msg === 'auth/wrong-password' || msg === 'auth/invalid-credential') {
        setError('Invalid email or password')
      } else if (msg === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.')
      } else {
        setError('Sign in failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Only show the "Preview a role" shortcuts in non-production environments (Dev / Preview)
  const showRolePreview =
    process.env.NEXT_PUBLIC_ENABLE_ROLE_PREVIEW !== 'false' &&
    process.env.NEXT_PUBLIC_APP_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== 'studio-zoom-production'

  // Quick sign in for preview/dev role testing
  const handleQuickSignIn = async (role: 'admin' | 'manager' | 'staff') => {
    setError(null)
    const creds = {
      admin:   { email: 'admin@studiozoom.in',   password: 'StudioZoom@2026' },
      manager: { email: 'manager@studiozoom.in', password: 'StudioZoom@2026' },
      staff:   { email: 'staff@studiozoom.in',   password: 'StudioZoom@2026' },
    }[role]
    setValue('email', creds.email, { shouldValidate: true, shouldDirty: true, shouldTouch: true })
    setValue('password', creds.password, { shouldValidate: true, shouldDirty: true, shouldTouch: true })
    await onSubmit(creds)
  }

  return (
    <div
      data-theme={theme}
      className="login-container"
      style={{
        minHeight: '100dvh',
        width: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
        background: 'radial-gradient(ellipse 65% 50% at 50% 40%, var(--color-primary-muted) 0%, var(--color-background) 72%)',
        fontFamily: 'var(--font-inter)',
        padding: '24px 16px',
        boxSizing: 'border-box',
      }}
    >
      {/* Aceternity Background Beams */}
      <div
        className="pointer-events-none select-none"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}
      >
        <BackgroundBeams />
      </div>

      {/* Floating Theme Toggle (Dual-Theme Testing & User Convenience) */}
      <button
        type="button"
        id="login-theme-toggle"
        onClick={useUIStore.getState().toggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          zIndex: 30,
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-surface-raised)',
          border: '0.5px solid var(--color-border)',
          color: 'var(--color-foreground-muted)',
          cursor: 'pointer',
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
          transition: 'all 0.15s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <i className={`ti ${theme === 'dark' ? 'ti-sun' : 'ti-moon'}`} style={{ fontSize: '17px' }} />
      </button>

      {/* Top bar header subtitle from design */}
      <div
        className="login-top-tagline"
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '16px',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        <span
          className="login-tagline"
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: 'var(--color-foreground-subtle)',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          Photography · Films · Since 2014 · Avadi
        </span>
      </div>

      {/* Card Border Gradient Wrapper */}
      <div
        className="login-card-wrapper"
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: '400px',
          borderRadius: '20px',
          padding: '1px',
          background: 'linear-gradient(160deg, var(--color-primary) 0%, var(--color-border) 30%, var(--color-border) 70%, var(--color-accent) 100%)',
          boxSizing: 'border-box',
          boxShadow: '0 0 100px var(--color-primary-muted), 0 30px 70px rgba(0,0,0,0.55)',
        }}
      >
        {/* Inner Card Container */}
        <div
          className="login-card-inner"
          style={{
            background: 'var(--color-surface)',
            borderRadius: '19px',
            padding: '40px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            boxSizing: 'border-box',
          }}
        >
          {/* Logo + Brand */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Studio Zoom Logo"
              className="login-logo"
              style={{
                maxHeight: '96px',
                maxWidth: '240px',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                filter: 'drop-shadow(0 8px 16px rgba(198, 83, 159, 0.25))',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textAlign: 'center' }}>
              <h1 style={{
                margin: 0,
                fontSize: 'var(--text-xl)',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: 'var(--color-foreground)',
                whiteSpace: 'nowrap',
              }}>Studio Zoom</h1>
              <p style={{
                margin: 0,
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground-muted)',
              }}>Frames that speak. Films that live.</p>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 10px',
              borderRadius: '6px',
              background: 'var(--color-danger-muted)',
              border: '0.5px solid var(--color-danger)',
            }}>
              <i className="ti ti-alert-circle" style={{ fontSize: '15px', color: 'var(--color-danger)', flexShrink: 0 }} />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{error}</span>
            </div>
          )}

          {/* Form */}
          <form
            suppressHydrationWarning
            method="post"
            action="#"
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit(onSubmit)(e)
            }}
            className="login-form"
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            {/* Email Field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-muted)',
              }}>Email</label>
              <div style={{ position: 'relative' }}>
                <i className="ti ti-mail" style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  fontSize: '16px', color: 'var(--color-foreground-subtle)', pointerEvents: 'none',
                }} />
                <input
                  suppressHydrationWarning
                  {...register('email')}
                  type="email"
                  placeholder="you@studiozoom.in"
                  autoComplete="email"
                  className="login-input"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    height: '40px', padding: '0 14px 0 38px',
                    background: 'var(--color-surface-raised)',
                    border: `0.5px solid ${errors.email ? 'var(--color-danger)' : 'var(--color-border)'}`,
                    borderRadius: '8px',
                    fontSize: 'var(--text-sm)', color: 'var(--color-foreground)',
                    fontFamily: 'var(--font-inter)', outline: 'none',
                    transition: 'border-color 0.15s',
                    touchAction: 'manipulation',
                  }}
                />
              </div>
              {errors.email && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
                  {errors.email.message}
                </span>
              )}
            </div>

            {/* Password Field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--color-foreground-muted)',
                }}>Password</label>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)', cursor: 'pointer' }}>
                  Forgot password?
                </span>
              </div>
              <div style={{ position: 'relative' }}>
                <i className="ti ti-lock" style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  fontSize: '16px', color: 'var(--color-foreground-subtle)', pointerEvents: 'none',
                }} />
                <input
                  suppressHydrationWarning
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="login-input"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    height: '40px', padding: '0 40px 0 38px',
                    background: 'var(--color-surface-raised)',
                    border: `0.5px solid ${errors.password ? 'var(--color-danger)' : 'var(--color-border)'}`,
                    borderRadius: '8px',
                    fontSize: 'var(--text-sm)', color: 'var(--color-foreground)',
                    fontFamily: 'var(--font-inter)', outline: 'none',
                    transition: 'border-color 0.15s',
                    touchAction: 'manipulation',
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setShowPassword(prev => !prev)
                  }}
                  style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0,
                    width: '44px',
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                    color: 'var(--color-foreground-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                    zIndex: 10,
                  }}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <i className={`ti ${showPassword ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: '18px', pointerEvents: 'none' }} />
                </button>
              </div>
              {errors.password && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
                  {errors.password.message}
                </span>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="login-btn"
              style={{
                width: '100%',
                height: '44px',
                background: loading
                  ? 'var(--color-primary-muted)'
                  : 'var(--color-primary)',
                color: loading ? 'var(--color-primary)' : '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-inter)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'background 0.15s, opacity 0.15s, transform 0.1s',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(198,83,159,0.3)',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {loading ? (
                <>
                  <i className="ti ti-loader-2" style={{ fontSize: '18px', animation: 'spin 0.8s linear infinite' }} />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Quick Preview Section (Dev / Preview only) */}
          {showRolePreview && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              alignItems: 'center',
              borderTop: '0.5px solid var(--color-border)',
              paddingTop: '16px',
            }}>
              <div style={{
                fontSize: 'var(--text-xs)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
              }}>Preview a role</div>
              <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="role-btn"
                  disabled={loading}
                  onClick={() => handleQuickSignIn('admin')}
                  style={{
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-inter)',
                    background: 'var(--color-primary-muted)',
                    color: 'var(--color-primary)',
                    border: '1px solid var(--color-primary)',
                    borderRadius: '8px',
                    height: '36px',
                    minWidth: '80px',
                    padding: '0 14px',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'transform 0.1s ease, opacity 0.1s ease',
                    position: 'relative',
                    zIndex: 10,
                  }}
                >
                  Admin
                </button>
                <button
                  type="button"
                  className="role-btn"
                  disabled={loading}
                  onClick={() => handleQuickSignIn('manager')}
                  style={{
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-inter)',
                    background: 'var(--color-surface-raised)',
                    color: 'var(--color-foreground)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    height: '36px',
                    minWidth: '80px',
                    padding: '0 14px',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'transform 0.1s ease, opacity 0.1s ease',
                    position: 'relative',
                    zIndex: 10,
                  }}
                >
                  Manager
                </button>
                <button
                  type="button"
                  className="role-btn"
                  disabled={loading}
                  onClick={() => handleQuickSignIn('staff')}
                  style={{
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-inter)',
                    background: 'var(--color-surface-raised)',
                    color: 'var(--color-foreground)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    height: '36px',
                    minWidth: '80px',
                    padding: '0 14px',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'transform 0.1s ease, opacity 0.1s ease',
                    position: 'relative',
                    zIndex: 10,
                  }}
                >
                  Staff
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg) }
        }
        @media (max-width: 640px) {
          .login-container {
            padding: max(16px, env(safe-area-inset-top)) 12px max(16px, env(safe-area-inset-bottom)) !important;
            min-height: 100dvh !important;
          }
          .login-card-wrapper {
            margin: auto 0;
            max-width: 360px !important;
            border-radius: 18px !important;
          }
          .login-card-inner {
            padding: 24px 18px !important;
            border-radius: 17px !important;
            gap: 14px !important;
          }
          .login-tagline {
            font-size: 10px !important;
            letter-spacing: 0.12em !important;
          }
          .login-top-tagline {
            margin-bottom: 10px !important;
          }
          .login-logo {
            max-height: 60px !important;
          }
          .login-form {
            gap: 12px !important;
          }
          .login-input {
            height: 40px !important;
            font-size: 16px !important;
          }
          .login-btn {
            height: 42px !important;
          }
          .role-btn {
            height: 32px !important;
            padding: 0 10px !important;
            font-size: var(--text-xs) !important;
          }
          .role-btn:active {
            transform: scale(0.96);
            opacity: 0.85;
          }
          .login-btn:active:not(:disabled) {
            transform: scale(0.98);
            opacity: 0.92;
          }
        }
      `}</style>
    </div>
  )
}
