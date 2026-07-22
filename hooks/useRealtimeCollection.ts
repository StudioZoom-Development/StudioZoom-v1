'use client'
import { useState, useEffect } from 'react'
import {
  collection,
  onSnapshot,
  query,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

interface UseRealtimeCollectionResult<T> {
  data:    T[]
  loading: boolean
  error:   Error | null
}

/**
 * Subscribe to a Firestore collection in real time with optional query constraints.
 * Unsubscribes automatically on unmount.
 *
 * @example
 * const { data } = useRealtimeCollection<Client>(
 *   'clients',
 *   [where('isDeleted', '!=', true), orderBy('createdAt', 'desc')]
 * )
 */
export function useRealtimeCollection<T extends DocumentData>(
  collectionPath: string,
  constraints: QueryConstraint[] = []
): UseRealtimeCollectionResult<T> {
  const [data,    setData]    = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<Error | null>(null)

  useEffect(() => {
    setLoading(true)
    const q = query(collection(db, collectionPath), ...constraints)

    const unsub = onSnapshot(
      q,
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as T))
        setData(docs)
        setLoading(false)
        setError(null)
      },
      err => {
        setError(err)
        setLoading(false)
      }
    )

    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionPath])

  return { data, loading, error }
}
