import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { connectDB } from '@/lib/mongodb'
import { Trip } from '@/lib/models/Trip'

async function getAuthorizedTrip(tripId: string, email: string) {
  const trip = await Trip.findById(tripId)
  if (!trip) return null
  const isOwner = trip.ownerEmail === email
  const isMember = trip.members.some((m: { email: string }) => m.email === email)
  if (!isOwner && !isMember) return null
  return trip
}

// GET /api/trips/[tripId] — load trip state
export async function GET(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await connectDB()
  const { tripId } = await params
  const trip = await getAuthorizedTrip(tripId, session.user.email)
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ trip })
}

// PUT /api/trips/[tripId] — save trip state
export async function PUT(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await connectDB()
  const { tripId } = await params
  const trip = await getAuthorizedTrip(tripId, session.user.email)
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  const allowed = ['title','stops','routeGeometry','totalDistance','totalDuration','hotelsByCity','attractionsByCity','surroundingsByCity','confirmedReservations','planActivities']
  for (const key of allowed) {
    if (key in body) (trip as Record<string, unknown>)[key] = body[key]
  }
  trip.updatedAt = new Date()
  await trip.save()
  return NextResponse.json({ ok: true })
}

// DELETE /api/trips/[tripId] — owner only
export async function DELETE(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await connectDB()
  const { tripId } = await params
  const trip = await Trip.findById(tripId)
  if (!trip || trip.ownerEmail !== session.user.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await trip.deleteOne()
  return NextResponse.json({ ok: true })
}
