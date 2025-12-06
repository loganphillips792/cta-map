import { kml as kmlToGeoJSON } from "@tmcw/togeojson";
import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString } from "geojson";
import JSZip from "jszip";
import L, { type LatLngBoundsExpression, type LatLngTuple, type Map as LeafletMap } from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import { Navigation, PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Marker, Popup, Rectangle, TileLayer, useMap } from "react-leaflet";
import SideMenu, { type DisplayToggleId, type DisplayToggleState, type RouteListItem } from "../components/SideMenu";

import { ACTIVE_ROUTES_STORAGE_KEY, FAVORITES_STORAGE_KEY, TOGGLES_STORAGE_KEY } from "../constants/storageKeys";
import { useConfigQuery, useRoutesQuery, useVehiclesQuery } from "../hooks/ctaQueries";

// Fix Leaflet default marker icons not loading with bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
});

const chicago = { lat: 41.8781, lng: -87.6298 };
const chicagoBounds: LatLngBoundsExpression = [
    [41.64, -87.95],
    [42.05, -87.45],
];


const ChicagoBoundsLock = () => {
    const map = useMap();
    const hasInitialized = useRef(false);

    useEffect(() => {
        if (hasInitialized.current) return;
        map.setMaxBounds(chicagoBounds);
        map.setMinZoom(map.getBoundsZoom(chicagoBounds, true));
        hasInitialized.current = true;
    }, [map]);

    return null;
};

const UserLocationMarker = ({ position }: { position: LatLngTuple }) => {
    return (
        <Marker position={position}>
            <Popup>You are here</Popup>
        </Marker>
    );
};

type BusRouteFeatureCollection = FeatureCollection<LineString | MultiLineString>;

type RouteListItemWithColor = RouteListItem & { color?: string | null };

const busRoutesKmzUrl = new URL("../../data/CTA_BusRoutes.kmz", import.meta.url).href;

const defaultToggleState: DisplayToggleState = {
    location: false,
    allRoutes: true,
    favoriteRoutes: false,
};

const defaultFavoriteRoutes = ["151"];

const getStoredRouteIds = (key: string, fallback: string[] = []) => {
    if (typeof window === "undefined") return fallback;
    try {
        const stored = window.localStorage.getItem(key);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                return parsed.filter((value): value is string => typeof value === "string");
            }
        }
    } catch {
        // ignore parsing issues and return fallback
    }
    return fallback;
};

const normalizeRouteId = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
};

const getRouteIdFromFeature = (feature: Feature<Geometry | null>): string | null => {
    const props = feature.properties as Record<string, unknown> | null | undefined;
    if (!props) return null;
    const candidates = [props.routeId, props.name, props.ROUTE, props.route];
    for (const candidate of candidates) {
        const normalized = normalizeRouteId(candidate);
        if (normalized) return normalized;
    }
    return null;
};

const routeNameCellRegex = /<td>\s*NAME\s*<\/td>\s*<td>(.*?)<\/td>/i;

const stripHtmlTags = (value: string) => value.replace(/<[^>]*>/g, "");

const decodeHtmlEntities = (value: string) => {
    if (typeof window === "undefined" || typeof document === "undefined") return value;
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
};

const extractRouteNamesFromKml = (kmlDom: Document) => {
    const lookup = new Map<string, string>();
    const placemarks = Array.from(kmlDom.getElementsByTagName("Placemark"));

    placemarks.forEach((placemark) => {
        const id = placemark.getElementsByTagName("name")[0]?.textContent?.trim();
        if (!id) return;
        const description = placemark.getElementsByTagName("description")[0]?.textContent ?? "";
        const match = description.match(routeNameCellRegex);
        if (!match?.[1]) return;
        const cleaned = stripHtmlTags(match[1]).trim();
        if (!cleaned) return;
        lookup.set(id, decodeHtmlEntities(cleaned));
    });

    return lookup;
};

const makeRouteColorFromApi = (routeId: string, routes: RouteListItemWithColor[]) => {
    const match = routes.find((r) => r.id === routeId);
    return match?.color ?? "#2e7d32";
};

