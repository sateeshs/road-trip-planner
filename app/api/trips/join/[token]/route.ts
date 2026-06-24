import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { connectDB } from '@/lib/mongodb'
import { Trip } from '@/lib/models/Trip'

// POST /api/trips/join/[token] — join a trip by invite link
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userEmail = session.user.email
  const userName = session.user.name ?? 'Guest'
  const userImage = session.user.image ?? undefined
  await connectDB()
  const { token } = await params
  const trip = await Trip.findOne({ shareToken: token })
  if (!trip) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
  // Already owner
  if (trip.ownerEmail === userEmail) {
    return NextResponse.json({ trip, alreadyMember: true })
  }
  // Already a member
  const already = trip.members.some((m: { email: string }) => m.email === userEmail)
  if (!already) {
    trip.members.push({
      name: userName,
      email: userEmail,
      image: userImage,
      addedAt: new Date(),
    })
    await trip.save()
  }
  return NextResponse.json({ trip, alreadyMember: already })
}
