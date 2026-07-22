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
      sidebarOpen:    true,
      toggleTheme:    () => set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setSidebarOpen: v  => set({ sidebarOpen: v }),
    }),
    { name: 'studio-zoom-ui' }
  )
)
