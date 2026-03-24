import React from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: React.ReactNode
}

// SIRI-UX-249: hover handled by CSS classes in index.css (.btn-primary:hover, etc.)
// Inline style sets base colors; CSS :hover overrides them — prefers-reduced-motion friendly
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
    color: '#ffffff',
    border: 'none',
  },
  secondary: {
    color: '#e2e8f0',
    border: '1px solid rgba(255,255,255,0.2)',
  },
  danger: {
    color: '#ffffff',
    border: 'none',
  },
}

export default function Button({
  variant = 'primary',
  children,
  style,
  disabled,
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

  return (
    <button
      className={[variantClass, 'btn', className].filter(Boolean).join(' ')}
      style={mergedStyle}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
