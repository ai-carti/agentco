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
    <div className="flex flex-col gap-2">
      {/* Template buttons */}
      <div className="flex gap-2 flex-wrap">
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
      <div className="relative">
        <textarea
          id={id}
          data-testid="system-prompt-textarea"
          // SIRI-UX-470: aria-describedby links textarea to token counter so screen readers announce token usage
          aria-describedby="system-prompt-token-count"
          value={value}
          onChange={handleChange}
          className="w-full min-h-[200px] px-3 py-2 pb-6 bg-gray-800 border border-gray-700 rounded-md text-slate-50 text-sm font-mono resize-y box-border"
          placeholder="Describe the agent's role and behavior..."
        />
        <span
          id="system-prompt-token-count"
          data-testid="token-counter"
          // SIRI-UX-470: role="status" + aria-live so screen readers announce token count changes
          role="status"
          aria-live="polite"
          className={`absolute bottom-1.5 right-2 text-xs pointer-events-none ${isOverLimit ? 'text-yellow-400' : 'text-gray-500'}`}
        >
          ~{tokens} tokens
        </span>
      </div>
    </div>
  )
}
