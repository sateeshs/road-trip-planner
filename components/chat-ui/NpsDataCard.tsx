'use client'

interface NpsEntrance { title: string; cost: string; description: string }
interface NpsCampground {
  name: string
  description?: string
  coordinates?: { lat: number; lng: number }
  sites: { total: number; electricHookups: number; tentOnly: number; rvSites: number }
  hasElectricHookup: boolean
  fees: Array<{ title: string; cost: string }>
  reservationUrl?: string
  wheelchairAccess?: string
}
interface NpsActivity {
  title: string
  description?: string
  url?: string
  duration?: string
  difficulty?: string
  reservationRequired?: boolean
  feesApply?: boolean
  feeDescription?: string
  wheelchairAccessible?: boolean
}
interface NpsAlert { title: string; description: string; category: string; url?: string }
interface NpsParkInfo {
  name: string
  description?: string
  url?: string
  coordinates?: { lat: number; lng: number }
  entranceFees: NpsEntrance[]
  activities: string[]
  weatherInfo?: string
}

interface NpsResult {
  park?: NpsParkInfo
  alerts?: NpsAlert[]
  campgrounds?: NpsCampground[]
  thingsToDo?: NpsActivity[]
  parkCode?: string
  error?: string
}

interface Props {
  result: NpsResult
}

export default function NpsDataCard({ result }: Props) {
  if (result.error) {
    return (
      <div className="my-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        ⚠️ NPS data unavailable: {result.error}
      </div>
    )
  }

  const { park, alerts = [], campgrounds = [], thingsToDo = [] } = result
  if (!park) return null

  const primaryFee = park.entranceFees.find(f =>
    f.title.toLowerCase().includes('per vehicle') || f.title.toLowerCase().includes('entrance')
  ) ?? park.entranceFees[0]

  const closureAlerts = alerts.filter(a => a.category === 'Park Closure')
  const otherAlerts = alerts.filter(a => a.category !== 'Park Closure')

  return (
    <div className="my-2 rounded-xl border border-green-200 bg-green-50 overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-start gap-3 bg-green-700 px-4 py-3">
        <span className="text-2xl">🏕️</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white leading-tight">{park.name}</div>
          {primaryFee && (
            <div className="text-green-200 text-xs mt-0.5">
              Entrance: <span className="font-medium text-white">{primaryFee.cost}</span> per vehicle
            </div>
          )}
          {park.url && (
            <a
              href={park.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-300 text-xs hover:text-white underline mt-0.5 inline-block"
            >
              nps.gov →
            </a>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Active Closures */}
        {closureAlerts.length > 0 && (
          <div className="space-y-1">
            {closureAlerts.map((a, i) => (
              <div key={i} className="flex gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <span className="text-red-500 shrink-0">🚫</span>
                <div>
                  <div className="font-medium text-red-800 text-xs">{a.title}</div>
                  <div className="text-red-700 text-xs mt-0.5 line-clamp-2">{a.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Other Alerts */}
        {otherAlerts.length > 0 && (
          <div className="space-y-1">
            {otherAlerts.slice(0, 2).map((a, i) => (
              <div key={i} className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="text-amber-500 shrink-0">⚠️</span>
                <div>
                  <div className="font-medium text-amber-800 text-xs">{a.title}</div>
                  <div className="text-amber-700 text-xs mt-0.5 line-clamp-2">{a.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Things To Do */}
        {thingsToDo.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-1.5">
              Top Activities
            </div>
            <div className="space-y-1.5">
              {thingsToDo.slice(0, 5).map((t, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-green-600 shrink-0 mt-0.5">🥾</span>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 text-xs leading-tight">
                      {t.url ? (
                        <a href={t.url} target="_blank" rel="noopener noreferrer" className="hover:text-green-700 underline">
                          {t.title}
                        </a>
                      ) : t.title}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {t.duration && (
                        <span className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5">
                          ⏱ {t.duration}
                        </span>
                      )}
                      {t.difficulty && (
                        <span className={`text-[10px] rounded px-1.5 py-0.5 ${
                          t.difficulty.toLowerCase().includes('easy')
                            ? 'bg-blue-100 text-blue-700'
                            : t.difficulty.toLowerCase().includes('strenuous') || t.difficulty.toLowerCase().includes('hard')
                            ? 'bg-red-100 text-red-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {t.difficulty}
                        </span>
                      )}
                      {t.wheelchairAccessible && (
                        <span className="text-[10px] bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">♿ Accessible</span>
                      )}
                      {t.reservationRequired && (
                        <span className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">📅 Reservation req.</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Campgrounds */}
        {campgrounds.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-1.5">
              Campgrounds ({campgrounds.length})
            </div>
            <div className="space-y-2">
              {campgrounds.slice(0, 3).map((c, i) => (
                <div key={i} className="bg-white border border-green-100 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-gray-800 text-xs leading-tight">{c.name}</div>
                    {c.hasElectricHookup && (
                      <span className="text-[10px] bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5 shrink-0">⚡ Electric</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-gray-500">
                    {c.sites.total > 0 && <span>{c.sites.total} total sites</span>}
                    {c.sites.tentOnly > 0 && <span>⛺ {c.sites.tentOnly} tent</span>}
                    {c.sites.rvSites > 0 && <span>🚐 {c.sites.rvSites} RV</span>}
                    {c.fees.length > 0 && <span>💵 {c.fees[0].cost}/night</span>}
                  </div>
                  {c.reservationUrl && (
                    <a
                      href={c.reservationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-600 hover:text-blue-800 underline mt-1 inline-block"
                    >
                      Book at recreation.gov →
                    </a>
                  )}
                </div>
              ))}
              {campgrounds.length > 3 && (
                <div className="text-xs text-gray-500">+{campgrounds.length - 3} more campgrounds on nps.gov</div>
              )}
            </div>
          </div>
        )}

        {/* Weather */}
        {park.weatherInfo && (
          <div>
            <div className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-1">
              Weather
            </div>
            <p className="text-xs text-gray-700 leading-relaxed line-clamp-4">{park.weatherInfo}</p>
          </div>
        )}

        {/* Entrance Fees Detail */}
        {park.entranceFees.length > 1 && (
          <div>
            <div className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-1">
              Fee Options
            </div>
            <div className="space-y-0.5">
              {park.entranceFees.slice(0, 4).map((f, i) => (
                <div key={i} className="flex justify-between text-xs text-gray-700">
                  <span className="text-gray-500">{f.title}</span>
                  <span className="font-medium">{f.cost}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
