export const runtime = 'nodejs'

import ical, { ICalCalendarMethod } from 'ical-generator'
import type { RouteStop, ConfirmedReservation } from '@/types'

export async function POST(req: Request) {
  const { stops, reservations } = await req.json() as {
    stops: RouteStop[]
    reservations: ConfirmedReservation[]
  }

  if (!Array.isArray(stops) || stops.length === 0) {
    return new Response('No stops provided', { status: 400 })
  }

  const calendar = ical({ name: 'Road Trip', method: ICalCalendarMethod.PUBLISH })

  for (const stop of stops) {
    const reservation = (reservations ?? []).find(r => r.stopCity === stop.city)

    if (reservation) {
      calendar.createEvent({
        start: new Date(reservation.checkIn),
        end: new Date(reservation.checkOut),
        summary: `🏨 ${reservation.hotelName} — ${stop.city}`,
        description: [
          `${reservation.hotelName}`,
          `${stop.city}, ${stop.state}`,
          `Check-in: ${reservation.checkIn}`,
          `Check-out: ${reservation.checkOut}`,
          `${reservation.nights} night${reservation.nights !== 1 ? 's' : ''}`,
          `Total: ${reservation.currency} ${reservation.totalPrice}`,
          reservation.cancellationPolicy ? `Cancellation: ${reservation.cancellationPolicy}` : '',
        ].filter(Boolean).join('\n'),
        location: `${stop.city}, ${stop.state}`,
      })
    } else {
      calendar.createEvent({
        start: new Date(stop.checkIn),
        end: new Date(stop.checkOut),
        summary: `📍 ${stop.city}, ${stop.state}`,
        description: `Stop: ${stop.city}, ${stop.state}`,
        location: `${stop.city}, ${stop.state}`,
      })
    }
  }

  const icsContent = calendar.toString()

  return new Response(icsContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="road-trip.ics"',
    },
  })
}
