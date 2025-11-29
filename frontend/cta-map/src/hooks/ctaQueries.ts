import { useQuery } from "@tanstack/react-query";
import {
    fetchAllVehicles,
    fetchRidershipDaily,
    fetchRidershipMonthly,
    fetchRidershipYearly,
    fetchRidershipYears,
    fetchRoutes,
    fetchRouteStats,
    fetchVehicles,
    type ApiRoute,
    type ApiRouteStats,
    type ApiVehicle,
    type DailyTotal,
    type MonthlyTotal,
    type YearlyTotal,
} from "../api/cta";

export const useRoutesQuery = () =>
    useQuery<ApiRoute[]>({
        queryKey: ["routes"],
        queryFn: fetchRoutes,
        staleTime: 5 * 60 * 1000,
    });

export const useVehiclesQuery = (routeIds: string[]) => {
    const normalized = [...routeIds]
        .map((rt) => rt.trim())
        .filter(Boolean)
        .sort();
    return useQuery<ApiVehicle[]>({
        queryKey: ["vehicles", normalized],
        queryFn: () => fetchVehicles(normalized),
        enabled: normalized.length > 0,
        refetchInterval: 15000,
        staleTime: 10 * 1000,
    });
};

export const useAllVehiclesQuery = () =>
    useQuery<ApiVehicle[]>({
        queryKey: ["allVehicles"],
        queryFn: fetchAllVehicles,
        refetchInterval: 5 * 60 * 1000,
        staleTime: 4 * 60 * 1000,
    });

export const useRouteStatsQuery = () =>
    useQuery<ApiRouteStats[]>({
        queryKey: ["routeStats"],
        queryFn: fetchRouteStats,
        refetchInterval: 60 * 1000,
        staleTime: 30 * 1000,
    });

export const useRidershipYearsQuery = () =>
    useQuery<number[]>({
        queryKey: ["ridershipYears"],
        queryFn: fetchRidershipYears,
        staleTime: 24 * 60 * 60 * 1000, // 24 hours - this data rarely changes
    });

export const useRidershipYearlyQuery = () =>
    useQuery<YearlyTotal[]>({
        queryKey: ["ridershipYearly"],
        queryFn: fetchRidershipYearly,
        staleTime: 24 * 60 * 60 * 1000,
    });

export const useRidershipMonthlyQuery = (year: number | null) =>
    useQuery<MonthlyTotal[]>({
        queryKey: ["ridershipMonthly", year],
        queryFn: () => fetchRidershipMonthly(year!),
        enabled: year !== null,
        staleTime: 24 * 60 * 60 * 1000,
    });

export const useRidershipDailyQuery = (year?: number, month?: number) =>
    useQuery<DailyTotal[]>({
        queryKey: ["ridershipDaily", year, month],
        queryFn: () => fetchRidershipDaily(year, month),
        staleTime: 24 * 60 * 60 * 1000,
    });
