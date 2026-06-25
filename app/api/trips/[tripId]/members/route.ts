import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { connectDB } from '@/lib/mongodb'
import { Trip } from '@/lib/models/Trip'

// GET /api/trips/[tripId]/members
export async function GET(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await connectDB()
  const { tripId } = await params
  const trip = await Trip.findById(tripId).select('ownerName ownerEmail members shareToken')
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const userEmail = session.user!.email
  const isOwner = trip.ownerEmail === userEmail
  const isMember = trip.members.some((m: { email: string }) => m.email === userEmail)
  if (!isOwner && !isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({
    owner: { name: trip.ownerName, email: trip.ownerEmail },
    members: trip.members,
    shareToken: trip.shareToken,
    isOwner,
  })
}
