const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

// Client configuration from backend
export type ClientConfig = {
    jawgAccessToken?: string;
};

let cachedConfig: ClientConfig | null = null;

export const fetchConfig = async (): Promise<ClientConfig> => {
    if (cachedConfig) {
        return cachedConfig;
    }
    const response = await fetch(`${API_BASE_URL}/config`, {
        method: "GET",
        headers: { Accept: "application/json" },
    });
    if (!response.ok) {
        throw new Error(`Failed to load config (${response.status})`);
    }
    cachedConfig = await response.json();
    return cachedConfig!;
};

export type ApiRoute = {
    routeNumber: string;
    routeName: string;
    routeColor: string;
    rtdd: string;
};

export type ApiVehicle = {
    vehicleId: string;
    timestamp: string;
    latitude: string;
    longitude: string;
    heading: string;
    patternId: string;
    patternDistance: string;
    route: string;
    destination: string;
    delayed: boolean;
    tablockId: string;
    tripId: string;
    originTripNo: string;
    zone: string;
};

const jsonHeaders = { Accept: "application/json" };

export const fetchRoutes = async (): Promise<ApiRoute[]> => {
    const response = await fetch(`${API_BASE_URL}/routes`, {
        method: "GET",
        headers: jsonHeaders,
    });
    if (!response.ok) {
        throw new Error(`Failed to load routes (${response.status})`);
    }
    return response.json();
};

export const fetchVehicles = async (routeIds: string[]): Promise<ApiVehicle[]> => {
    const trimmed = routeIds
        .map((rt) => rt.trim())
        .filter(Boolean)
        .slice(0, 10);
    if (trimmed.length === 0) return [];

    const params = new URLSearchParams({ rt: trimmed.join(",") });
    const response = await fetch(`${API_BASE_URL}/vehicles/locations?${params.toString()}`, {
        method: "GET",
        headers: jsonHeaders,
    });
    if (!response.ok) {
        throw new Error(`Failed to load vehicles (${response.status})`);
    }
    return response.json();
};

export const fetchAllVehicles = async (): Promise<ApiVehicle[]> => {
    const response = await fetch(`${API_BASE_URL}/vehicles/all`, {
        method: "GET",
        headers: jsonHeaders,
    });
    if (!response.ok) {
        throw new Error(`Failed to load all vehicles (${response.status})`);
    }
    return response.json();
};

export type ApiRouteStats = {
    routeNumber: string;
    routeName: string;
    northEastbound: number;
    southWestbound: number;
    totalActive: number;
};

export const fetchRouteStats = async (): Promise<ApiRouteStats[]> => {
    const response = await fetch(`${API_BASE_URL}/routes/stats`, {
        method: "GET",
        headers: jsonHeaders,
    });
    if (!response.ok) {
        throw new Error(`Failed to load route stats (${response.status})`);
    }
    return response.json();
};

// Ridership types
export type YearlyTotal = {
    year: number;
    rides: number;
};

export type MonthlyTotal = {
    year: number;
    month: number;
    rides: number;
};

export const fetchRidershipYears = async (): Promise<number[]> => {
    const response = await fetch(`${API_BASE_URL}/ridership/years`, {
        method: "GET",
        headers: jsonHeaders,
    });
    if (!response.ok) {
        throw new Error(`Failed to load ridership years (${response.status})`);
    }
    return response.json();
};

export const fetchRidershipYearly = async (): Promise<YearlyTotal[]> => {
    const response = await fetch(`${API_BASE_URL}/ridership/yearly`, {
        method: "GET",
        headers: jsonHeaders,
    });
    if (!response.ok) {
        throw new Error(`Failed to load yearly ridership (${response.status})`);
    }
    return response.json();
};

export const fetchRidershipMonthly = async (year: number): Promise<MonthlyTotal[]> => {
    const response = await fetch(`${API_BASE_URL}/ridership/monthly?year=${year}`, {
        method: "GET",
        headers: jsonHeaders,
    });
    if (!response.ok) {
        throw new Error(`Failed to load monthly ridership (${response.status})`);
    }
    return response.json();
};

export type DailyTotal = {
    date: string;
    rides: number;
};

export const fetchRidershipDaily = async (year?: number, month?: number): Promise<DailyTotal[]> => {
    const params = new URLSearchParams();
    if (year !== undefined) params.set("year", String(year));
    if (month !== undefined) params.set("month", String(month));
    const queryString = params.toString();
    const url = queryString ? `${API_BASE_URL}/ridership/daily?${queryString}` : `${API_BASE_URL}/ridership/daily`;

    const response = await fetch(url, {
        method: "GET",
        headers: jsonHeaders,
    });
    if (!response.ok) {
        throw new Error(`Failed to load daily ridership (${response.status})`);
    }
    return response.json();
};
