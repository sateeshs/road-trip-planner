import type { OsmElement } from './overpass-client'
import { overpassQuery } from './overpass-client'
import { resolveCityCoords } from './route-utils'

export interface Attraction {
  id: string
  name: string
  category: string
  address: string
  coordinates: { lat: number; lng: number }
  description?: string
  website?: string
  rating?: number
}

const TOURISM_CATEGORY: Record<string, string> = {
  attraction: 'Attraction', viewpoint: 'Scenic Viewpoint', museum: 'Museum',
  gallery: 'Art Gallery', artwork: 'Public Art', zoo: 'Zoo', aquarium: 'Aquarium',
  theme_park: 'Theme Park', hotel: 'Hotel', motel: 'Motel', hostel: 'Hostel',
  guest_house: 'Guest House', apartment: 'Apartment',
  camp_site: 'Campground', caravan_site: 'RV Park',
}
const AMENITY_CATEGORY: Record<string, string> = {
  theatre: 'Theatre', cinema: 'Cinema', arts_centre: 'Arts Centre',
  place_of_worship: 'Place of Worship', nightclub: 'Nightclub',
}
const LEISURE_CATEGORY: Record<string, string> = {
  park: 'Park', nature_reserve: 'Nature Reserve', garden: 'Garden',
  marina: 'Marina', water_park: 'Water Park', golf_course: 'Golf Course',
}
const HISTORIC_CATEGORY: Record<string, string> = {
  monument: 'Monument', memorial: 'Memorial', castle: 'Castle',
  ruins: 'Ruins', archaeological_site: 'Archaeological Site', battlefield: 'Historic Battlefield',
}
const NATURAL_CATEGORY: Record<string, string> = {
  beach: 'Beach', peak: 'Mountain Peak', waterfall: 'Waterfall',
  hot_spring: 'Hot Spring', cave_entrance: 'Cave',
}

export function osmCategory(tags: Record<string, string>): string {
  return (
    TOURISM_CATEGORY[tags.tourism ?? ''] ??
    AMENITY_CATEGORY[tags.amenity ?? ''] ??
    LEISURE_CATEGORY[tags.leisure ?? ''] ??
    HISTORIC_CATEGORY[tags.historic ?? ''] ??
    NATURAL_CATEGORY[tags.natural ?? ''] ??
    'Attraction'
  )
}

export function osmAddress(tags: Record<string, string>, city: string): string {
  return [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'] ?? city,
    tags['addr:postcode'],
  ].filter(Boolean).join(', ')
}

export async function osmAttractions(city: string, limit: number): Promise<Attraction[]> {
  const coords = await resolveCityCoords(city)
  if (!coords) return []
  const { lat, lng } = coords
  const r = 15000
  const ql = `[out:json][timeout:10];
(
  node["tourism"~"attraction|viewpoint|museum|gallery|artwork|zoo|aquarium|theme_park"](around:${r},${lat},${lng});
  node["historic"~"monument|memorial|castle|ruins|archaeological_site"](around:${r},${lat},${lng});
  node["amenity"~"theatre|cinema|arts_centre"](around:${r},${lat},${lng});
  node["leisure"~"park|nature_reserve|garden"](around:${r},${lat},${lng});
  node["natural"~"beach|peak|waterfall"](around:${r},${lat},${lng});
);
out ${limit * 2};`
  const elements = await overpassQuery(ql)
  const seen = new Set<string>()
  const results: Attraction[] = []
  for (const el of elements) {
    const elLat = el.lat ?? el.center?.lat
    const elLng = el.lon ?? el.center?.lon
    const tags = el.tags ?? {}
    const name = tags.name ?? tags['name:en'] ?? tags.brand
    if (!elLat || !elLng || !name || seen.has(name)) continue
    seen.add(name)
    results.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      category: osmCategory(tags),
      address: osmAddress(tags, city),
      coordinates: { lat: elLat, lng: elLng },
      website: tags.website ?? tags['contact:website'] ?? tags.url,
      description: tags.description,
    })
    if (results.length >= limit) break
  }
  return results
}

