import { useCallback } from 'react'
import type React from 'react'

const CEO_TEMPLATE = 'You are a CEO of a tech startup. Your role is to set vision, drive strategy, and lead the team toward product-market fit. Make high-level decisions with clarity and confidence.'
const CTO_TEMPLATE = 'You are a CTO responsible for technical architecture. You oversee engineering decisions, evaluate trade-offs, and ensure the team builds scalable, maintainable systems.'
const PM_TEMPLATE = 'You are a Product Manager responsible for defining the product roadmap, gathering user feedback, and prioritizing features that maximize value for customers.'

const TEMPLATES: { key: string; label: string; text: string }[] = [
  { key: 'ceo', label: 'CEO Template', text: CEO_TEMPLATE },
  { key: 'cto', label: 'CTO Template', text: CTO_TEMPLATE },
  { key: 'pm', label: 'PM Template', text: PM_TEMPLATE },
]

function countTokens(text: string): number {
  return Math.round(text.split(/\s+/).filter(Boolean).length * 1.3)
}

interface SystemPromptEditorProps {
  value: string
  onChange: (value: string) => void
  id?: string
}

export default function SystemPromptEditor({ value, onChange, id }: SystemPromptEditorProps) {
  const tokens = countTokens(value)
  const isOverLimit = tokens > 2000

  // SIRI-UX-389: wrap in useCallback — both functions perse-created on every render;
  // handleTemplateClick passed as onClick to N template buttons, handleChange as onChange to textarea
  const handleTemplateClick = useCallback((templateText: string) => {
    if (value.trim() !== '') {
      const confirmed = window.confirm('Replace current prompt?')
      if (!confirmed) return
    }
    onChange(templateText)
  }, [value, onChange])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }, [onChange])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Template buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {TEMPLATES.map((tpl) => (
          <button
            key={tpl.key}
            type="button"
            data-testid={`template-btn-${tpl.key}`}
            onClick={() => handleTemplateClick(tpl.text)}
            // SIRI-UX-257: CSS class replaces inline styles + JS onMouseEnter/onMouseLeave
            className="system-prompt-tpl-btn"
          >
            {tpl.label}
          </button>
        ))}
      </div>

      {/* Textarea + token counter wrapper */}
      <div style={{ position: 'relative' }}>
        <textarea
          id={id}
          data-testid="system-prompt-textarea"
          value={value}
          onChange={handleChange}
          className="min-h-[200px] font-mono text-sm resize-y"
          style={{
            width: '100%',
            minHeight: '200px',
            padding: '0.5rem 0.75rem',
            paddingBottom: '1.5rem',
            background: '#1f2937',
            border: '1px solid #374151',
            borderRadius: 6,
            color: '#f8fafc',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
          placeholder="Describe the agent's role and behavior..."
        />
        <span
          data-testid="token-counter"
          className={`text-xs ${isOverLimit ? 'text-yellow-400' : 'text-gray-500'}`}
          style={{
            position: 'absolute',
            bottom: '0.4rem',
            right: '0.5rem',
            fontSize: '0.75rem',
            color: isOverLimit ? '#facc15' : '#6b7280',
            pointerEvents: 'none',
          }}
        >
          ~{tokens} tokens
        </span>
      </div>
    </div>
  )
}
