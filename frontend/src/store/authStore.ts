import { create } from 'zustand'
import * as api from '../api/client'

export interface AuthUser {
  id: string
  email: string
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  error: string | null
}

interface AuthActions {
  initAuth: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  clearError: () => void
}

type AuthStore = AuthState & AuthActions

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  error: null,

  initAuth: async () => {
    const token = localStorage.getItem('agentco_token')
    if (!token) return
    try {
      const user = await api.getMe(token)
      set({ token, user })
    } catch {
      get().logout()
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const { access_token } = await api.login(email, password)
      api.setStoredToken(access_token)
      const user = await api.getMe(access_token)
      set({ token: access_token, user, isLoading: false })
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message })
    }
  },

  register: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      await api.register(email, password)
      const { access_token } = await api.login(email, password)
      api.setStoredToken(access_token)
      const user = await api.getMe(access_token)
      set({ token: access_token, user, isLoading: false })
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message })
    }
  },

  logout: () => {
    api.removeStoredToken()
    set({ token: null, user: null, error: null })
  },

  clearError: () => set({ error: null }),
}))
