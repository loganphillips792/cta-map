import { useEffect, useState } from 'react'
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet'
import {
  MapContainer,
  Marker,
  Popup,
  Rectangle,
  TileLayer,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { PanelLeftOpen } from 'lucide-react'
import SideMenu, { type DisplayToggleId, type DisplayToggleState } from '../components/SideMenu'

const chicago = { lat: 41.8781, lng: -87.6298 }
const chicagoBounds: LatLngBoundsExpression = [
  [41.64, -87.95],
  [42.05, -87.45],
]

const ChicagoBoundsLock = () => {
  const map = useMap()

  useEffect(() => {
    map.fitBounds(chicagoBounds)
    map.setMaxBounds(chicagoBounds)
    map.setMinZoom(map.getBoundsZoom(chicagoBounds, true))
  }, [map])

  return null
}

const UserLocationMarker = ({ position }: { position: LatLngTuple }) => {
  const map = useMap()

  useEffect(() => {
    map.flyTo(position, Math.max(map.getZoom(), 14), { animate: true })
  }, [map, position])

  return (
    <Marker position={position}>
      <Popup>You are here</Popup>
    </Marker>
  )
}

const defaultToggleState: DisplayToggleState = {
  location: false,
  allRoutes: true,
  favoriteRoutes: false,
}

const TOGGLES_STORAGE_KEY = 'cta-map-display-toggles'

const MapPage = () => {
  const [userPosition, setUserPosition] = useState<LatLngTuple | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(true)
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

  const handleDisplayToggleChange = (id: DisplayToggleId) => {
    setDisplayToggles((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <main className="map-page">
      <div className={`map-page__sidebar ${isMenuOpen ? 'is-open' : ''}`}>
        <SideMenu
          isOpen={isMenuOpen}
          onToggle={() => setIsMenuOpen((prev) => !prev)}
          displayToggles={displayToggles}
          onDisplayToggleChange={handleDisplayToggleChange}
        />
      </div>
      <div className="map-page__map-wrapper">
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
          center={chicago}
          zoom={12}
          maxZoom={18}
          className="map-page__map"
          scrollWheelZoom
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
          {userPosition && displayToggles.location && <UserLocationMarker position={userPosition} />}
        </MapContainer>
      </div>
    </main>
  )
}

export default MapPage
