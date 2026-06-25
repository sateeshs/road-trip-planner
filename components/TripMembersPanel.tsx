'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'

interface Member {
  userId?: string
  name: string
  email: string
  image?: string
  addedAt?: string
}

interface TripMembersPanelProps {
  tripId: string | null
  open: boolean
  onClose: () => void
}

function Avatar({ name, image, size = 32 }: { name: string; image?: string; size?: number }) {
  if (image) return <img src={image} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  return (
    <div className="rounded-full bg-blue-100 flex items-center justify-center font-semibold text-blue-700" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export default function TripMembersPanel({ tripId, open, onClose }: TripMembersPanelProps) {
  const { data: session } = useSession()
  const [owner, setOwner] = useState<{ name: string; email: string } | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!tripId || !open) return
    setLoading(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/members`)
      if (res.ok) {
        const data = await res.json()
        setOwner(data.owner)
        setMembers(data.members ?? [])
        setShareToken(data.shareToken)
        setIsOwner(data.isOwner)
      }
    } finally { setLoading(false) }
  }, [tripId, open])

  useEffect(() => { load() }, [load])

  const inviteLink = shareToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${shareToken}` : null

  const copyLink = async () => {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const removeMember = async (identifier: string) => {
    if (!tripId) return
    setRemoving(identifier)
    try {
      await fetch(`/api/trips/${tripId}/members/${encodeURIComponent(identifier)}`, { method: 'DELETE' })
      await load()
    } finally { setRemoving(null) }
  }

  const leaveTrip = async () => {
    if (!tripId || !session?.user?.email) return
    await removeMember(session.user.email)
    onClose()
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[3000] bg-black/20 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-[3001] w-80 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-base">Trip Members</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Sign-in prompt if not logged in */}
          {!session && (
            <div className="bg-blue-50 rounded-xl p-4 text-center space-y-3">
              <p className="text-sm text-blue-700 font-medium">Sign in to save and share this trip</p>
              <button
                onClick={() => signIn('google')}
                className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium py-2 px-3 rounded-xl transition-colors shadow-sm"
              >
                <svg width="16" height="16" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/></svg>
                Sign in with Google
              </button>
            </div>
          )}

          {/* Invite link */}
          {session && tripId && shareToken && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Invite Link</p>
              <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                <p className="text-xs text-gray-500 break-all leading-relaxed">{inviteLink}</p>
                <button
                  onClick={copyLink}
                  className={`w-full text-xs font-semibold py-2 rounded-lg transition-colors ${
                    copied ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {copied ? '✓ Copied!' : '📋 Copy Link'}
                </button>
              </div>
              <p className="text-xs text-gray-400">Anyone with this link can join and view the trip.</p>
            </div>
          )}

          {/* Not yet saved trip */}
          {session && !tripId && (
            <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-700">
              Plan your trip first, then save it to get a shareable link.
            </div>
          )}

          {/* Members list */}
          {session && loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              Loading members…
            </div>
          )}

          {session && !loading && owner && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Members ({1 + members.length})</p>
              <ul className="space-y-2">
                {/* Owner */}
                <li className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50">
                  <Avatar name={owner.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{owner.name}</p>
                    <p className="text-xs text-gray-400 truncate">{owner.email}</p>
                  </div>
                  <span className="shrink-0 text-xs bg-blue-100 text-blue-600 font-semibold px-2 py-0.5 rounded-full">Owner</span>
                </li>
                {/* Members */}
                {members.map(m => (
                  <li key={m.email} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 group">
                    <Avatar name={m.name} image={m.image} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                      <p className="text-xs text-gray-400 truncate">{m.email}</p>
                    </div>
                    {(isOwner || m.email === session?.user?.email) && (
                      <button
                        disabled={removing === m.email}
                        onClick={() => isOwner ? removeMember(m.email) : leaveTrip()}
                        className="shrink-0 text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded hover:bg-red-50"
                      >
                        {removing === m.email ? '…' : (isOwner ? 'Remove' : 'Leave')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer — Sign out */}
        {session && (
          <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar name={session.user?.name ?? 'You'} image={session.user?.image ?? undefined} size={28} />
              <p className="text-xs text-gray-500 truncate">{session.user?.name}</p>
            </div>
            <button onClick={() => signOut()} className="text-xs text-gray-400 hover:text-red-500 shrink-0 ml-2">Sign out</button>
          </div>
        )}
      </div>
    </>
  )
}
