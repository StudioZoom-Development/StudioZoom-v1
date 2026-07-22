'use client'
import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { useAuthStore } from '@/store/authStore'
import type { AppUser } from '@/types'

/** Call once at app root — listens to Firebase auth state forever */
export function useAuthListener() {
  const { setFirebaseUser, setAppUser, setLoading } = useAuthStore()

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fbUser => {
      setLoading(true)
      setFirebaseUser(fbUser)
      if (fbUser) {
        try {
          const snap = await getDoc(doc(db, 'users', fbUser.uid))
          setAppUser(snap.exists()
            ? { uid: fbUser.uid, ...snap.data() } as AppUser
            : null
          )
        } catch (err) {
          console.error('Error fetching user document:', err)
          setAppUser(null)
        }
      } else {
        setAppUser(null)
      }
      setLoading(false)
    })
    return unsub
  }, [setFirebaseUser, setAppUser, setLoading])
}

/** Role helpers — use anywhere in the app */
export function useRole() {
  const role = useAuthStore(s => s.appUser?.role)
  return {
    role,
    isAdmin:          role === 'admin',
    isManager:        role === 'manager',
    isStaff:          role === 'staff',
    isAdminOrManager: role === 'admin' || role === 'manager',
  }
}
