import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  theme:          'dark' | 'light'
  sidebarOpen:    boolean
  toggleTheme:    () => void
  setSidebarOpen: (v: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    set => ({
      theme:          'dark',
      sidebarOpen:    false,
      toggleTheme:    () => set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setSidebarOpen: (v: boolean) => set({ sidebarOpen: v }),
    }),
    { name: 'studio-zoom-ui' }
  )
)
