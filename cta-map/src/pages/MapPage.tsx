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

const MapPage = () => {
  const [userPosition, setUserPosition] = useState<LatLngTuple | null>(null)

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

  return (
    <main className="map-page">
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
        {userPosition && <UserLocationMarker position={userPosition} />}
      </MapContainer>
    </main>
  )
}

export default MapPage