export function parseSurroundingsElements(elements: OsmElement[], city: string, limit: number): Attraction[] {
  const seen = new Set<string>()
  const surroundings: Attraction[] = []
  for (const el of elements) {
    const elLat = el.lat ?? el.center?.lat
    const elLng = el.lon ?? el.center?.lon
    const tags = el.tags ?? {}
    const name = tags.name ?? tags['name:en'] ?? tags.brand
    if (!elLat || !elLng || !name || seen.has(name)) continue
    seen.add(name)
    const nameLower = name.toLowerCase()
    const inferredCat =
      tags.tourism === 'attraction' ? (
        /cruise|cruises|boat.?tour|ship|sail|ferry|charter/.test(nameLower) ? 'Boat Tour / Cruise' :
        /kayak|canoe|paddle/.test(nameLower) ? 'Kayaking' :
        /zip.?line|canopy|aerial/.test(nameLower) ? 'Zip Line' :
        /horse|equestri/.test(nameLower) ? 'Horseback Riding' :
        /climb|rappel/.test(nameLower) ? 'Rock Climbing' :
        /raft|tubing|float/.test(nameLower) ? 'Rafting' :
        /waterfall|falls/.test(nameLower) ? 'Waterfall' :
        /hike|trail|scenic/.test(nameLower) ? 'Hiking / Scenic' :
        'Attraction'
      ) : null
    const cat = inferredCat ??
      (tags.amenity === 'boat_rental' ? 'Boat / Kayak Rental' :
      tags.tourism === 'boat_tour' ? 'Boat Tour' :
      tags.tourism === 'camp_site' || tags.leisure === 'camp_site' ? 'Campground' :
      tags.tourism === 'caravan_site' ? 'RV Park' :
      tags.attraction === 'boat_tour' ? 'Boat Tour' :
      tags.attraction === 'scenic_railway' ? 'Scenic Train Ride' :
      tags.attraction === 'zip_line' ? 'Zip Line' :
      tags.attraction === 'gondola_lift' || tags.attraction === 'chair_lift' ? 'Scenic Gondola / Tram' :
      tags.natural === 'waterfall' ? 'Waterfall' :
      tags.natural === 'beach' ? 'Beach' :
      tags.natural === 'peak' ? 'Mountain Peak' :
      tags.sport === 'kayak' || tags.sport === 'kayaking' ? 'Kayaking & Canoeing' :
      tags.sport === 'climbing' ? 'Rock Climbing' :
      tags.sport === 'rafting' ? 'Rafting' :
      tags.sport === 'fishing' ? 'Fishing' :
      tags.sport === 'skiing' ? 'Skiing' :
      tags.sport ? tags.sport.charAt(0).toUpperCase() + tags.sport.slice(1) :
      tags.leisure === 'nature_reserve' ? 'Nature Reserve' :
      tags.leisure === 'marina' ? 'Marina' :
      tags.leisure === 'water_park' ? 'Water Park' :
      tags.leisure ? tags.leisure.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) :
      'Outdoor Activity')
    surroundings.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      category: cat,
      address: osmAddress(tags, city),
      coordinates: { lat: elLat, lng: elLng },
      website: tags.website ?? tags['contact:website'],
    })
    if (surroundings.length >= limit) break
  }
  return surroundings
}

export async function osmSurroundingsQuery(lat: number, lng: number, city: string, limit = 8, qlTimeout = 15): Promise<Attraction[]> {
  const r = 30000
  const ql = `[out:json][timeout:${qlTimeout}];
(
  node["leisure"~"park|nature_reserve|marina|swimming_pool|golf_course|water_park"](around:${r},${lat},${lng});
  node["sport"~"hiking|cycling|kayak|kayaking|canoe|canoeing|climbing|fishing|skiing|swimming|rafting|sailing|windsurfing|rowing"](around:${r},${lat},${lng});
  node["tourism"~"attraction|viewpoint|theme_park|zoo|aquarium"](around:${r},${lat},${lng});
  node["tourism"~"camp_site|caravan_site|boat_tour"](around:${r},${lat},${lng});
  node["amenity"~"boat_rental"](around:${r},${lat},${lng});
  node["natural"~"waterfall|beach|peak|hot_spring|cave_entrance"](around:${r},${lat},${lng});
  node["attraction"~"boat_tour|scenic_railway|zip_line|gondola_lift|chair_lift|waterfall"](around:${r},${lat},${lng});
  node["name"~"cruise|cruises|kayak|canoe|paddle|boat.?tour|raft|zip.?line|scenic.?ride",i](around:${r},${lat},${lng});
);
out ${limit * 2};`
  const elements = await overpassQuery(ql)
  return parseSurroundingsElements(elements, city, limit)
}