const MapPage = () => {
    const configQuery = useConfigQuery();
    const jawgAccessToken = configQuery.data?.jawgAccessToken;
    const [userPosition, setUserPosition] = useState<LatLngTuple | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(true);
    const mapRef = useRef<LeafletMap | null>(null);
    const [displayToggles, setDisplayToggles] = useState<DisplayToggleState>(() => {
        if (typeof window === "undefined") return defaultToggleState;
        try {
            const stored = window.localStorage.getItem(TOGGLES_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as Partial<DisplayToggleState>;
                return { ...defaultToggleState, ...parsed }; //shallow merging, it allows you to effortlessly combine the properties of two or more objects into a new one. If any properties overlap, the last object’s values take precedence, seamlessly overwriting previous entries
            }
        } catch {
            // ignore parse errors and fall back to defaults
        }
        return defaultToggleState;
    });
    const [favoriteRouteIds, setFavoriteRouteIds] = useState<string[]>(() =>
        getStoredRouteIds(FAVORITES_STORAGE_KEY, defaultFavoriteRoutes),
    );
    const [activeRouteIds, setActiveRouteIds] = useState<string[]>(() => getStoredRouteIds(ACTIVE_ROUTES_STORAGE_KEY));
    const routesQuery = useRoutesQuery();
    const vehiclesQuery = useVehiclesQuery(activeRouteIds);

    type RouteId = string;
    type RouteColor = string;
    type RouteColorMap = Record<RouteId, RouteColor>;

    const [routeColors, setRouteColors] = useState<RouteColorMap>({});
    const [busRoutesData, setBusRoutesData] = useState<BusRouteFeatureCollection | null>(null);
    const [isLoadingRouteShapes, setIsLoadingRouteShapes] = useState(false);
    const [routeShapesError, setRouteShapesError] = useState<string | null>(null);
    const routeShapesRequestId = useRef(0);
    const vehicles = vehiclesQuery.data ?? [];
    const routeListError = routesQuery.error instanceof Error ? routesQuery.error.message : null;
    const vehiclesError = vehiclesQuery.error instanceof Error ? vehiclesQuery.error.message : null;

    useEffect(() => {
        if (!navigator.geolocation || !displayToggles.location) {
            return;
        }

        const handleSuccess = (position: GeolocationPosition) => {
            const { latitude, longitude } = position.coords;
            setUserPosition([latitude, longitude]);
        };

        const watchId = navigator.geolocation.watchPosition(handleSuccess, undefined, {
            enableHighAccuracy: true,
            maximumAge: 30_000,
        });

        return () => navigator.geolocation.clearWatch(watchId);
    }, [displayToggles.location]);

    useEffect(() => {
        window.localStorage.setItem(TOGGLES_STORAGE_KEY, JSON.stringify(displayToggles));
    }, [displayToggles]);

    useEffect(() => {
        window.localStorage.setItem(ACTIVE_ROUTES_STORAGE_KEY, JSON.stringify(activeRouteIds));
    }, [activeRouteIds]);

    const handleDisplayToggleChange = (id: DisplayToggleId) => {
        setDisplayToggles((prev) => {
            const next = { ...prev, [id]: !prev[id] };
            if (id === "allRoutes" && next.allRoutes) {
                next.favoriteRoutes = false;
            } else if (id === "favoriteRoutes" && next.favoriteRoutes) {
                next.allRoutes = false;
            }
            return next;
        });
    };

    const handleFavoritesChange = useCallback((ids: string[]) => {
        setFavoriteRouteIds(ids);
    }, []);

    const { location, allRoutes, favoriteRoutes } = displayToggles;
    const shouldRenderAllRoutes = allRoutes && !favoriteRoutes;
    const toggleActiveRoute = useCallback((routeId: string) => {
        setActiveRouteIds((prev) => {
            const next = prev.includes(routeId) ? prev.filter((id) => id !== routeId) : [...prev, routeId];
            return Array.from(new Set(next));
        });
    }, []);

    const handleCenterOnUser = () => {
        if (!mapRef.current || !location || !userPosition) return;
        mapRef.current.flyTo(userPosition, Math.max(mapRef.current.getZoom(), 14), { animate: true });
    };

    useEffect(() => {
        if (!allRoutes && !favoriteRoutes && activeRouteIds.length === 0) return;
        if (busRoutesData) return;

        const abortController = new AbortController();
        const requestId = routeShapesRequestId.current + 1;
        routeShapesRequestId.current = requestId;

        const loadRoutes = async () => {
            setRouteShapesError(null);
            setIsLoadingRouteShapes(true);
            try {
                const response = await fetch(busRoutesKmzUrl, { signal: abortController.signal });
                if (!response.ok) throw new Error("Failed to download CTA routes");
                const kmzBuffer = await response.arrayBuffer();
                const zip = await JSZip.loadAsync(kmzBuffer);
                const kmlFile = zip.file("doc.kml") ?? (zip.file(/\.kml$/i) as JSZip.JSZipObject[] | undefined)?.[0];
                if (!kmlFile) throw new Error("CTA routes file is missing KML data");
                const kmlText = await kmlFile.async("text");
                const domParser = new DOMParser();
                const kmlDom = domParser.parseFromString(kmlText, "application/xml");
                const routeNameLookup = extractRouteNamesFromKml(kmlDom);
                const geoJson = kmlToGeoJSON(kmlDom, { skipNullGeometry: true }) as BusRouteFeatureCollection;
                const enrichedGeoJson: BusRouteFeatureCollection = {
                    ...geoJson,
                    features: geoJson.features.map((feature) => {
                        const id = getRouteIdFromFeature(feature);
                        const friendlyName = id ? routeNameLookup.get(id) : null;
                        if (friendlyName) {
                            return {
                                ...feature,
                                properties: { ...(feature.properties ?? {}), routeName: friendlyName, routeId: id },
                            };
                        }
                        if (id) {
                            return {
                                ...feature,
                                properties: { ...(feature.properties ?? {}), routeId: id },
                            };
                        }
                        return feature;
                    }),
                };
                if (!abortController.signal.aborted && routeShapesRequestId.current === requestId) {
                    setBusRoutesData(enrichedGeoJson);
                }
            } catch (error) {
                if (abortController.signal.aborted) return;
                console.error("Failed to load CTA bus routes", error);
                setRouteShapesError("Unable to load CTA bus routes right now.");
            } finally {
                if (!abortController.signal.aborted && routeShapesRequestId.current === requestId) {
                    setIsLoadingRouteShapes(false);
                }
            }
        };

        loadRoutes();

        return () => {
            abortController.abort();
        };
    }, [activeRouteIds.length, allRoutes, favoriteRoutes, busRoutesData]);

    const routeSummaries = useMemo<RouteListItemWithColor[]>(() => {
        const apiRoutes = routesQuery.data ?? [];
        if (apiRoutes.length === 0) return [];

        return apiRoutes
            .map((route) => ({
                id: route.routeNumber,
                name: route.routeName ? `${route.routeNumber} - ${route.routeName}` : route.routeNumber,
                color: route.routeColor,
            }))
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }, [routesQuery.data]);

    const favoriteRouteSet = useMemo(() => new Set(favoriteRouteIds), [favoriteRouteIds]);
    const activeRouteSet = useMemo(() => new Set(activeRouteIds), [activeRouteIds]);

    const favoriteRoutesGeoJson = useMemo(() => {
        if (!busRoutesData || favoriteRouteSet.size === 0) return null;
        const features = busRoutesData.features.filter((feature) => {
            const routeId = getRouteIdFromFeature(feature);
            return routeId ? favoriteRouteSet.has(routeId) : false;
        });
        if (features.length === 0) return null;
        return {
            type: "FeatureCollection",
            features,
        } as BusRouteFeatureCollection;
    }, [busRoutesData, favoriteRouteSet]);

    // Using this string as a key forces the Leaflet GeoJSON layer to remount whenever the favorites selection changes, ensuring all chosen routes render
    const favoriteRoutesLayerKey = useMemo(() => {
        if (favoriteRouteIds.length === 0) return "none";
        return [...favoriteRouteIds].sort().join("|");
    }, [favoriteRouteIds]);

    const totalLoadedRoutes = routeSummaries.length > 0 ? routeSummaries.length : null;

    const activeRouteCollections = useMemo(() => {
        if (!busRoutesData || activeRouteSet.size === 0) return [];
        const grouped = new Map<string, Feature<LineString | MultiLineString | null>[]>();
        busRoutesData.features.forEach((feature) => {
            const routeId = getRouteIdFromFeature(feature);
            if (!routeId || !activeRouteSet.has(routeId)) return;
            if (!grouped.has(routeId)) grouped.set(routeId, []);
            grouped.get(routeId)?.push(feature);
        });
        return Array.from(grouped.entries()).map(([routeId, features]) => ({
            routeId,
            data: {
                type: "FeatureCollection",
                features,
            } as BusRouteFeatureCollection,
        }));
    }, [activeRouteSet, busRoutesData]);

    useEffect(() => {
        setRouteColors((prev) => {
            const next = { ...prev };
            let changed = false;
            const activeSet = new Set(activeRouteIds);
            activeRouteIds.forEach((id) => {
                if (!next[id]) {
                    next[id] = makeRouteColorFromApi(id, routeSummaries);
                    changed = true;
                }
            });
            Object.keys(next).forEach((id) => {
                if (!activeSet.has(id)) {
                    delete next[id];
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [activeRouteIds, routeSummaries]);

    const getVehicleIcon = useCallback(
        (routeId: string, heading: string) => {
            const numericHeading = Number(heading);
            const headingValue = Number.isFinite(numericHeading) ? numericHeading : 0;
            const color = routeColors[routeId] ?? "#1e88e5";

            return L.divIcon({
                className: "vehicle-icon",
                html: `<div class="vehicle-icon__circle" style="background:${color};--heading:${headingValue}deg">
                <span class="vehicle-icon__arrow">▲</span>
               </div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            });
        },
        [routeColors],
    );

    // Keep map position unless user explicitly chooses to center; avoid auto-flying on every selection change.

    return (
        <main className="map-page">
            <div className={`map-page__sidebar ${isMenuOpen ? "is-open" : ""}`}>
                <SideMenu
                    isOpen={isMenuOpen}
                    onToggle={() => setIsMenuOpen((prev) => !prev)}
                    displayToggles={displayToggles}
                    onDisplayToggleChange={handleDisplayToggleChange}
                    onFavoritesChange={handleFavoritesChange}
                    activeRouteIds={activeRouteIds}
                    onActiveRouteToggle={toggleActiveRoute}
                    onClearActiveRoutes={() => {
                        setActiveRouteIds([]);
                        setRouteColors({});
                    }}
                    routes={routeSummaries}
                    allRoutesCount={totalLoadedRoutes}
                />
            </div>
            <div className="map-page__map-wrapper">
                {(isLoadingRouteShapes || routesQuery.isLoading) && (allRoutes || favoriteRoutes) && (
                    <div className="map-page__status">Loading CTA routes…</div>
                )}
                {routeListError && <div className="map-page__status map-page__status--error">{routeListError}</div>}
                {routeShapesError && <div className="map-page__status map-page__status--error">{routeShapesError}</div>}
                {vehiclesError && activeRouteIds.length > 0 && (
                    <div className="map-page__status map-page__status--error">{vehiclesError}</div>
                )}
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
                        attribution={
                            jawgAccessToken
                                ? '<a href="https://jawg.io" title="Tiles Courtesy of Jawg Maps" target="_blank">&copy; <b>Jawg</b>Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        }
                        url={
                            jawgAccessToken
                                ? `https://tile.jawg.io/jawg-streets/{z}/{x}/{y}{r}.png?access-token=${jawgAccessToken}`
                                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        }
                        minZoom={0}
                        maxZoom={22}
                    />
                    <Marker position={chicago}>
                        <Popup>Chicago Transit Authority</Popup>
                    </Marker>
                    <Rectangle
                        bounds={chicagoBounds}
                        pathOptions={{ color: "#ff5722", weight: 2, fillOpacity: 0.05 }}
                    />
                    {userPosition && location && <UserLocationMarker position={userPosition} />}
                    {shouldRenderAllRoutes && busRoutesData && (
                        <GeoJSON
                            key="all-routes"
                            data={busRoutesData}
                            style={{ color: "#0d47a1", weight: 1.5, opacity: 0.7 }}
                        />
                    )}
                    {favoriteRoutes && favoriteRoutesGeoJson && (
                        <GeoJSON
                            // Leaflet GeoJSON layers do not update their data after mount, so change the key
                            // whenever the favorites list changes to force a remount with fresh data.
                            key={`favorite-routes-${favoriteRoutesLayerKey}`}
                            data={favoriteRoutesGeoJson}
                            style={{ color: "#ff9800", weight: 3, opacity: 0.95 }}
                        />
                    )}
                    {activeRouteCollections.map(({ routeId, data }) => (
                        <GeoJSON
                            key={`active-${routeId}`}
                            data={data}
                            style={{
                                color: routeColors[routeId] ?? "#2e7d32",
                                weight: 4,
                                opacity: 0.95,
                                className: `active-route active-route-${routeId}`,
                            }}
                        />
                    ))}
                    {vehicles.map((vehicle) => {
                        const lat = Number(vehicle.latitude);
                        const lon = Number(vehicle.longitude);
                        if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
                        const position: LatLngTuple = [lat, lon];
                        const icon = getVehicleIcon(vehicle.route, vehicle.heading);
                        return (
                            <Marker key={vehicle.vehicleId} position={position} icon={icon}>
                                <Popup>
                                    <strong>Route {vehicle.route}</strong>
                                    <br />
                                    Vehicle: {vehicle.vehicleId}
                                    <br />
                                    Destination: {vehicle.destination || "N/A"}
                                    <br />
                                    Heading: {vehicle.heading || "0"}°
                                    <br />
                                    Updated: {vehicle.timestamp}
                                </Popup>
                            </Marker>
                        );
                    })}
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
    );
};

export default MapPage;
