import { create } from 'zustand'
import type { User } from 'firebase/auth'
import type { AppUser } from '@/types'

interface AuthState {
  firebaseUser:    User | null
  appUser:         AppUser | null
  loading:         boolean
  setFirebaseUser: (u: User | null) => void
  setAppUser:      (u: AppUser | null) => void
  setLoading:      (l: boolean) => void
}

export const useAuthStore = create<AuthState>(set => ({
  firebaseUser:    null,
  appUser:         null,
  loading:         true,
  setFirebaseUser: u => set({ firebaseUser: u }),
  setAppUser:      u => set({ appUser: u }),
  setLoading:      l => set({ loading: l }),
}))
