import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title:       'Studio Zoom',
  description: 'Photography & Video Studio Management — CRM, HRMS, ERP',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/_ds_bundle.css" />
        <script dangerouslySetInnerHTML={{ __html: 'window.module = { exports: {} };' }} />
      </head>
      <body data-theme="dark" style={{ margin: 0 }}>
        <Providers>
          {children}
        </Providers>
        {/* Load the Design System bundle using Next.js Script */}
        <Script
          src="/_ds/nova-design-system-8ef438d5-a323-412b-8d58-405071468e1d/_ds_bundle.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  )
}
