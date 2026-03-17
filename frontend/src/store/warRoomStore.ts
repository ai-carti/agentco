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
  senderId: string
  senderName: string
  targetId: string
  targetName: string
  content: string
  timestamp: string
}

export type RunStatus = 'active' | 'stopped' | 'done' | 'failed'

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
  { id: 'agent-1', name: 'CEO Agent', role: 'Chief Executive Officer', status: 'thinking', avatar: '👔', level: 0 },
  { id: 'agent-2', name: 'Dev Agent', role: 'Software Developer', status: 'running', avatar: '💻', level: 1 },
  { id: 'agent-3', name: 'QA Agent', role: 'Quality Assurance', status: 'idle', avatar: '🔍', level: 1 },
  { id: 'agent-4', name: 'PM Agent', role: 'Project Manager', status: 'idle', avatar: '📋', level: 1 },
]

const MOCK_MESSAGES: FeedMessage[] = [
  {
    id: 'mock-1',
    senderId: 'agent-1',
    senderName: 'CEO Agent',
    targetId: 'agent-2',
    targetName: 'Dev Agent',
    content: 'Start implementing the authentication module for the new API',
    timestamp: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: 'mock-2',
    senderId: 'agent-2',
    senderName: 'Dev Agent',
    targetId: 'agent-3',
    targetName: 'QA Agent',
    content: 'Auth module ready for review. Includes JWT token validation and refresh flow',
    timestamp: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: 'mock-3',
    senderId: 'agent-3',
    senderName: 'QA Agent',
    targetId: 'agent-1',
    targetName: 'CEO Agent',
    content: 'Tests passing. 12 test cases covered including edge cases for token expiry',
    timestamp: new Date(Date.now() - 30000).toISOString(),
  },
]

// Mock messages for interval simulation
const MOCK_INTERVAL_MESSAGES = [
  { senderId: 'agent-1', senderName: 'CEO Agent', targetId: 'agent-4', targetName: 'PM Agent', content: 'Update the project timeline with new milestones' },
  { senderId: 'agent-2', senderName: 'Dev Agent', targetId: 'agent-1', targetName: 'CEO Agent', content: 'Completed API integration. Moving to frontend work' },
  { senderId: 'agent-4', senderName: 'PM Agent', targetId: 'agent-3', targetName: 'QA Agent', content: 'Please prepare test cases for the new release' },
  { senderId: 'agent-3', senderName: 'QA Agent', targetId: 'agent-2', targetName: 'Dev Agent', content: 'Found 2 edge cases in token refresh logic' },
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

export const useWarRoomStore = create<WarRoomState>((set, get) => ({
  agents: [],
  messages: [],
  cost: 0,
  runStatus: 'active' as RunStatus,
  prevStatuses: {},
  flashingAgents: new Set<string>(),

  setAgents: (agents) => set({ agents }),

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg],
      cost: state.cost + 0.0031,
    })),

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
      cost: 0.042,
      runStatus: 'active' as RunStatus,
    }),

  reset: () => {
    mockMsgCounter = 0
    set({
      agents: [],
      messages: [],
      cost: 0,
      runStatus: 'active' as RunStatus,
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
