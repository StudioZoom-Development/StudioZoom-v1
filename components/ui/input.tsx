import * as React from 'react'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', style, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        style={{
          fontFamily: 'var(--font-inter)',
          height: '36px',
          background: 'var(--color-surface-raised)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '8px',
          padding: '0 12px',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-foreground)',
          outline: 'none',
          ...style,
        }}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'
