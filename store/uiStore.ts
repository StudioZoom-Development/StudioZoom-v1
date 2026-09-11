import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  theme:              'dark' | 'light'
  sidebarOpen:        boolean
  testDatasetMode:    boolean
  testModeCutoff:     number | null
  toggleTheme:        () => void
  setSidebarOpen:     (v: boolean) => void
  setTestDatasetMode: (active: boolean) => void
  resetTestCutoff:    () => void
}

export const useUIStore = create<UIState>()(
  persist(
    set => ({
      theme:              'dark',
      sidebarOpen:        true,
      testDatasetMode:    false,
      testModeCutoff:     null,
      toggleTheme:        () => set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setSidebarOpen:     v  => set({ sidebarOpen: v }),
      setTestDatasetMode: (active: boolean) => set(s => {
        if (active) {
          const cutoff = s.testModeCutoff || (Date.now() - 10000)
          return { testDatasetMode: true, testModeCutoff: cutoff }
        }
        return { testDatasetMode: false }
      }),
      resetTestCutoff: () => set({ testModeCutoff: Date.now() - 10000 }),
    }),
    {
      name: 'studio-zoom-ui',
      partialize: state => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
)

