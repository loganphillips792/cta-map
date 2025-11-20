import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LatLngBoundsExpression, LatLngTuple, Map as LeafletMap } from 'leaflet'
import {
  MapContainer,
  GeoJSON,
  Marker,
  Popup,
  Rectangle,
  TileLayer,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Navigation, PanelLeftOpen } from 'lucide-react'
import SideMenu, {
  type DisplayToggleId,
  type DisplayToggleState,
  type RouteListItem,
} from '../components/SideMenu'
import JSZip from 'jszip'
import { kml as kmlToGeoJSON } from '@tmcw/togeojson'
import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString } from 'geojson'
import {
  ACTIVE_ROUTES_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  TOGGLES_STORAGE_KEY,
} from '../constants/storageKeys'

const chicago = { lat: 41.8781, lng: -87.6298 }
const chicagoBounds: LatLngBoundsExpression = [
  [41.64, -87.95],
  [42.05, -87.45],
]

const ChicagoBoundsLock = () => {
  const map = useMap()
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (hasInitialized.current) return
    map.setMaxBounds(chicagoBounds)
    map.setMinZoom(map.getBoundsZoom(chicagoBounds, true))
    hasInitialized.current = true
  }, [map])

  return null
}

const UserLocationMarker = ({ position }: { position: LatLngTuple }) => {
  return (
    <Marker position={position}>
      <Popup>You are here</Popup>
    </Marker>
  )
}

type BusRouteFeatureCollection = FeatureCollection<LineString | MultiLineString>

const busRoutesKmzUrl = new URL('../../data/CTA_BusRoutes.kmz', import.meta.url).href

const defaultToggleState: DisplayToggleState = {
  location: false,
  allRoutes: true,
  favoriteRoutes: false,
}

const defaultFavoriteRoutes = ['151']

const getStoredRouteIds = (key: string, fallback: string[] = []) => {
  if (typeof window === 'undefined') return fallback
  try {
    const stored = window.localStorage.getItem(key)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === 'string')
      }
    }
  } catch {
    // ignore parsing issues and return fallback
  }
  return fallback
}

const normalizeRouteId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

const getRouteIdFromFeature = (feature: Feature<Geometry | null>): string | null => {
  const props = feature.properties as Record<string, unknown> | null | undefined
  if (!props) return null
  const candidates = [props.routeId, props.name, props.ROUTE, props.route]
  for (const candidate of candidates) {
    const normalized = normalizeRouteId(candidate)
    if (normalized) return normalized
  }
  return null
}

const routeNameCellRegex = /<td>\s*NAME\s*<\/td>\s*<td>(.*?)<\/td>/i

const stripHtmlTags = (value: string) => value.replace(/<[^>]*>/g, '')

const decodeHtmlEntities = (value: string) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return value
  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}

const getRouteNameFromFeature = (feature: Feature<Geometry | null>): string | null => {
  const props = feature.properties as Record<string, unknown> | null | undefined
  if (!props) return null
  const candidates = [props.routeName, props.NAME, props.title]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  const description = typeof props.description === 'string' ? props.description : null
  if (!description) return null
  const match = description.match(routeNameCellRegex)
  if (!match?.[1]) return null
  const cleaned = stripHtmlTags(match[1]).trim()
  if (!cleaned) return null
  return decodeHtmlEntities(cleaned)
}

const extractRouteNamesFromKml = (kmlDom: Document) => {
  const lookup = new Map<string, string>()
  const placemarks = Array.from(kmlDom.getElementsByTagName('Placemark'))

  placemarks.forEach((placemark) => {
    const id = placemark.getElementsByTagName('name')[0]?.textContent?.trim()
    if (!id) return
    const description = placemark.getElementsByTagName('description')[0]?.textContent ?? ''
    const match = description.match(routeNameCellRegex)
    if (!match?.[1]) return
    const cleaned = stripHtmlTags(match[1]).trim()
    if (!cleaned) return
    lookup.set(id, decodeHtmlEntities(cleaned))
  })

  return lookup
}

