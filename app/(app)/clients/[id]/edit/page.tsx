'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getClientById } from '@/lib/firebase/queries/clients'
import { Client } from '@/types'
import { EditClientModal } from '@/components/shared/EditClientModal'

import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'

export default function ClientEditPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let isMounted = true
    getClientById(id).then(c => {
      if (!isMounted) return
      setClient(c)
      setLoading(false)
    })
    return () => {
      isMounted = false
    }
  }, [id])

  if (loading) {
    return (
      <div style={{ padding: '30px', maxWidth: '600px', margin: '0 auto' }}>
        <LoadingSkeleton lines={6} height="36px" gap="14px" />
      </div>
    )
  }

  if (!client) {
    return (
      <div style={{
        color: 'var(--color-foreground-muted)',
        padding: '60px',
        textAlign: 'center',
        fontFamily: 'var(--font-inter)'
      }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: '32px', marginBottom: '12px', display: 'inline-block', color: 'var(--color-danger)' }} />
        <div>Client not found.</div>
      </div>
    )
  }

  return (
    <EditClientModal
      open={true}
      client={client}
      onClose={() => router.push(`/clients/${id}`)}
      onSuccess={() => router.push(`/clients/${id}`)}
    />
  )
}
