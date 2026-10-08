import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  theme:                  'dark' | 'light'
  sidebarOpen:            boolean
  sidebarCollapsed:       boolean
  testDatasetMode:        boolean
  testModeCutoff:         number | null
  mobileSection:          'crm' | 'hrms' | 'erp' | 'profile' | null
  isMobileNewOpen:        boolean
  toggleTheme:            () => void
  setSidebarOpen:         (v: boolean) => void
  toggleSidebarCollapsed: () => void
  setSidebarCollapsed:    (v: boolean) => void
  setTestDatasetMode:     (active: boolean) => void
  resetTestCutoff:        () => void
  setMobileSection:       (section: 'crm' | 'hrms' | 'erp' | 'profile' | null) => void
  setIsMobileNewOpen:     (open: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    set => ({
      theme:                  'dark',
      sidebarOpen:            true,
      sidebarCollapsed:       false,
      testDatasetMode:        false,
      testModeCutoff:         null,
      mobileSection:          null,
      isMobileNewOpen:        false,
      toggleTheme:            () => set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setSidebarOpen:         v => set({ sidebarOpen: v }),
      toggleSidebarCollapsed: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed:    v => set({ sidebarCollapsed: v }),
      setMobileSection:       section => set({ mobileSection: section }),
      setIsMobileNewOpen:     open => set({ isMobileNewOpen: open }),
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
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
)