const makeRandomRouteColor = () => {
  const hue = Math.floor(Math.random() * 360)
  return `hsl(${hue}, 80%, 55%)`
}

const MapPage = () => {
  const [userPosition, setUserPosition] = useState<LatLngTuple | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(true)
  const mapRef = useRef<LeafletMap | null>(null)
  const [displayToggles, setDisplayToggles] = useState<DisplayToggleState>(() => {
    if (typeof window === 'undefined') return defaultToggleState
    try {
      const stored = window.localStorage.getItem(TOGGLES_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<DisplayToggleState>
        return { ...defaultToggleState, ...parsed } //shallow merging, it allows you to effortlessly combine the properties of two or more objects into a new one. If any properties overlap, the last object’s values take precedence, seamlessly overwriting previous entries
      }
    } catch {
      // ignore parse errors and fall back to defaults
    }
    return defaultToggleState
  })
  const [favoriteRouteIds, setFavoriteRouteIds] = useState<string[]>(() =>
    getStoredRouteIds(FAVORITES_STORAGE_KEY, defaultFavoriteRoutes),
  )
  const [activeRouteIds, setActiveRouteIds] = useState<string[]>(() =>
    getStoredRouteIds(ACTIVE_ROUTES_STORAGE_KEY),
  )

  type RouteId = string
  type RouteColor = string
  type RouteColorMap = Record<RouteId, RouteColor>

  const [routeColors, setRouteColors] = useState<RouteColorMap>({})
  const [busRoutesData, setBusRoutesData] = useState<BusRouteFeatureCollection | null>(null)
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false)
  const [routesError, setRoutesError] = useState<string | null>(null)
  const routesRequestId = useRef(0)

  useEffect(() => {
    if (!navigator.geolocation) {
      return
    }

    const handleSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords
      setUserPosition([latitude, longitude])
    }

    const watchId = navigator.geolocation.watchPosition(handleSuccess, undefined, {
      enableHighAccuracy: true,
      maximumAge: 30_000,
    })

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(TOGGLES_STORAGE_KEY, JSON.stringify(displayToggles))
  }, [displayToggles])

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_ROUTES_STORAGE_KEY, JSON.stringify(activeRouteIds))
  }, [activeRouteIds])

  const handleDisplayToggleChange = (id: DisplayToggleId) => {
    setDisplayToggles((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      if (id === 'allRoutes' && next.allRoutes) {
        next.favoriteRoutes = false
      } else if (id === 'favoriteRoutes' && next.favoriteRoutes) {
        next.allRoutes = false
      }
      return next
    })
  }

  const handleFavoritesChange = useCallback((ids: string[]) => {
    setFavoriteRouteIds(ids)
  }, [])

  const { location, allRoutes, favoriteRoutes } = displayToggles
  const shouldRenderAllRoutes = allRoutes && !favoriteRoutes
  const toggleActiveRoute = useCallback((routeId: string) => {
    setActiveRouteIds((prev) => {
      const next = prev.includes(routeId)
        ? prev.filter((id) => id !== routeId)
        : [...prev, routeId]
      return Array.from(new Set(next))
    })
  }, [])

  const handleCenterOnUser = () => {
    if (!mapRef.current || !location || !userPosition) return
    mapRef.current.flyTo(userPosition, Math.max(mapRef.current.getZoom(), 14), { animate: true })
  }

  useEffect(() => {
    if (!allRoutes && !favoriteRoutes && activeRouteIds.length === 0) return
    if (busRoutesData) return

    const abortController = new AbortController()
    const requestId = routesRequestId.current + 1
    routesRequestId.current = requestId

    const loadRoutes = async () => {
      setRoutesError(null)
      setIsLoadingRoutes(true)
      try {
        const response = await fetch(busRoutesKmzUrl, { signal: abortController.signal })
        if (!response.ok) throw new Error('Failed to download CTA routes')
        const kmzBuffer = await response.arrayBuffer()
        const zip = await JSZip.loadAsync(kmzBuffer)
        const kmlFile =
          zip.file('doc.kml') ?? (zip.file(/\.kml$/i) as JSZip.JSZipObject[] | undefined)?.[0]
        if (!kmlFile) throw new Error('CTA routes file is missing KML data')
        const kmlText = await kmlFile.async('text')
        const domParser = new DOMParser()
        const kmlDom = domParser.parseFromString(kmlText, 'application/xml')
        const routeNameLookup = extractRouteNamesFromKml(kmlDom)
        const geoJson = kmlToGeoJSON(kmlDom, { skipNullGeometry: true }) as BusRouteFeatureCollection
        const enrichedGeoJson: BusRouteFeatureCollection = {
          ...geoJson,
          features: geoJson.features.map((feature) => {
            const id = getRouteIdFromFeature(feature)
            const friendlyName = id ? routeNameLookup.get(id) : null
            if (friendlyName) {
              return {
                ...feature,
                properties: { ...(feature.properties ?? {}), routeName: friendlyName, routeId: id },
              }
            }
            if (id) {
              return {
                ...feature,
                properties: { ...(feature.properties ?? {}), routeId: id },
              }
            }
            return feature
          }),
        }
        if (!abortController.signal.aborted && routesRequestId.current === requestId) {
          setBusRoutesData(enrichedGeoJson)
        }
      } catch (error) {
        if (abortController.signal.aborted) return
        console.error('Failed to load CTA bus routes', error)
        setRoutesError('Unable to load CTA bus routes right now.')
      } finally {
        if (!abortController.signal.aborted && routesRequestId.current === requestId) {
          setIsLoadingRoutes(false)
        }
      }
    }

    loadRoutes()

    return () => {
      abortController.abort()
    }
  }, [activeRouteIds.length, allRoutes, favoriteRoutes, busRoutesData])

  const routeSummaries = useMemo<RouteListItem[]>(() => {
    if (!busRoutesData) return []
    const seen = new Set<string>()
    return busRoutesData.features
      .reduce<RouteListItem[]>((acc, feature) => {
        const id = getRouteIdFromFeature(feature)
        if (!id || seen.has(id)) return acc
        const friendlyName = getRouteNameFromFeature(feature)
        acc.push({
          id,
          name: friendlyName ? `${id} - ${friendlyName}` : id,
        })
        seen.add(id)
        return acc
      }, [])
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  }, [busRoutesData])

  const favoriteRouteSet = useMemo(() => new Set(favoriteRouteIds), [favoriteRouteIds])
  const activeRouteSet = useMemo(() => new Set(activeRouteIds), [activeRouteIds])

  const favoriteRoutesGeoJson = useMemo(() => {
    if (!busRoutesData || favoriteRouteSet.size === 0) return null
    const features = busRoutesData.features.filter((feature) => {
      const routeId = getRouteIdFromFeature(feature)
      return routeId ? favoriteRouteSet.has(routeId) : false
    })
    if (features.length === 0) return null
    return {
      type: 'FeatureCollection',
      features,
    } as BusRouteFeatureCollection
  }, [busRoutesData, favoriteRouteSet])

  // Using this string as a key forces the Leaflet GeoJSON layer to remount whenever the favorites selection changes, ensuring all chosen routes render
  const favoriteRoutesLayerKey = useMemo(() => {
    if (favoriteRouteIds.length === 0) return 'none'
    return [...favoriteRouteIds].sort().join('|')
  }, [favoriteRouteIds])

  const totalLoadedRoutes = routeSummaries.length > 0 ? routeSummaries.length : null

  const activeRouteCollections = useMemo(() => {
    if (!busRoutesData || activeRouteSet.size === 0) return []
    const grouped = new Map<string, Feature<LineString | MultiLineString | null>[]>()
    busRoutesData.features.forEach((feature) => {
      const routeId = getRouteIdFromFeature(feature)
      if (!routeId || !activeRouteSet.has(routeId)) return
      if (!grouped.has(routeId)) grouped.set(routeId, [])
      grouped.get(routeId)?.push(feature)
    })
    return Array.from(grouped.entries()).map(([routeId, features]) => ({
      routeId,
      data: {
        type: 'FeatureCollection',
        features,
      } as BusRouteFeatureCollection,
    }))
  }, [activeRouteSet, busRoutesData])

  useEffect(() => {
    setRouteColors((prev) => {
      const next = { ...prev }
      let changed = false
      const activeSet = new Set(activeRouteIds)
      activeRouteIds.forEach((id) => {
        if (!next[id]) {
          next[id] = makeRandomRouteColor()
          changed = true
        }
      })
      Object.keys(next).forEach((id) => {
        if (!activeSet.has(id)) {
          delete next[id]
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [activeRouteIds])

  // Keep map position unless user explicitly chooses to center; avoid auto-flying on every selection change.

  return (
    <main className="map-page">
      <div className={`map-page__sidebar ${isMenuOpen ? 'is-open' : ''}`}>
        <SideMenu
          isOpen={isMenuOpen}
          onToggle={() => setIsMenuOpen((prev) => !prev)}
          displayToggles={displayToggles}
          onDisplayToggleChange={handleDisplayToggleChange}
          onFavoritesChange={handleFavoritesChange}
          activeRouteIds={activeRouteIds}
          onActiveRouteToggle={toggleActiveRoute}
          onClearActiveRoutes={() => {
            setActiveRouteIds([])
            setRouteColors({})
          }}
          routes={routeSummaries}
          allRoutesCount={totalLoadedRoutes}
        />
      </div>
      <div className="map-page__map-wrapper">
        {isLoadingRoutes && (allRoutes || favoriteRoutes) && (
          <div className="map-page__status">Loading CTA routes…</div>
        )}
        {routesError && <div className="map-page__status map-page__status--error">{routesError}</div>}
        {!isMenuOpen && (
          <button
            type="button"
            className="map-page__menu-toggle"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Open menu"
            title="Open menu"
          >
            <PanelLeftOpen aria-hidden="true" focusable="false" />
          </button>
        )}
        <MapContainer
          ref={mapRef}
          center={chicago}
          zoom={12}
          maxZoom={18}
          className="map-page__map"
          scrollWheelZoom
          zoomControl={false}
        >
          <ChicagoBoundsLock />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={chicago}>
            <Popup>Chicago Transit Authority</Popup>
          </Marker>
          <Rectangle
            bounds={chicagoBounds}
            pathOptions={{ color: '#ff5722', weight: 2, fillOpacity: 0.05 }}
          />
          {userPosition && location && <UserLocationMarker position={userPosition} />}
          {shouldRenderAllRoutes && busRoutesData && (
            <GeoJSON
              key="all-routes"
              data={busRoutesData}
              style={{ color: '#0d47a1', weight: 1.5, opacity: 0.7 }}
            />
          )}
          {favoriteRoutes && favoriteRoutesGeoJson && (
            <GeoJSON
              // Leaflet GeoJSON layers do not update their data after mount, so change the key
              // whenever the favorites list changes to force a remount with fresh data.
              key={`favorite-routes-${favoriteRoutesLayerKey}`}
              data={favoriteRoutesGeoJson}
              style={{ color: '#ff9800', weight: 3, opacity: 0.95 }}
            />
          )}
          {activeRouteCollections.map(({ routeId, data }) => (
            <GeoJSON
              key={`active-${routeId}`}
              data={data}
              style={{ color: routeColors[routeId] ?? '#2e7d32', weight: 4, opacity: 0.95 }}
            />
          ))}
        </MapContainer>
        <button
          type="button"
          className="map-page__locate-button"
          onClick={handleCenterOnUser}
          disabled={!location || !userPosition}
          aria-label="Center map on my location"
          title="Center map on my location"
        >
          <Navigation aria-hidden="true" focusable="false" />
        </button>
      </div>
    </main>
  )
}

export default MapPage
