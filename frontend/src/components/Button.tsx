import React from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: React.ReactNode
}

// SIRI-UX-249: hover handled by CSS classes in index.css (.btn-primary:hover, etc.)
const BASE_CLASSES = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer border-none transition-[background,opacity] duration-150'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'text-white border-none',
  secondary: 'text-slate-200 border border-white/20',
  danger: 'text-white border-none',
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

  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : ''

  return (
    <button
      className={[variantClass, 'btn', BASE_CLASSES, VARIANT_CLASSES[variant], disabledClasses, className].filter(Boolean).join(' ')}
      style={style}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
