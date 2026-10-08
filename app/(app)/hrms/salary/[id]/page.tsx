'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SalaryDetailPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/hrms/salary')
  }, [router])

  return null
}
