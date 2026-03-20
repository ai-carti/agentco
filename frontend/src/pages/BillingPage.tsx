import React from 'react'

// POST-005: Billing UI skeleton — pre-MVP Stripe integration preparation

const CURRENT_PLAN = {
  name: 'Free',
  nextBilling: 'N/A',
  apiCalls: 240,
  tokensUsed: 38_000,
}

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '/mo',
    features: [
      'Up to 3 agents',
      '1,000 API calls / mo',
      '100K tokens / mo',
      'Community support',
    ],
    current: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$29',
    period: '/mo',
    features: [
      'Unlimited agents',
      '50,000 API calls / mo',
      '5M tokens / mo',
      'Priority support',
      'Advanced analytics',
    ],
    current: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$99',
    period: '/mo',
    features: [
      'Unlimited everything',
      'Custom API limits',
      'Dedicated support',
      'SLA guarantee',
      'SSO / SAML',
      'Audit logs',
    ],
    current: false,
  },
]

const USAGE_HISTORY = [
  { date: '2026-02-01', description: 'Pro Plan — February', amount: '$0.00' },
  { date: '2026-02-15', description: 'API overage — batch run', amount: '$0.00' },
  { date: '2026-03-01', description: 'Free Plan — March', amount: '$0.00' },
  { date: '2026-03-10', description: 'Token top-up (1M)', amount: '$0.00' },
  { date: '2026-03-15', description: 'War Room session', amount: '$0.00' },
]

const cardStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 10,
  padding: '1.25rem',
}

const labelStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '0.25rem',
}

const valueStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '1.1rem',
  fontWeight: 600,
}

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#f1f5f9',
  marginBottom: '1rem',
  marginTop: 0,
}

export default function BillingPage() {
  return (
    <div
      data-testid="billing-page"
      style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto' }}
    >
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, marginBottom: '1.5rem' }}>
        Billing
      </h1>

      {/* ── Current Plan ── */}
      <section data-testid="billing-current-plan" style={{ marginBottom: '2rem' }}>
        <h2 style={sectionHeadingStyle}>Current Plan</h2>
        <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
          <div>
            <p style={labelStyle}>Plan</p>
            <p style={valueStyle}>
              <span
                style={{
                  display: 'inline-block',
                  background: CURRENT_PLAN.name === 'Free' ? '#374151' : '#1d4ed8',
                  color: '#f8fafc',
                  borderRadius: 4,
                  padding: '0.15rem 0.6rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  marginRight: '0.5rem',
                }}
              >
                {CURRENT_PLAN.name}
              </span>
            </p>
          </div>
          <div>
            <p style={labelStyle}>Next billing</p>
            <p style={valueStyle}>{CURRENT_PLAN.nextBilling}</p>
          </div>
        </div>

        {/* Usage stats */}
        <div
          data-testid="billing-usage"
          style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}
        >
          <div style={{ ...cardStyle, flex: 1, minWidth: 160 }}>
            <p style={labelStyle}>API calls</p>
            <p style={valueStyle}>{CURRENT_PLAN.apiCalls.toLocaleString()}</p>
            <p style={{ color: '#475569', fontSize: '0.75rem', margin: '0.25rem 0 0.5rem' }}>
              of 1,000 / mo
            </p>
            {/* SIRI-UX-094: usage progress bar */}
            <div
              role="progressbar"
              aria-valuenow={CURRENT_PLAN.apiCalls}
              aria-valuemin={0}
              aria-valuemax={1000}
              aria-label="API calls usage"
              style={{ height: 4, background: '#334155', borderRadius: 2, overflow: 'hidden' }}
            >
              <div style={{ height: '100%', width: `${Math.min((CURRENT_PLAN.apiCalls / 1000) * 100, 100)}%`, background: '#3b82f6', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
          </div>
          <div style={{ ...cardStyle, flex: 1, minWidth: 160 }}>
            <p style={labelStyle}>Tokens used</p>
            <p style={valueStyle}>{(CURRENT_PLAN.tokensUsed / 1000).toLocaleString()}K</p>
            <p style={{ color: '#475569', fontSize: '0.75rem', margin: '0.25rem 0 0.5rem' }}>
              of 100K / mo
            </p>
            {/* SIRI-UX-094: usage progress bar */}
            <div
              role="progressbar"
              aria-valuenow={CURRENT_PLAN.tokensUsed}
              aria-valuemin={0}
              aria-valuemax={100000}
              aria-label="Tokens used"
              style={{ height: 4, background: '#334155', borderRadius: 2, overflow: 'hidden' }}
            >
              <div style={{ height: '100%', width: `${Math.min((CURRENT_PLAN.tokensUsed / 100000) * 100, 100)}%`, background: '#8b5cf6', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Upgrade Plans ── */}
      <section data-testid="billing-upgrade" style={{ marginBottom: '2rem' }}>
        <h2 style={sectionHeadingStyle}>Upgrade</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              data-testid={`billing-plan-${plan.id}`}
              style={{
                ...cardStyle,
                flex: 1,
                minWidth: 200,
                border: plan.current ? '1px solid #3b82f6' : '1px solid #334155',
                position: 'relative',
              }}
            >
              {plan.current && (
                <span
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    background: '#1d4ed8',
                    color: '#fff',
                    fontSize: '0.65rem',
                    borderRadius: 4,
                    padding: '0.1rem 0.4rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  Current
                </span>
              )}
              <h3
                style={{
                  margin: '0 0 0.25rem',
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: '#f1f5f9',
                }}
              >
                {plan.name}
              </h3>
              <p style={{ margin: '0 0 1rem', color: '#94a3b8' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f8fafc' }}>
                  {plan.price}
                </span>
                {plan.period}
              </p>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0 0 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                }}
              >
                {plan.features.map((feat) => (
                  <li
                    key={feat}
                    style={{ color: '#cbd5e1', fontSize: '0.82rem', display: 'flex', gap: '0.4rem' }}
                  >
                    <span style={{ color: '#22c55e' }}>✓</span> {feat}
                  </li>
                ))}
              </ul>
              <div title="Coming soon — Stripe integration">
                <button
                  disabled
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#334155',
                    color: '#64748b',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'not-allowed',
                  }}
                >
                  {plan.current ? 'Current plan' : 'Upgrade'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Usage History ── */}
      <section data-testid="billing-history">
        <h2 style={sectionHeadingStyle}>Usage History</h2>
        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155' }}>
                {['Date', 'Description', 'Amount'].map((col) => (
                  <th
                    key={col}
                    style={{
                      textAlign: 'left',
                      padding: '0.5rem 0.75rem',
                      color: '#94a3b8',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {USAGE_HISTORY.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: i < USAGE_HISTORY.length - 1 ? '1px solid #1e293b' : undefined,
                  }}
                >
                  <td style={{ padding: '0.6rem 0.75rem', color: '#94a3b8' }}>{row.date}</td>
                  <td style={{ padding: '0.6rem 0.75rem', color: '#f1f5f9' }}>
                    {row.description}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: '#22c55e', fontWeight: 600 }}>
                    {row.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
