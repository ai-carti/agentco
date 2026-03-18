import React from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: React.ReactNode
}

const BASE_STYLES: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.375rem',
  padding: '0.5rem 1rem',
  borderRadius: 8,
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
  border: 'none',
  transition: 'background 0.15s, opacity 0.15s',
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: '#2563eb',
    color: '#ffffff',
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    color: '#e2e8f0',
    border: '1px solid rgba(255,255,255,0.2)',
  },
  danger: {
    background: '#dc2626',
    color: '#ffffff',
    border: 'none',
  },
}

const VARIANT_HOVER: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: '#1d4ed8' },
  secondary: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.35)' },
  danger: { background: '#b91c1c' },
}

export default function Button({
  variant = 'primary',
  children,
  style,
  disabled,
  onMouseEnter,
  onMouseLeave,
  className,
  ...props
}: ButtonProps) {
  const variantClass = `btn-${variant}`

  const mergedStyle: React.CSSProperties = {
    ...BASE_STYLES,
    ...VARIANT_STYLES[variant],
    ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
    ...style,
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled) {
      Object.assign(e.currentTarget.style, VARIANT_HOVER[variant])
    }
    onMouseEnter?.(e)
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled) {
      Object.assign(e.currentTarget.style, VARIANT_STYLES[variant])
    }
    onMouseLeave?.(e)
  }

  return (
    <button
      className={[variantClass, 'btn', className].filter(Boolean).join(' ')}
      style={mergedStyle}
      disabled={disabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </button>
  )
}
