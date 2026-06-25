import type { Metadata } from 'next'
import './globals.css'
import { SessionProvider } from 'next-auth/react'

export const metadata: Metadata = {
  title: 'Road Trip Planner',
  description: 'Plan your perfect US road trip with AI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 text-gray-900">
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
