import { create } from 'zustand'

export type WarRoomAgentStatus = 'idle' | 'thinking' | 'running' | 'done'

export interface WarRoomAgent {
  id: string
  name: string
  role: string
  status: WarRoomAgentStatus
  avatar: string
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
  setAgents: (agents: WarRoomAgent[]) => void
  addMessage: (msg: FeedMessage) => void
  updateAgentStatus: (agentId: string, status: WarRoomAgentStatus) => void
  addCost: (amount: number) => void
  setRunStatus: (status: RunStatus) => void
  loadMockData: () => void
  reset: () => void
}

const MOCK_AGENTS: WarRoomAgent[] = [
  { id: 'agent-1', name: 'CEO Agent', role: 'Chief Executive Officer', status: 'thinking', avatar: '👔' },
  { id: 'agent-2', name: 'Dev Agent', role: 'Software Developer', status: 'running', avatar: '💻' },
  { id: 'agent-3', name: 'QA Agent', role: 'Quality Assurance', status: 'idle', avatar: '🔍' },
  { id: 'agent-4', name: 'PM Agent', role: 'Project Manager', status: 'idle', avatar: '📋' },
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

export const useWarRoomStore = create<WarRoomState>((set) => ({
  agents: [],
  messages: [],
  cost: 0,
  runStatus: 'active' as RunStatus,

  setAgents: (agents) => set({ agents }),

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg],
      cost: state.cost + 0.0031,
    })),

  updateAgentStatus: (agentId, status) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, status } : a,
      ),
    })),

  addCost: (amount) => set((state) => ({ cost: state.cost + amount })),

  setRunStatus: (runStatus) => set({ runStatus }),

  loadMockData: () =>
    set({
      agents: MOCK_AGENTS,
      messages: MOCK_MESSAGES,
      cost: 0.042,
      runStatus: 'active' as RunStatus,
    }),

  reset: () =>
    set({
      agents: [],
      messages: [],
      cost: 0,
      runStatus: 'active' as RunStatus,
    }),
}))
