'use client'
import { useState, useEffect } from 'react'
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

interface UseRealtimeDocResult<T> {
  data:    T | null
  loading: boolean
  error:   Error | null
}

/**
 * Subscribe to a Firestore document in real time.
 * Unsubscribes automatically on unmount.
 */
export function useRealtimeDoc<T extends DocumentData>(
  collectionPath: string,
  docId: string | null | undefined
): UseRealtimeDocResult<T> {
  const [data,    setData]    = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<Error | null>(null)

  useEffect(() => {
    if (!docId) {
      setData(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const unsub = onSnapshot(
      doc(db, collectionPath, docId),
      snap => {
        if (snap.exists()) {
          setData({ id: snap.id, ...snap.data() } as unknown as T)
        } else {
          setData(null)
        }
        setLoading(false)
        setError(null)
      },
      err => {
        setError(err)
        setLoading(false)
      }
    )

    return unsub
  }, [collectionPath, docId])

  return { data, loading, error }
}
