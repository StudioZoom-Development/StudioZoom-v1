'use client'

import { use } from 'react'
import { LeadForm } from '../_components/LeadForm'

interface LeadEditPageProps {
  params: Promise<{ id: string }>
}

export default function LeadEditPage({ params }: LeadEditPageProps) {
  const { id } = use(params)
  return <LeadForm mode="edit" leadId={id} />
}
