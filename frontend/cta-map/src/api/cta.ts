const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'

export type ApiRoute = {
  routeNumber: string
  routeName: string
  routeColor: string
  rtdd: string
}

export type ApiVehicle = {
  vehicleId: string
  timestamp: string
  latitude: string
  longitude: string
  heading: string
  patternId: string
  patternDistance: string
  route: string
  destination: string
  delayed: boolean
  tablockId: string
  tripId: string
  originTripNo: string
  zone: string
}

const jsonHeaders = { Accept: 'application/json' }

export const fetchRoutes = async (): Promise<ApiRoute[]> => {
  const response = await fetch(`${API_BASE_URL}/routes`, {
    method: 'GET',
    headers: jsonHeaders,
  })
  if (!response.ok) {
    throw new Error(`Failed to load routes (${response.status})`)
  }
  return response.json()
}

export const fetchVehicles = async (routeIds: string[]): Promise<ApiVehicle[]> => {
  const trimmed = routeIds.map((rt) => rt.trim()).filter(Boolean).slice(0, 10)
  if (trimmed.length === 0) return []

  const params = new URLSearchParams({ rt: trimmed.join(',') })
  const response = await fetch(`${API_BASE_URL}/vehicles/locations?${params.toString()}`, {
    method: 'GET',
    headers: jsonHeaders,
  })
  if (!response.ok) {
    throw new Error(`Failed to load vehicles (${response.status})`)
  }
  return response.json()
}

export const fetchAllVehicles = async (): Promise<ApiVehicle[]> => {
  const response = await fetch(`${API_BASE_URL}/vehicles/all`, {
    method: 'GET',
    headers: jsonHeaders,
  })
  if (!response.ok) {
    throw new Error(`Failed to load all vehicles (${response.status})`)
  }
  return response.json()
}

export type ApiRouteStats = {
  routeNumber: string
  routeName: string
  northEastbound: number
  southWestbound: number
  totalActive: number
}

export const fetchRouteStats = async (): Promise<ApiRouteStats[]> => {
  const response = await fetch(`${API_BASE_URL}/routes/stats`, {
    method: 'GET',
    headers: jsonHeaders,
  })
  if (!response.ok) {
    throw new Error(`Failed to load route stats (${response.status})`)
  }
  return response.json()
}
