import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { connectDB } from '@/lib/mongodb'
import { Trip } from '@/lib/models/Trip'
import { nanoid } from 'nanoid'

// GET /api/trips — list trips for the current user
export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await connectDB()
  const email = session.user.email
  const trips = await Trip.find({
    $or: [{ ownerEmail: email }, { 'members.email': email }],
  }).sort({ updatedAt: -1 }).select('_id title ownerName ownerEmail members updatedAt').lean()
  return NextResponse.json({ trips })
}

// POST /api/trips — create a new trip
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await connectDB()
  const body = await req.json().catch(() => ({}))
  const trip = await Trip.create({
    ownerId: body.ownerId ?? null,
    ownerName: session.user.name ?? 'Unknown',
    ownerEmail: session.user.email,
    shareToken: nanoid(12),
    title: body.title ?? 'New Trip',
    members: [],
    stops: body.stops ?? [],
    routeGeometry: body.routeGeometry ?? null,
    totalDistance: body.totalDistance ?? null,
    totalDuration: body.totalDuration ?? null,
    hotelsByCity: body.hotelsByCity ?? {},
    attractionsByCity: body.attractionsByCity ?? {},
    surroundingsByCity: body.surroundingsByCity ?? {},
    confirmedReservations: body.confirmedReservations ?? [],
    planActivities: body.planActivities ?? [],
  })
  return NextResponse.json({ trip })
}
