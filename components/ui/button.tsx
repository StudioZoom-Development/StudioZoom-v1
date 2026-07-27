import * as React from 'react'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'danger'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', style, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${className}`}
        style={{
          fontFamily: 'var(--font-inter)',
          cursor: 'pointer',
          background: variant === 'outline' ? 'transparent' : 'var(--color-primary)',
          color: variant === 'outline' ? 'var(--color-foreground)' : '#ffffff',
          border: variant === 'outline' ? '0.5px solid var(--color-border)' : 'none',
          padding: '0 16px',
          height: size === 'sm' ? '32px' : '36px',
          borderRadius: '8px',
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
