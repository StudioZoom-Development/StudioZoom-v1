'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { signIn } from '@/lib/firebase/auth'
import { useUIStore } from '@/store/uiStore'
import { BackgroundBeams } from '@/components/shared/BackgroundBeams'
import { useAuthStore } from '@/store/authStore'

const loginSchema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router      = useRouter()
  const { theme }   = useUIStore()
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setError(null)
    setLoading(true)
    useAuthStore.getState().setLoading(true) // Prevent auth guard race redirect
    try {
      await signIn(data.email, data.password)
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

  // Quick sign in for preview/dev role testing
  const handleQuickSignIn = (role: 'admin' | 'manager' | 'staff') => {
    setError(null)
    if (role === 'admin') {
      setValue('email', 'admin@studiozoom.in')
      setValue('password', 'StudioZoom@2026')
    } else if (role === 'manager') {
      setValue('email', 'manager@studiozoom.in')
      setValue('password', 'StudioZoom@2026')
    } else {
      setValue('email', 'staff@studiozoom.in')
      setValue('password', 'StudioZoom@2026')
    }
  }

  return (
    <div
      data-theme={theme}
      style={{
        height: '100vh',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'radial-gradient(ellipse 65% 50% at 50% 40%, var(--color-primary-muted) 0%, var(--color-background) 72%)',
        fontFamily: 'var(--font-inter)',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      {/* Aceternity Background Beams */}
      <BackgroundBeams />

      {/* Top bar header subtitle from design */}
      <div style={{
        position: 'absolute',
        top: '36px',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          color: 'var(--color-foreground-subtle)',
          textAlign: 'center',
        }}>
          Photography · Films · Since 2014 · Avadi
        </span>
      </div>

      {/* Card Border Gradient Wrapper */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth: '400px',
        borderRadius: '20px',
        padding: '1px',
        background: 'linear-gradient(160deg, var(--color-primary) 0%, var(--color-border) 30%, var(--color-border) 70%, var(--color-accent) 100%)',
        boxSizing: 'border-box',
      }}>
        {/* Inner Card Container */}
        <div style={{
          background: 'var(--color-surface)',
          borderRadius: '19px',
          padding: '40px',
          boxShadow: '0 0 100px var(--color-primary-muted), 0 30px 70px rgba(0,0,0,0.55)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxSizing: 'border-box',
        }}>
          {/* Logo + Brand */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, #8b3a72 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px var(--color-primary-muted)',
            }}>
              <i className="ti ti-aperture" style={{ fontSize: '32px', color: '#ffffff' }} />
            </div>
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
              gap: '8px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'var(--color-danger-muted)',
              border: '0.5px solid var(--color-danger)',
            }}>
              <i className="ti ti-alert-circle" style={{ fontSize: '16px', color: 'var(--color-danger)', flexShrink: 0 }} />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)' }}>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Email Field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
                  fontSize: '16px', color: 'var(--color-foreground-subtle)',
                }} />
                <input
                  {...register('email')}
                  type="email"
                  placeholder="you@studiozoom.in"
                  autoComplete="email"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    height: '40px', padding: '0 14px 0 38px',
                    background: 'var(--color-surface-raised)',
                    border: `0.5px solid ${errors.email ? 'var(--color-danger)' : 'var(--color-border)'}`,
                    borderRadius: '8px',
                    fontSize: 'var(--text-sm)', color: 'var(--color-foreground)',
                    fontFamily: 'var(--font-inter)', outline: 'none',
                    transition: 'border-color 0.15s',
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
                  fontSize: '16px', color: 'var(--color-foreground-subtle)',
                }} />
                <input
                  {...register('password')}
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    height: '40px', padding: '0 14px 0 38px',
                    background: 'var(--color-surface-raised)',
                    border: `0.5px solid ${errors.password ? 'var(--color-danger)' : 'var(--color-border)'}`,
                    borderRadius: '8px',
                    fontSize: 'var(--text-sm)', color: 'var(--color-foreground)',
                    fontFamily: 'var(--font-inter)', outline: 'none',
                    transition: 'border-color 0.15s',
                  }}
                />
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
                transition: 'background 0.15s, opacity 0.15s',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(198,83,159,0.3)',
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

          {/* Quick Preview Section from design */}
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
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleQuickSignIn('admin')}
                style={{
                  cursor: 'pointer',
                  fontFamily: 'var(--font-inter)',
                  background: 'var(--color-primary-muted)',
                  color: 'var(--color-primary)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  height: '32px',
                  padding: '0 14px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                }}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => handleQuickSignIn('manager')}
                style={{
                  cursor: 'pointer',
                  fontFamily: 'var(--font-inter)',
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-foreground)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  height: '32px',
                  padding: '0 14px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                }}
              >
                Manager
              </button>
              <button
                type="button"
                onClick={() => handleQuickSignIn('staff')}
                style={{
                  cursor: 'pointer',
                  fontFamily: 'var(--font-inter)',
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-foreground)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  height: '32px',
                  padding: '0 14px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                }}
              >
                Staff
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
