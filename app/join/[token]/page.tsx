'use client'
import { useEffect, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'

export default function JoinPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const token = params.token as string
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) return  // show sign-in prompt
    // Signed in — attempt to join
    setJoining(true)
    fetch(`/api/trips/join/${token}`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        // Navigate to the trip
        router.push(`/?trip=${data.trip._id}`)
      })
      .catch(() => setError('Failed to join trip'))
      .finally(() => setJoining(false))
  }, [session, status, token, router])

  if (status === 'loading' || joining) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">{joining ? 'Joining trip…' : 'Loading…'}</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center space-y-5">
          <div className="text-4xl">🗺️</div>
          <h1 className="text-xl font-bold text-gray-900">Join a Road Trip</h1>
          <p className="text-sm text-gray-500">Sign in to join this shared trip and start collaborating.</p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            onClick={() => signIn('google', { callbackUrl: `/join/${token}` })}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-4 rounded-xl transition-colors shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/></svg>
            Continue with Google
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-3xl">⚠️</div>
          <p className="text-gray-700">{error}</p>
          <button onClick={() => router.push('/')} className="text-blue-600 text-sm hover:underline">Go home</button>
        </div>
      </div>
    )
  }

  return null
}
