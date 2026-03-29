import { useDocumentTitle } from '../hooks/useDocumentTitle'

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

export default function BillingPage() {
  // SIRI-UX-437: document title for accessibility + tab distinction (missed in SIRI-UX-433)
  useDocumentTitle('Billing — AgentCo')
  return (
    <div
      data-testid="billing-page"
      className="p-6 max-w-[900px] mx-auto"
    >
      <h1 className="text-2xl font-bold m-0 mb-6">
        Billing
      </h1>

      {/* ── Current Plan ── */}
      {/* SIRI-UX-322: aria-labelledby makes <section> a named region for AT navigation */}
      <section data-testid="billing-current-plan" aria-labelledby="billing-heading-current" className="mb-8">
        <h2 id="billing-heading-current" className="text-base font-bold text-slate-100 mb-4 mt-0">Current Plan</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-[10px] p-5 flex flex-wrap gap-8">
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Plan</p>
            <p className="text-slate-50 text-lg font-semibold">
              <span
                className={`inline-block ${CURRENT_PLAN.name === 'Free' ? 'bg-gray-700' : 'bg-blue-700'} text-slate-50 rounded px-2.5 py-0.5 text-sm font-bold mr-2`}
              >
                {CURRENT_PLAN.name}
              </span>
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Next billing</p>
            <p className="text-slate-50 text-lg font-semibold">{CURRENT_PLAN.nextBilling}</p>
          </div>
        </div>

        {/* Usage stats */}
        <div
          data-testid="billing-usage"
          className="flex gap-4 mt-4 flex-wrap"
        >
          <div className="bg-slate-800 border border-slate-700 rounded-[10px] p-5 flex-1 min-w-[160px]">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">API calls</p>
            <p className="text-slate-50 text-lg font-semibold">{CURRENT_PLAN.apiCalls.toLocaleString()}</p>
            <p className="text-slate-600 text-xs mt-1 mb-2">
              of 1,000 / mo
            </p>
            {/* SIRI-UX-094: usage progress bar */}
            <div
              role="progressbar"
              aria-valuenow={CURRENT_PLAN.apiCalls}
              aria-valuemin={0}
              aria-valuemax={1000}
              aria-label="API calls usage"
              className="h-1 bg-slate-700 rounded-sm overflow-hidden"
            >
              <div className="billing-progress-fill h-full bg-blue-500 rounded-sm" style={{ width: `${Math.min((CURRENT_PLAN.apiCalls / 1000) * 100, 100)}%` }} />
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-[10px] p-5 flex-1 min-w-[160px]">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Tokens used</p>
            <p className="text-slate-50 text-lg font-semibold">{(CURRENT_PLAN.tokensUsed / 1000).toLocaleString()}K</p>
            <p className="text-slate-600 text-xs mt-1 mb-2">
              of 100K / mo
            </p>
            {/* SIRI-UX-094: usage progress bar */}
            <div
              role="progressbar"
              aria-valuenow={CURRENT_PLAN.tokensUsed}
              aria-valuemin={0}
              aria-valuemax={100000}
              aria-label="Tokens used"
              className="h-1 bg-slate-700 rounded-sm overflow-hidden"
            >
              <div className="billing-progress-fill h-full bg-violet-500 rounded-sm" style={{ width: `${Math.min((CURRENT_PLAN.tokensUsed / 100000) * 100, 100)}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Upgrade Plans ── */}
      {/* SIRI-UX-322: aria-labelledby makes <section> a named region for AT navigation */}
      <section data-testid="billing-upgrade" aria-labelledby="billing-heading-upgrade" className="mb-8">
        <h2 id="billing-heading-upgrade" className="text-base font-bold text-slate-100 mb-4 mt-0">Upgrade</h2>
        <div className="flex gap-4 flex-wrap">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              data-testid={`billing-plan-${plan.id}`}
              className={`bg-slate-800 rounded-[10px] p-5 flex-1 min-w-[200px] relative ${plan.current ? 'border border-blue-500' : 'border border-slate-700'}`}
            >
              {plan.current && (
                <span className="absolute top-2.5 right-2.5 bg-blue-700 text-white text-[0.65rem] rounded px-1.5 py-0.5 font-bold uppercase">
                  Current
                </span>
              )}
              <h3 className="m-0 mb-1 text-base font-bold text-slate-100">
                {plan.name}
              </h3>
              <p className="m-0 mb-4 text-slate-400">
                <span className="text-2xl font-bold text-slate-50">
                  {plan.price}
                </span>
                {plan.period}
              </p>
              <ul className="list-none p-0 m-0 mb-4 flex flex-col gap-1.5">
                {plan.features.map((feat) => (
                  <li
                    key={feat}
                    className="text-slate-300 text-sm flex gap-1.5"
                  >
                    <span className="text-green-500">✓</span> {feat}
                  </li>
                ))}
              </ul>
              <div title="Coming soon — Stripe integration">
                {/* SIRI-UX-323: aria-label distinguishes plan buttons for screen readers */}
                <button
                  disabled
                  aria-label={plan.current ? `${plan.name} — current plan` : `Upgrade to ${plan.name}`}
                  className="w-full py-2 bg-slate-700 text-slate-500 border-none rounded-md font-semibold text-sm cursor-not-allowed"
                >
                  {plan.current ? 'Current plan' : 'Upgrade'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Usage History ── */}
      {/* SIRI-UX-322: aria-labelledby makes <section> a named region for AT navigation */}
      <section data-testid="billing-history" aria-labelledby="billing-heading-history">
        <h2 id="billing-heading-history" className="text-base font-bold text-slate-100 mb-4 mt-0">Usage History</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-[10px] p-5 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {['Date', 'Description', 'Amount'].map((col) => (
                  <th
                    key={col}
                    className="text-left px-3 py-2 text-slate-400 font-semibold text-xs uppercase tracking-wide"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* SIRI-UX-195: use stable composite key instead of array index */}
              {USAGE_HISTORY.map((row, i) => (
                <tr
                  key={`${row.date}-${row.description}`}
                  className={i < USAGE_HISTORY.length - 1 ? 'border-b border-slate-800' : ''}
                >
                  <td className="px-3 py-2.5 text-slate-400">{row.date}</td>
                  <td className="px-3 py-2.5 text-slate-100">{row.description}</td>
                  <td className="px-3 py-2.5 text-green-500 font-semibold">{row.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
