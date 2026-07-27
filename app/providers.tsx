'use client'
import React from 'react'
import ReactDOM from 'react-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuthListener } from '@/hooks/useAuth'

if (typeof window !== 'undefined') {
  (window as unknown as { React: typeof React; ReactDOM: typeof ReactDOM }).React = React;
  (window as unknown as { React: typeof React; ReactDOM: typeof ReactDOM }).ReactDOM = ReactDOM;
}

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
