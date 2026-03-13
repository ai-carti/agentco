import { create } from 'zustand'

export type AgentStatus = 'idle' | 'running' | 'done' | 'error'
export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Agent {
  id: string
  name: string
  status: AgentStatus
  currentTask?: string
}

export interface Task {
  id: string
  title: string
  status: TaskStatus
  assignedTo?: string
}

interface AgentStore {
  agents: Agent[]
  tasks: Task[]
  setAgents: (agents: Agent[]) => void
  setTasks: (tasks: Task[]) => void
  updateAgentStatus: (id: string, status: AgentStatus) => void
  updateTaskStatus: (id: string, status: TaskStatus) => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  tasks: [],
  setAgents: (agents) => set({ agents }),
  setTasks: (tasks) => set({ tasks }),
  updateAgentStatus: (id, status) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, status } : a)),
    })),
  updateTaskStatus: (id, status) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    })),
}))
