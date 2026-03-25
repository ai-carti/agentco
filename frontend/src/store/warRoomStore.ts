import { create } from 'zustand'

export type WarRoomAgentStatus = 'idle' | 'thinking' | 'running' | 'done'

export interface WarRoomAgent {
  id: string
  name: string
  role: string
  status: WarRoomAgentStatus
  avatar: string
  level: number // 0 = CEO/top, 1+ = subordinates
}

export interface FeedMessage {
  id: string
  // SIRI-UX-135: senderId/targetId optional — backend may send them; used for future routing
  senderId?: string
  senderName: string
  targetId?: string
  targetName: string
  content: string
  timestamp: string
}

// SIRI-UX-121: 'idle' = no run started yet (Stop button disabled on initial load)
export type RunStatus = 'idle' | 'active' | 'stopped' | 'done' | 'failed'

// SIRI-UX-139: cap messages to prevent unbounded growth in long sessions
const MAX_MESSAGES = 300

interface WarRoomState {
  agents: WarRoomAgent[]
  messages: FeedMessage[]
  cost: number
  runStatus: RunStatus
  // Track previous statuses for flash detection
  prevStatuses: Record<string, WarRoomAgentStatus>
  flashingAgents: Set<string>
  setAgents: (agents: WarRoomAgent[]) => void
  addMessage: (msg: FeedMessage) => void
  updateAgentStatus: (agentId: string, status: WarRoomAgentStatus) => void
  addCost: (amount: number) => void
  setRunStatus: (status: RunStatus) => void
  loadMockData: () => void
  reset: () => void
  clearFlash: (agentId: string) => void
}

const MOCK_AGENTS: WarRoomAgent[] = [
  { id: 'agent-1', name: 'Alex', role: 'CEO', status: 'thinking', avatar: '👔', level: 0 },
  { id: 'agent-2', name: 'Jordan', role: 'Chief Product Officer', status: 'running', avatar: '🎯', level: 1 },
  { id: 'agent-3', name: 'Dev', role: 'Software Engineer', status: 'idle', avatar: '💻', level: 1 },
  { id: 'agent-4', name: 'Morgan', role: 'Market Analyst', status: 'idle', avatar: '📊', level: 1 },
]

const MOCK_MESSAGES: FeedMessage[] = [
  {
    id: 'mock-1',
    senderId: 'agent-1',
    senderName: 'Alex',
    targetId: 'agent-4',
    targetName: 'Morgan',
    content: 'Research our top 3 competitors and identify gaps in their enterprise offerings. Focus on pricing, integrations, and customer reviews from the last 6 months.',
    timestamp: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: 'mock-2',
    senderId: 'agent-4',
    senderName: 'Morgan',
    targetId: 'agent-2',
    targetName: 'Jordan',
    content: 'Analysis complete. Key gap: none of the top 3 offer real-time multi-agent orchestration. Customers are paying $50k/yr for manual coordination. This is our wedge.',
    timestamp: new Date(Date.now() - 75000).toISOString(),
  },
  {
    id: 'mock-3',
    senderId: 'agent-2',
    senderName: 'Jordan',
    targetId: 'agent-1',
    targetName: 'Alex',
    content: 'Drafted Q2 product roadmap: (1) War Room v2 with real-time collaboration, (2) Agent marketplace, (3) SOC2 compliance. Estimated 8-week delivery with current team.',
    timestamp: new Date(Date.now() - 30000).toISOString(),
  },
]

// Mock messages for interval simulation — business-focused scenarios
const MOCK_INTERVAL_MESSAGES = [
  { senderId: 'agent-1', senderName: 'Alex', targetId: 'agent-3', targetName: 'Dev', content: 'Implement the investor dashboard endpoint. We need ARR, MoM growth, and burn rate surfaced by tomorrow morning.' },
  { senderId: 'agent-3', senderName: 'Dev', targetId: 'agent-1', targetName: 'Alex', content: 'Dashboard API done. Query time: 120ms. Added caching layer — handles up to 10k concurrent users without degradation.' },
  { senderId: 'agent-2', senderName: 'Jordan', targetId: 'agent-4', targetName: 'Morgan', content: 'Run churn analysis on cohorts from last quarter. I need to know which features are correlated with 90-day retention.' },
  { senderId: 'agent-4', senderName: 'Morgan', targetId: 'agent-2', targetName: 'Jordan', content: 'Retention insight: users who activate War Room within 3 days have 4x 90-day retention. Recommend making it the primary onboarding step.' },
  { senderId: 'agent-1', senderName: 'Alex', targetId: 'agent-2', targetName: 'Jordan', content: 'Series A deck needs updating before Thursday. Highlight the retention data and add the new enterprise pipeline numbers. Investors care about repeatable revenue.' },
  { senderId: 'agent-3', senderName: 'Dev', targetId: 'agent-1', targetName: 'Alex', content: 'Shipped SSO integration for enterprise tier. Auth latency down to 85ms p99. Passes SOC2 audit requirements — security team signed off.' },
]

