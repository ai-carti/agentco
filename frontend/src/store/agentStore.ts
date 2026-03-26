import { create } from 'zustand'

export type AgentStatus = 'idle' | 'running' | 'done' | 'error'
export type TaskStatus = 'todo' | 'backlog' | 'in_progress' | 'done' | 'failed'

export interface Agent {
  id: string
  name: string
  role?: string
  model?: string
  status: AgentStatus
  currentTask?: string
  last_task_at?: string | null
}

export type TaskPriority = 'high' | 'medium' | 'low'

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  assignedTo?: string
  assignee_id?: string
  assignee_name?: string
  due_date?: string
  priority?: TaskPriority
  // SIRI-UX-397: backend TaskOut now includes result and created_at (ALEX-TD-203)
  result?: string | null
  created_at?: string | null
}

export interface Company {
  id: string
  name: string
}

export interface AgentStore {
  agents: Agent[]
  tasks: Task[]
  currentCompany: Company | null
  activeCompanyTab: string | null
  setAgents: (agents: Agent[]) => void
  setTasks: (tasks: Task[]) => void
  setCurrentCompany: (company: Company | null) => void
  setActiveCompanyTab: (tab: string | null) => void
  updateAgentStatus: (id: string, status: AgentStatus) => void
  // SIRI-UX-403: updateTaskStatus removed — dead code, never used by any component
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  tasks: [],
  currentCompany: null,
  activeCompanyTab: null,
  setAgents: (agents) => set({ agents }),
  setTasks: (tasks) => set({ tasks }),
  setCurrentCompany: (company) => set({ currentCompany: company }),
  setActiveCompanyTab: (tab) => set({ activeCompanyTab: tab }),
  updateAgentStatus: (id, status) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, status } : a)),
    })),
  // SIRI-UX-403: updateTaskStatus removed — dead code, never consumed by any component
}))
