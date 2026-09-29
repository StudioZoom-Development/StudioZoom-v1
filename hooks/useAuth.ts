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
    // Safety fallback: ensure loading never hangs indefinitely if auth state response is delayed
    const timer = setTimeout(() => {
      setLoading(false)
    }, 2500)

    const unsub = onAuthStateChanged(
      auth,
      async fbUser => {
        clearTimeout(timer)
        setLoading(true)
        setFirebaseUser(fbUser)
        if (fbUser) {
          try {
            const docPromise = getDoc(doc(db, 'users', fbUser.uid))
            const timeoutPromise = new Promise<null>(resolve =>
              setTimeout(() => resolve(null), 2000)
            )
            const snap = await Promise.race([docPromise, timeoutPromise])
            if (snap && snap.exists()) {
              setAppUser({ uid: fbUser.uid, ...snap.data() } as AppUser)
            } else {
              setAppUser(null)
            }
          } catch (err) {
            console.error('Error fetching user document:', err)
            setAppUser(null)
          }
        } else {
          setAppUser(null)
        }
        setLoading(false)
      },
      err => {
        clearTimeout(timer)
        console.error('onAuthStateChanged error:', err)
        setFirebaseUser(null)
        setAppUser(null)
        setLoading(false)
      }
    )

    return () => {
      clearTimeout(timer)
      unsub()
    }
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