let mockMsgCounter = 0

export function getNextMockEvent(agents: WarRoomAgent[]) {
  const msg = MOCK_INTERVAL_MESSAGES[mockMsgCounter % MOCK_INTERVAL_MESSAGES.length]
  mockMsgCounter++

  // Cycle a random agent through statuses
  const statuses: WarRoomAgentStatus[] = ['idle', 'thinking', 'running', 'done']
  const agentIdx = mockMsgCounter % agents.length
  const agent = agents[agentIdx]
  const currentIdx = statuses.indexOf(agent?.status ?? 'idle')
  const nextStatus = statuses[(currentIdx + 1) % statuses.length]

  return {
    message: {
      id: `mock-interval-${mockMsgCounter}`,
      senderId: msg.senderId,
      senderName: msg.senderName,
      targetId: msg.targetId,
      targetName: msg.targetName,
      content: msg.content,
      timestamp: new Date().toISOString(),
    },
    statusUpdate: agent ? { agentId: agent.id, status: nextStatus } : null,
  }
}

// SIRI-UX-345: removed unused `_get` parameter — store only uses `set`
export const useWarRoomStore = create<WarRoomState>((set) => ({
  agents: [],
  messages: [],
  cost: 0,
  // SIRI-UX-121: start in 'idle' so Stop button is disabled until real run starts
  runStatus: 'idle' as RunStatus,
  prevStatuses: {},
  flashingAgents: new Set<string>(),

  setAgents: (agents) => set({ agents }),

  // SIRI-UX-125: do NOT add fixed cost per message — cost comes exclusively
  // from llm_token WS events via addCost(data.cost). Double-counting removed.
  // SIRI-UX-139: cap at MAX_MESSAGES to prevent unbounded growth in long sessions
  addMessage: (msg) =>
    set((state) => {
      const next = [...state.messages, msg]
      return { messages: next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next }
    }),

  updateAgentStatus: (agentId, status) =>
    set((state) => {
      const prev = state.agents.find((a) => a.id === agentId)
      const wasThinking = prev?.status === 'thinking' || prev?.status === 'running'
      const isDone = status === 'done'
      const shouldFlash = wasThinking && isDone

      const newFlashing = new Set(state.flashingAgents)
      if (shouldFlash) {
        newFlashing.add(agentId)
      }

      return {
        agents: state.agents.map((a) =>
          a.id === agentId ? { ...a, status } : a,
        ),
        prevStatuses: { ...state.prevStatuses, [agentId]: prev?.status ?? 'idle' },
        flashingAgents: newFlashing,
      }
    }),

  addCost: (amount) => set((state) => ({ cost: state.cost + amount })),

  setRunStatus: (runStatus) => set({ runStatus }),

  loadMockData: () =>
    set({
      agents: MOCK_AGENTS,
      messages: MOCK_MESSAGES,
      // SIRI-UX-313: cost must start at 0 — per SIRI-POST-004/SIRI-UX-125/SIRI-UX-212,
      // cost is accumulated exclusively from real WS llm_token events via addCost().
      // Setting mock cost pollutes the cost counter in dev mode and hides real accumulation bugs.
      cost: 0,
      // SIRI-UX-121: mock mode still uses 'idle' — no real run is happening
      runStatus: 'idle' as RunStatus,
    }),

  reset: () => {
    mockMsgCounter = 0
    set({
      agents: [],
      messages: [],
      cost: 0,
      runStatus: 'idle' as RunStatus,
      prevStatuses: {},
      flashingAgents: new Set<string>(),
    })
  },

  clearFlash: (agentId) =>
    set((state) => {
      const newFlashing = new Set(state.flashingAgents)
      newFlashing.delete(agentId)
      return { flashingAgents: newFlashing }
    }),
}))
