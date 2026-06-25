import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { connectDB } from '@/lib/mongodb'
import { Trip } from '@/lib/models/Trip'

// DELETE /api/trips/[tripId]/members/[userId] — owner removes someone, or user removes themselves
export async function DELETE(_req: Request, { params }: { params: Promise<{ tripId: string; userId: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await connectDB()
  const { tripId, userId } = await params
  const trip = await Trip.findById(tripId)
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const isOwner = trip.ownerEmail === session.user.email
  const targetMember = trip.members.find((m: { userId: { toString(): string }; email: string }) => m.userId?.toString() === userId || m.email === userId)
  const isSelf = targetMember?.email === session.user.email
  if (!isOwner && !isSelf) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  trip.members = trip.members.filter((m: { userId: { toString(): string }; email: string }) => m.userId?.toString() !== userId && m.email !== userId)
  await trip.save()
  return NextResponse.json({ ok: true })
}
