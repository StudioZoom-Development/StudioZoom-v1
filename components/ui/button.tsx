import * as React from 'react'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'danger'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', style, children, ...props }, ref) => {
    const variantStyles: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
      default: {
        background: 'var(--color-primary)',
        color: '#ffffff',
        border: 'none',
      },
      outline: {
        background: 'transparent',
        color: 'var(--color-foreground)',
        border: '0.5px solid var(--color-border-strong)',
      },
      ghost: {
        background: 'transparent',
        color: 'var(--color-foreground)',
        border: 'none',
      },
      secondary: {
        background: 'var(--color-surface-raised)',
        color: 'var(--color-foreground)',
        border: '0.5px solid var(--color-border)',
      },
      danger: {
        background: 'var(--color-danger-muted)',
        color: 'var(--color-danger)',
        border: '0.5px solid var(--color-danger)',
      },
    }

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${className}`}
        style={{
          fontFamily: 'var(--font-inter)',
          cursor: 'pointer',
          padding: '0 16px',
          height: size === 'sm' ? '32px' : '36px',
          borderRadius: '8px',
          ...variantStyles[variant],
          ...style,
        }}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
