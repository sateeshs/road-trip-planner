'use client'

import type { RenderUiResult } from '@/types'

interface Props {
  result: RenderUiResult
}

function CardHeader({ icon, title, colorClass }: { icon: string; title: string; colorClass: string }) {
  return (
    <div className={`${colorClass} px-4 py-2.5 flex items-center gap-2`}>
      <span className="text-base">{icon}</span>
      <span className="text-white text-xs font-bold uppercase tracking-widest">{`✨ ${title}`}</span>
    </div>
  )
}

function TripStatsCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="bg-white border border-indigo-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <CardHeader icon="📊" title={title} colorClass="bg-indigo-600" />
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        {data.totalDistance != null && (
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Distance</p>
            <p className="text-sm font-bold text-gray-900">{String(data.totalDistance)}</p>
          </div>
        )}
        {data.totalDuration != null && (
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Drive Time</p>
            <p className="text-sm font-bold text-gray-900">{String(data.totalDuration)}</p>
          </div>
        )}
        {data.stopCount != null && (
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Stops</p>
            <p className="text-sm font-bold text-gray-900">{String(data.stopCount)}</p>
          </div>
        )}
        {data.estimatedCost != null && (
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Est. Cost</p>
            <p className="text-sm font-bold text-gray-900">{String(data.estimatedCost)}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function BookingConfirmedCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  const total = typeof data.totalPrice === 'number' ? `$${data.totalPrice}` : String(data.totalPrice ?? '')
  return (
    <div className="bg-white border border-purple-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <CardHeader icon="✅" title={title} colorClass="bg-purple-600" />
      <div className="px-4 py-3 space-y-1.5">
        {data.hotelName && (
          <p className="text-sm font-bold text-gray-900">{String(data.hotelName)}</p>
        )}
        {(data.checkIn || data.checkOut) && (
          <p className="text-xs text-gray-500">
            {`${String(data.checkIn ?? '')} → ${String(data.checkOut ?? '')}`}
          </p>
        )}
        {data.nights != null && (
          <p className="text-xs text-gray-500">{`${String(data.nights)} nights`}</p>
        )}
        {data.totalPrice != null && (
          <p className="text-sm font-bold text-purple-700">{`${total} total`}</p>
        )}
      </div>
    </div>
  )
}

function DayPlanCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  const activities = Array.isArray(data.activities) ? (data.activities as string[]) : []
  return (
    <div className="bg-white border border-indigo-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <CardHeader icon="📅" title={title} colorClass="bg-indigo-600" />
      <div className="px-4 py-3 space-y-1.5">
        {activities.map((activity, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-[10px] text-indigo-400 font-bold mt-0.5">{`${i + 1}.`}</span>
            <p className="text-sm text-gray-800">{activity}</p>
          </div>
        ))}
        {activities.length === 0 && (
          <p className="text-xs text-gray-400 italic">No activities listed.</p>
        )}
      </div>
    </div>
  )
}

function RouteSummaryCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  const stops = Array.isArray(data.stops) ? (data.stops as string[]) : []
  return (
    <div className="bg-white border border-purple-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <CardHeader icon="🗺️" title={title} colorClass="bg-purple-600" />
      <div className="px-4 py-3 space-y-1.5">
        {data.origin && (
          <p className="text-xs text-gray-500">{`From: ${String(data.origin)}`}</p>
        )}
        {stops.map((stop, i) => (
          <p key={i} className="text-xs text-gray-600 pl-3">{`· ${stop}`}</p>
        ))}
        {data.destination && (
          <p className="text-xs text-gray-500">{`To: ${String(data.destination)}`}</p>
        )}
      </div>
    </div>
  )
}

function HotelComparisonCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  const hotels = Array.isArray(data.hotels)
    ? (data.hotels as Array<Record<string, unknown>>)
    : []
  return (
    <div className="bg-white border border-indigo-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <CardHeader icon="🏨" title={title} colorClass="bg-indigo-600" />
      <div className="px-4 py-3 space-y-2">
        {hotels.map((hotel, i) => (
          <div key={i} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0 last:pb-0">
            <div>
              <p className="text-sm font-semibold text-gray-900">{String(hotel.name ?? '')}</p>
              {hotel.stars != null && (
                <p className="text-[10px] text-yellow-500">{'★'.repeat(Number(hotel.stars))}</p>
              )}
            </div>
            {hotel.price != null && (
              <p className="text-sm font-bold text-indigo-700">{`$${String(hotel.price)}/night`}</p>
            )}
          </div>
        ))}
        {hotels.length === 0 && (
          <pre className="text-[11px] text-gray-600 whitespace-pre-wrap overflow-auto max-h-32">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

function GenericInfoCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden my-2">
      <CardHeader icon="ℹ️" title={title} colorClass="bg-indigo-600" />
      <div className="px-4 py-3">
        <pre className="text-[11px] text-gray-600 whitespace-pre-wrap overflow-auto max-h-32">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  )
}

export default function DynamicUICard({ result }: Props) {
  const { component, title, data } = result

  switch (component) {
    case 'trip_stats':
      return <TripStatsCard title={title} data={data} />
    case 'booking_confirmed':
      return <BookingConfirmedCard title={title} data={data} />
    case 'day_plan':
      return <DayPlanCard title={title} data={data} />
    case 'route_summary':
      return <RouteSummaryCard title={title} data={data} />
    case 'hotel_comparison':
      return <HotelComparisonCard title={title} data={data} />
    default:
      return <GenericInfoCard title={title} data={data} />
  }
}
