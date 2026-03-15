import { create } from 'zustand'

export type AgentStatus = 'idle' | 'running' | 'done' | 'error'
export type TaskStatus = 'todo' | 'backlog' | 'in_progress' | 'done' | 'failed'

export interface Agent {
  id: string
  name: string
  status: AgentStatus
  currentTask?: string
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
}

export interface Company {
  id: string
  name: string
}

interface AgentStore {
  agents: Agent[]
  tasks: Task[]
  currentCompany: Company | null
  setAgents: (agents: Agent[]) => void
  setTasks: (tasks: Task[]) => void
  setCurrentCompany: (company: Company | null) => void
  updateAgentStatus: (id: string, status: AgentStatus) => void
  updateTaskStatus: (id: string, status: TaskStatus) => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  tasks: [],
  currentCompany: null,
  setAgents: (agents) => set({ agents }),
  setTasks: (tasks) => set({ tasks }),
  setCurrentCompany: (company) => set({ currentCompany: company }),
  updateAgentStatus: (id, status) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, status } : a)),
    })),
  updateTaskStatus: (id, status) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    })),
}))
