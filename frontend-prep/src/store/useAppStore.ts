import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'thinking' | 'done';

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
}

export type TaskStatus = 'backlog' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee?: string;
  description?: string;
}

export type RunStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

// ─── Store ────────────────────────────────────────────────────────────────────

interface AppState {
  // Agents
  agents: Agent[];
  setAgents: (agents: Agent[]) => void;
  updateAgentStatus: (id: string, status: AgentStatus) => void;

  // Tasks
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;

  // Run orchestration status
  runStatus: RunStatus;
  setRunStatus: (status: RunStatus) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Agents
  agents: [],
  setAgents: (agents) => set({ agents }),
  updateAgentStatus: (id, status) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, status } : a)),
    })),

  // Tasks
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTaskStatus: (id, status) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    })),

  // Run status
  runStatus: 'idle',
  setRunStatus: (runStatus) => set({ runStatus }),
}));
