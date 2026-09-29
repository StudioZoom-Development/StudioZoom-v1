'use client'
import React, { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthListener } from '@/hooks/useAuth'

function AuthListenerMount() {
  useAuthListener()
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:     60_000,   // 1 minute
        retry:         1,
        refetchOnWindowFocus: false,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <AuthListenerMount />
      {children}
    </QueryClientProvider>
  )
}
