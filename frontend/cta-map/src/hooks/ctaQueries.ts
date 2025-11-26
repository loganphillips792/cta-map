import { useQuery } from '@tanstack/react-query'
import { fetchRoutes, fetchVehicles, fetchAllVehicles, type ApiRoute, type ApiVehicle } from '../api/cta'

export const useRoutesQuery = () =>
  useQuery<ApiRoute[]>({
    queryKey: ['routes'],
    queryFn: fetchRoutes,
    staleTime: 5 * 60 * 1000,
  })

export const useVehiclesQuery = (routeIds: string[]) => {
  const normalized = [...routeIds].map((rt) => rt.trim()).filter(Boolean).sort()
  return useQuery<ApiVehicle[]>({
    queryKey: ['vehicles', normalized],
    queryFn: () => fetchVehicles(normalized),
    enabled: normalized.length > 0,
    refetchInterval: 15000,
    staleTime: 10 * 1000,
  })
}

export const useAllVehiclesQuery = () =>
  useQuery<ApiVehicle[]>({
    queryKey: ['allVehicles'],
    queryFn: fetchAllVehicles,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  })
