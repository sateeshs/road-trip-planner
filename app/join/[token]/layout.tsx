import { SessionProvider } from 'next-auth/react'

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
