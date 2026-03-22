import { z } from 'zod';
import {
  buildTrafficRangePayload,
  predictTrafficAdjustedRange,
  resolveVehicleSpecs,
} from '@/lib/planner/range-service';
import type { 
  PlannerAnalyzeRequest, 
  RouteTrafficMetrics, 
  EVRouteAnalysis, 
  EVChargingStation, 
  ChargingStop, 
  EVChargingRecommendation,
  LatLng
} from '@/lib/planner/types';


// --- Constants ---
const MAX_CONGESTION_RATIO = 3;
const MAX_TOMTOM_ALTERNATIVES = 2;
const COORDINATE_REGEX = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
const EARTH_RADIUS_KM = 6371;
const DEFAULT_CHARGING_POWER_KW = 50;
const STATION_PROVIDER_TIMEOUT_MS = 8000;
const STATION_SEARCH_BATCH_SIZE = 4;
const MAX_PARTIAL_CHARGING_SUGGESTIONS = 5;
const MAX_HORIZON_OFFSETS = [-0.2, 0, 0.2];

// --- Schemas ---
const PlannerRequestSchema = z.object({
  origin: z.string().min(3),
  destination: z.string().min(3),
  batteryPercent: z.number().min(0).max(100),
  vehicle: z.object({
    evModel: z.string().min(1),
    battery_capacity_kWh: z.number().min(10).max(250),
    efficiency_wh_per_km: z.number().min(60).max(400),
    torque_nm: z.number().min(50).max(2000),
    top_speed_kmh: z.number().min(60).max(350),
    connectorType: z.string().optional(),
    maxChargingPower_kW: z.number().min(10).max(350).optional().default(DEFAULT_CHARGING_POWER_KW),
  }),
  alternatives: z.boolean().optional(),
});

// --- Types (Local) ---
type RoutingProvider = 'openrouteservice' | 'tomtom';

type ResolvedLocation = LatLng & {
  label: string;
};

type ProviderRoute = {
  summary: string;
  distanceMeters: number;
  durationSeconds: number;
  durationInTrafficSeconds: number;
  polyline: string;
  origin: LatLng;
  destination: LatLng;
};

type OpenRouteServiceRouteResponse = {
  routes?: Array<{
    summary?: { distance?: number; duration?: number };
    geometry?: string;
  }>;
};

type OpenRouteServiceGeocodeResponse = {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
  }>;
};

type TomTomRouteResponse = {
  routes?: Array<{
    summary?: {
      lengthInMeters?: number;
      travelTimeInSeconds?: number;
      noTrafficTravelTimeInSeconds?: number;
      trafficDelayInSeconds?: number;
    };
    legs?: Array<{
      points?: Array<{ latitude: number; longitude: number }>;
    }>;
  }>;
};

type TomTomGeocodeResponse = {
  results?: Array<{
    position?: { lat?: number; lon?: number };
  }>;
};

type NominatimGeocodeResponse = Array<{
  lat?: string;
  lon?: string;
}>;

type OsrmRouteResponse = {
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: string;
  }>;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TomTomSearchResponse = {
  results?: Array<{
    id?: string;
    poi?: { name?: string; categorySet?: Array<{ categoryId?: number }> };
    position?: { lat?: number; lon?: number };
    address?: { freeformAddress?: string };
  }>;
};

// --- Validation ---
export function validatePlannerAnalyzeInput(input: unknown): PlannerAnalyzeRequest {
  return PlannerRequestSchema.parse(input);
}

// --- Math & Geometry Helpers ---
function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const angle =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(angle));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = STATION_PROVIDER_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildRouteDistanceProfile(routePoints: LatLng[]): number[] {
  if (routePoints.length === 0) {
    return [0];
  }

  const profile: number[] = [0];
  for (let i = 1; i < routePoints.length; i += 1) {
    profile.push(profile[i - 1] + haversineKm(routePoints[i - 1], routePoints[i]));
  }
  return profile;
}

function findRoutePointIndexAtDistance(
  routeDistanceProfileKm: number[],
  targetDistanceKm: number
): number {
  if (routeDistanceProfileKm.length <= 1) return 0;

  const clampedTarget = Math.max(
    0,
    Math.min(targetDistanceKm, routeDistanceProfileKm[routeDistanceProfileKm.length - 1])
  );
  for (let i = 1; i < routeDistanceProfileKm.length; i += 1) {
    if (routeDistanceProfileKm[i] >= clampedTarget) {
      return i;
    }
  }
  return routeDistanceProfileKm.length - 1;
}

function findClosestRoutePointIndex(routePoints: LatLng[], target: LatLng): number {
  if (routePoints.length <= 1) return 0;

  let bestIndex = 0;
  let bestDistanceKm = Number.POSITIVE_INFINITY;

  for (let i = 0; i < routePoints.length; i += 1) {
    const distanceKm = haversineKm(routePoints[i], target);
    if (distanceKm < bestDistanceKm) {
      bestDistanceKm = distanceKm;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function getRoutingProvider(): RoutingProvider {
  const provider = (process.env.ROUTING_PROVIDER || 'tomtom').toLowerCase();
  if (provider === 'openrouteservice' || provider === 'tomtom') {
    return provider;
  }
  throw new Error(
    `Invalid ROUTING_PROVIDER "${provider}". Use "openrouteservice" or "tomtom".`
  );
}

function parseCoordinateInput(value: string): LatLng | null {
  const match = value.match(COORDINATE_REGEX);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function encodePolyline(points: LatLng[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let result = '';

  const encodeValue = (value: number): string => {
    let current = value < 0 ? ~(value << 1) : value << 1;
    let output = '';
    while (current >= 0x20) {
      output += String.fromCharCode((0x20 | (current & 0x1f)) + 63);
      current >>= 5;
    }
    output += String.fromCharCode(current + 63);
    return output;
  };

  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);
    const deltaLat = lat - lastLat;
    const deltaLng = lng - lastLng;
    lastLat = lat;
    lastLng = lng;
    result += encodeValue(deltaLat);
    result += encodeValue(deltaLng);
  }

  return result;
}

function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function interpolatePointOnPolyline(polyline: string, ratio: number): LatLng | null {
  const points = decodePolyline(polyline);
  if (points.length < 2) return null;

  const targetIndex = Math.floor((points.length - 1) * ratio);
  return points[targetIndex] || points[points.length - 1];
}

function toRouteTrafficMetrics(routes: ProviderRoute[]): RouteTrafficMetrics[] {
  return routes.map((route, routeIndex) => {
    const distanceKm = route.distanceMeters / 1000;
    const durationInTrafficHours = route.durationInTrafficSeconds / 3600;
    const avgSpeedKmh =
      durationInTrafficHours > 0 ? distanceKm / durationInTrafficHours : 0;
    const congestionRatio =
      route.durationSeconds > 0
        ? Math.min(
            MAX_CONGESTION_RATIO,
            Math.max(
              0,
              (route.durationInTrafficSeconds - route.durationSeconds) /
                route.durationSeconds
            )
          )
        : 0;

    return {
      routeIndex,
      summary: route.summary || `Route ${routeIndex + 1}`,
      polyline: route.polyline,
      distanceMeters: Math.round(route.distanceMeters),
      durationSeconds: Math.round(route.durationSeconds),
      durationInTrafficSeconds: Math.round(route.durationInTrafficSeconds),
      distanceKm: Number(distanceKm.toFixed(2)),
      durationMinutes: Math.round(route.durationSeconds / 60),
      durationInTrafficMinutes: Math.round(route.durationInTrafficSeconds / 60),
      avgSpeedKmh: Number(avgSpeedKmh.toFixed(2)),
      congestionRatio: Number(congestionRatio.toFixed(4)),
      origin: route.origin,
      destination: route.destination,
    };
  });
}

// --- Location Resolution ---
async function resolveLocation(
  raw: string,
  provider: RoutingProvider,
  apiKey: string
): Promise<ResolvedLocation> {
  const parsed = parseCoordinateInput(raw);
  if (parsed) {
    return { ...parsed, label: raw };
  }

  if (provider === 'openrouteservice') {
    const params = new URLSearchParams({
      api_key: apiKey,
      text: raw,
      size: '1',
    });
    const response = await fetch(
      `https://api.openrouteservice.org/geocode/search?${params.toString()}`,
      { method: 'GET', cache: 'no-store' }
    );
    if (!response.ok) {
      throw new Error(
        `OpenRouteService geocode failed for "${raw}" with status ${response.status}`
      );
    }
    const data = (await response.json()) as OpenRouteServiceGeocodeResponse;
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!coords) {
      throw new Error(`Could not geocode location "${raw}" with OpenRouteService`);
    }
    return { lat: coords[1], lng: coords[0], label: raw };
  }

  const response = await fetch(
    `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(raw)}.json?key=${encodeURIComponent(
      apiKey
    )}&limit=1`,
    { method: 'GET', cache: 'no-store' }
  );
  if (!response.ok) {
    throw new Error(`TomTom geocode failed for "${raw}" with status ${response.status}`);
  }
  const data = (await response.json()) as TomTomGeocodeResponse;
  const position = data.results?.[0]?.position;
  if (typeof position?.lat !== 'number' || typeof position?.lon !== 'number') {
    throw new Error(`Could not geocode location "${raw}" with TomTom`);
  }
  return { lat: position.lat, lng: position.lon, label: raw };
}

function createFallbackPolyline(origin: LatLng, destination: LatLng): string {
  return encodePolyline([origin, destination]);
}

async function resolveLocationWithNominatim(raw: string): Promise<ResolvedLocation> {
  const parsed = parseCoordinateInput(raw);
  if (parsed) {
    return { ...parsed, label: raw };
  }

  const params = new URLSearchParams({
    q: raw,
    format: 'jsonv2',
    limit: '1',
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'User-Agent': 'MoveOnEV Planner',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Nominatim geocode failed for "${raw}" with status ${response.status}`);
  }

  const data = (await response.json()) as NominatimGeocodeResponse;
  const match = Array.isArray(data) ? data[0] : undefined;
  const lat = Number(match?.lat);
  const lng = Number(match?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Could not geocode location "${raw}" with Nominatim`);
  }

  return { lat, lng, label: raw };
}

// --- Routing Providers ---
async function fetchOpenRouteServiceMetrics(
  input: PlannerAnalyzeRequest
): Promise<RouteTrafficMetrics[]> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing OPENROUTESERVICE_API_KEY. Add it to your .env.local file.'
    );
  }

  const origin = await resolveLocation(input.origin, 'openrouteservice', apiKey);
  const destination = await resolveLocation(
    input.destination,
    'openrouteservice',
    apiKey
  );

  const requestBody: Record<string, unknown> = {
    coordinates: [
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
    ],
    instructions: false,
  };

  if (input.alternatives) {
    requestBody.alternative_routes = {
      target_count: 2,
      weight_factor: 1.6,
      share_factor: 0.6,
    };
  }

  const response = await fetch(
    'https://api.openrouteservice.org/v2/directions/driving-car/json',
    {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error(
      `OpenRouteService directions failed with status ${response.status}`
    );
  }

  const data = (await response.json()) as OpenRouteServiceRouteResponse;
  const routes = Array.isArray(data.routes) ? data.routes : [];
  if (routes.length === 0) {
    throw new Error('OpenRouteService returned no routes');
  }

  const providerRoutes: ProviderRoute[] = routes.map((route, index) => {
    const distanceMeters = route.summary?.distance ?? haversineKm(origin, destination) * 1000;
    const durationSeconds = route.summary?.duration ?? 0;
    const polyline =
      typeof route.geometry === 'string' && route.geometry.length > 0
        ? route.geometry
        : createFallbackPolyline(origin, destination);

    return {
      summary: `Route ${index + 1} (OpenRouteService)`,
      distanceMeters,
      durationSeconds,
      durationInTrafficSeconds: durationSeconds,
      polyline,
      origin,
      destination,
    };
  });

  return toRouteTrafficMetrics(providerRoutes);
}

async function fetchTomTomMetrics(
  input: PlannerAnalyzeRequest
): Promise<RouteTrafficMetrics[]> {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    throw new Error('Missing TOMTOM_API_KEY. Add it to your .env.local file.');
  }

  const origin = await resolveLocation(input.origin, 'tomtom', apiKey);
  const destination = await resolveLocation(input.destination, 'tomtom', apiKey);
  const maxAlternatives = input.alternatives ? MAX_TOMTOM_ALTERNATIVES : 0;

  const params = new URLSearchParams({
    key: apiKey,
    traffic: 'true',
    travelMode: 'car',
    routeType: 'fastest',
    maxAlternatives: String(maxAlternatives),
    computeTravelTimeFor: 'all',
  });

  const response = await fetch(
    `https://api.tomtom.com/routing/1/calculateRoute/${origin.lat},${origin.lng}:${destination.lat},${destination.lng}/json?${params.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error(`TomTom route lookup failed with status ${response.status}`);
  }

  const data = (await response.json()) as TomTomRouteResponse;
  const routes = Array.isArray(data.routes) ? data.routes : [];
  if (routes.length === 0) {
    throw new Error('TomTom returned no routes');
  }

  const providerRoutes: ProviderRoute[] = routes.map((route, index) => {
    const travelTime = route.summary?.travelTimeInSeconds ?? 0;
    const noTrafficTravelTime = route.summary?.noTrafficTravelTimeInSeconds ?? 0;
    const trafficDelay = route.summary?.trafficDelayInSeconds ?? 0;

    const durationSeconds =
      noTrafficTravelTime > 0 ? noTrafficTravelTime : Math.max(0, travelTime - trafficDelay);
    const durationInTrafficSeconds =
      travelTime > 0 ? travelTime : Math.max(0, durationSeconds + trafficDelay);
    const distanceMeters = route.summary?.lengthInMeters ?? 0;

    const points: LatLng[] =
      route.legs
        ?.flatMap((leg) =>
          leg.points?.map((point) => ({
            lat: point.latitude,
            lng: point.longitude,
          })) || []
        )
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)) ||
      [];

    const firstPoint = points[0] || origin;
    const lastPoint = points[points.length - 1] || destination;
    const polyline =
      points.length > 1
        ? encodePolyline(points)
        : createFallbackPolyline(origin, destination);

    return {
      summary: `Route ${index + 1} (TomTom)`,
      distanceMeters,
      durationSeconds,
      durationInTrafficSeconds,
      polyline,
      origin: firstPoint,
      destination: lastPoint,
    };
  });

  return toRouteTrafficMetrics(providerRoutes);
}

async function fetchOsrmMetrics(
  input: PlannerAnalyzeRequest
): Promise<RouteTrafficMetrics[]> {
  const origin = await resolveLocationWithNominatim(input.origin);
  const destination = await resolveLocationWithNominatim(input.destination);

  const params = new URLSearchParams({
    alternatives: input.alternatives ? 'true' : 'false',
    geometries: 'polyline',
    overview: 'full',
    steps: 'false',
    annotations: 'false',
  });

  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?${params.toString()}`,
    { method: 'GET', cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error(`OSRM route lookup failed with status ${response.status}`);
  }

  const data = (await response.json()) as OsrmRouteResponse;
  const routes = Array.isArray(data.routes) ? data.routes : [];
  if (routes.length === 0) {
    throw new Error('OSRM returned no routes');
  }

  const providerRoutes: ProviderRoute[] = routes.map((route, index) => {
    const distanceMeters = route.distance ?? haversineKm(origin, destination) * 1000;
    const durationSeconds = route.duration ?? 0;
    const polyline =
      typeof route.geometry === 'string' && route.geometry.length > 0
        ? route.geometry
        : createFallbackPolyline(origin, destination);

    return {
      summary: `Route ${index + 1} (OSRM)`,
      distanceMeters,
      durationSeconds,
      durationInTrafficSeconds: durationSeconds,
      polyline,
      origin,
      destination,
    };
  });

  return toRouteTrafficMetrics(providerRoutes);
}

export async function fetchRouteTrafficMetrics(
  input: PlannerAnalyzeRequest
): Promise<RouteTrafficMetrics[]> {
  const primaryProvider = getRoutingProvider();
  const fallbackProvider: RoutingProvider =
    primaryProvider === 'tomtom' ? 'openrouteservice' : 'tomtom';

  const errors: string[] = [];

  try {
    if (primaryProvider === 'tomtom') {
      return await fetchTomTomMetrics(input);
    }
    return await fetchOpenRouteServiceMetrics(input);
  } catch (primaryError) {
    const primaryMessage =
      primaryError instanceof Error ? primaryError.message : 'Unknown error';
    errors.push(`${primaryProvider}: ${primaryMessage}`);
  }

  try {
    if (fallbackProvider === 'tomtom') {
      return await fetchTomTomMetrics(input);
    }
    return await fetchOpenRouteServiceMetrics(input);
  } catch (fallbackError) {
    const fallbackMessage =
      fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
    errors.push(`${fallbackProvider}: ${fallbackMessage}`);
  }

  try {
    return await fetchOsrmMetrics(input);
  } catch (osrmError) {
    const osrmMessage = osrmError instanceof Error ? osrmError.message : 'Unknown error';
    errors.push(`osrm: ${osrmMessage}`);
  }

  throw new Error(`Routing failed across providers. ${errors.join(' | ')}`);
}

// --- EV Charging Station Search ---
async function searchChargingStationsNear(
  location: LatLng,
  radiusKm: number = 10
): Promise<EVChargingStation[]> {
  try {
    console.log(
      `🔍 Searching for charging stations near ${location.lat}, ${location.lng} (radius ${radiusKm} km)`
    );
    const ocmApiKey = process.env.OPENCHARGEMAP_API_KEY;
    const tomtomApiKey = process.env.TOMTOM_API_KEY;
    const googlePlacesKey =
      process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

    const providerSummaries: string[] = [];

    const normalizeStation = (station: EVChargingStation): EVChargingStation => ({
      ...station,
      name: station.name || 'Charging Station',
      connectorTypes: Array.isArray(station.connectorTypes) ? station.connectorTypes : [],
    });

    const stationMergeKey = (station: EVChargingStation): string =>
      `${station.location.lat.toFixed(4)},${station.location.lng.toFixed(4)}:${station.name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()}`;

    const mergeStations = (sources: EVChargingStation[][]): EVChargingStation[] => {
      const merged = new Map<string, EVChargingStation>();
      for (const source of sources) {
        for (const station of source) {
          const normalized = normalizeStation(station);
          const key = stationMergeKey(normalized);
          const existing = merged.get(key);
          if (!existing) {
            merged.set(key, normalized);
            continue;
          }

          const mergedConnectors = Array.from(
            new Set([...(existing.connectorTypes || []), ...(normalized.connectorTypes || [])])
          );

          merged.set(key, {
            ...existing,
            connectorTypes: mergedConnectors,
            power_kW: Math.max(existing.power_kW || 0, normalized.power_kW || 0) || undefined,
            distanceFromRouteMeters: Math.min(
              existing.distanceFromRouteMeters,
              normalized.distanceFromRouteMeters
            ),
          });
        }
      }
      return Array.from(merged.values());
    };

    const fetchFromOpenChargeMap = async (): Promise<EVChargingStation[]> => {
      if (!ocmApiKey) {
        providerSummaries.push('ocm:skipped(no key)');
        return [];
      }
      const startedAt = Date.now();
      const url = `https://api.openchargemap.io/v3/poi/?output=json&latitude=${location.lat}&longitude=${location.lng}&distance=${radiusKm}&distanceunit=KM&maxresults=100&key=${ocmApiKey}`;
      const response = await fetchWithTimeout(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const errorText = await response.text();
        providerSummaries.push(`ocm:error(${response.status})`);
        console.error('❌ OpenChargeMap station fetch failed:', response.status, errorText);
        return [];
      }

      type OpenChargeMapResult = {
        ID?: number;
        AddressInfo?: {
          Title?: string;
          Latitude?: number;
          Longitude?: number;
        };
        Connections?: Array<{
          ConnectionType?: { Title?: string };
          PowerKW?: number | null;
        }>;
      };

      const data = (await response.json()) as OpenChargeMapResult[];
      const stations = data
        .filter(
          (
            station
          ): station is OpenChargeMapResult & {
            AddressInfo: { Latitude: number; Longitude: number };
          } => station.AddressInfo?.Latitude != null && station.AddressInfo?.Longitude != null
        )
        .map((station, index) => {
          const stationLocation: LatLng = {
            lat: station.AddressInfo.Latitude,
            lng: station.AddressInfo.Longitude,
          };
          const connectorTypes =
            station.Connections?.map((connection) => connection.ConnectionType?.Title).filter(
              (title): title is string => Boolean(title)
            ) || [];
          const power_kW = station.Connections
            ?.map((connection) => connection.PowerKW)
            .filter((value): value is number => value != null && value > 0)
            .reduce((max, value) => Math.max(max, value), 0);

          return {
            id: station.ID ? `ocm-${station.ID}` : `ocm-fallback-${index}`,
            name: station.AddressInfo.Title || `Charging Station ${index + 1}`,
            location: stationLocation,
            distanceFromRouteMeters: Math.round(haversineKm(location, stationLocation) * 1000),
            connectorTypes,
            power_kW,
          };
        });
      providerSummaries.push(`ocm:${stations.length} in ${Date.now() - startedAt}ms`);
      return stations;
    };

    const fetchFromTomTom = async (): Promise<EVChargingStation[]> => {
      if (!tomtomApiKey) {
        providerSummaries.push('tomtom:skipped(no key)');
        return [];
      }
      const startedAt = Date.now();
      const params = new URLSearchParams({
        key: tomtomApiKey,
        lat: String(location.lat),
        lon: String(location.lng),
        radius: String(Math.round(radiusKm * 1000)),
        limit: '100',
      });
      const response = await fetchWithTimeout(
        `https://api.tomtom.com/search/2/poiSearch/${encodeURIComponent('ev charging station')}.json?${params.toString()}`,
        { method: 'GET', cache: 'no-store' }
      );
      if (!response.ok) {
        const errorText = await response.text();
        providerSummaries.push(`tomtom:error(${response.status})`);
        console.error('❌ TomTom station fetch failed:', response.status, errorText);
        return [];
      }

      type TomTomPoiResponse = {
        results?: Array<{
          id?: string;
          poi?: { name?: string };
          position?: { lat?: number; lon?: number };
          dist?: number;
        }>;
      };

      const data = (await response.json()) as TomTomPoiResponse;
      const stations = (data.results || [])
        .filter(
          (
            result
          ): result is {
            id?: string;
            poi?: { name?: string };
            position: { lat: number; lon: number };
            dist?: number;
          } => typeof result.position?.lat === 'number' && typeof result.position?.lon === 'number'
        )
        .map((result, index) => ({
          id: result.id ? `tt-${result.id}` : `tt-fallback-${index}-${result.position.lat}`,
          name: result.poi?.name || 'EV Charging Station',
          location: { lat: result.position.lat, lng: result.position.lon },
          distanceFromRouteMeters:
            typeof result.dist === 'number'
              ? Math.round(result.dist)
              : Math.round(
                  haversineKm(location, { lat: result.position.lat, lng: result.position.lon }) * 1000
                ),
          connectorTypes: [],
        }));
      providerSummaries.push(`tomtom:${stations.length} in ${Date.now() - startedAt}ms`);
      return stations;
    };

    const fetchFromGooglePlaces = async (): Promise<EVChargingStation[]> => {
      if (!googlePlacesKey) {
        providerSummaries.push('google:skipped(no key)');
        return [];
      }
      const startedAt = Date.now();
      const radiusMeters = Math.max(1000, Math.min(50000, Math.round(radiusKm * 1000)));
      const params = new URLSearchParams({
        location: `${location.lat},${location.lng}`,
        radius: String(radiusMeters),
        keyword: 'ev charging station',
        key: googlePlacesKey,
      });
      const response = await fetchWithTimeout(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`,
        { method: 'GET', cache: 'no-store' }
      );
      if (!response.ok) {
        const errorText = await response.text();
        providerSummaries.push(`google:error(${response.status})`);
        console.error('❌ Google Places station fetch failed:', response.status, errorText);
        return [];
      }

      type GoogleNearbyResponse = {
        status?: string;
        results?: Array<{
          place_id?: string;
          name?: string;
          geometry?: { location?: { lat?: number; lng?: number } };
        }>;
      };

      const data = (await response.json()) as GoogleNearbyResponse;
      if (!Array.isArray(data.results)) {
        providerSummaries.push(`google:0 in ${Date.now() - startedAt}ms`);
        return [];
      }

      const stations = data.results
        .filter(
          (
            result
          ): result is {
            place_id?: string;
            name?: string;
            geometry: { location: { lat: number; lng: number } };
          } =>
            typeof result.geometry?.location?.lat === 'number' &&
            typeof result.geometry?.location?.lng === 'number'
        )
        .map((result, index) => ({
          id: result.place_id ? `gp-${result.place_id}` : `gp-fallback-${index}`,
          name: result.name || 'EV Charging Station',
          location: {
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
          },
          distanceFromRouteMeters: Math.round(
            haversineKm(location, {
              lat: result.geometry.location.lat,
              lng: result.geometry.location.lng,
            }) * 1000
          ),
          connectorTypes: [],
        }));
      providerSummaries.push(`google:${stations.length} in ${Date.now() - startedAt}ms`);
      return stations;
    };

    const providerResults = await Promise.allSettled([
      fetchFromOpenChargeMap(),
      fetchFromTomTom(),
      fetchFromGooglePlaces(),
    ]);

    providerResults.forEach((result, index) => {
      if (result.status !== 'rejected') return;
      const providerName = ['ocm', 'tomtom', 'google'][index] || `provider-${index + 1}`;
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      providerSummaries.push(`${providerName}:failed(${reason})`);
      console.error(`❌ ${providerName} station lookup failed:`, result.reason);
    });

    const successfulResults = providerResults
      .filter(
        (result): result is PromiseFulfilledResult<EVChargingStation[]> =>
          result.status === 'fulfilled'
      )
      .map((result) => result.value);

    const mergedStations = mergeStations(successfulResults);
    console.log(
      `✅ Aggregated ${mergedStations.length} stations from available providers [${providerSummaries.join(', ')}]`
    );
    return mergedStations;
  } catch (error) {
    console.error('❌ Error searching charging stations:', error);
    return [];
  }
}

// --- Main EV Route Analysis ---
export async function analyzeEVRoute(
  input: PlannerAnalyzeRequest
): Promise<EVRouteAnalysis> {
  console.log('=== Starting EV Route Analysis ===');

  // 1. Fetch route metrics
  const metrics = await fetchRouteTrafficMetrics(input);
  const primaryRoute = metrics[0];
  const distanceKm = primaryRoute.distanceKm;

  // 2. Resolve specs and run ML-driven range prediction
  const resolvedVehicle = await resolveVehicleSpecs(input.vehicle);
  const normalizedInput: PlannerAnalyzeRequest = {
    ...input,
    vehicle: resolvedVehicle,
  };

  const { battery_capacity_kWh, maxChargingPower_kW } = resolvedVehicle;
  const currentBatteryPercent = input.batteryPercent;

  const currentBatteryRange = await predictTrafficAdjustedRange(
    buildTrafficRangePayload(normalizedInput, primaryRoute)
  );
  const fullBatteryRange = await predictTrafficAdjustedRange(
    buildTrafficRangePayload(
      {
        ...normalizedInput,
        batteryPercent: 100,
      },
      primaryRoute
    )
  );

  const maxRangeKm = Math.max(1, fullBatteryRange.trafficAdjustedRangeKm);
  const currentRangeKm = Math.max(0, currentBatteryRange.trafficAdjustedRangeKm);
  const consumptionPerKm = currentBatteryRange.consumptionWhPerKm / 1000;
  const canReachDestination =
    currentBatteryRange.canReachDestination && currentRangeKm >= distanceKm;

  // 3. Initial recommendation (ML-driven)
  const recommendation: EVChargingRecommendation = {
    needed: false,
    chargingStops: [],
    suggestedChargingStops: [],
    arrivalBatteryPercent: canReachDestination
      ? currentBatteryRange.estimatedBatteryLeftPercent
      : currentBatteryPercent,
    targetBatteryPercent: currentBatteryPercent,
    chargingDurationMinutes: 0,
    totalChargingDurationMinutes: 0,
    energyToCharge_kWh: 0,
    totalEnergyToCharge_kWh: 0,
    canReachDestination,
    numberOfStops: 0,
    reason: canReachDestination
      ? 'Sufficient charge to reach destination.'
      : undefined,
  };

  // 4. If current range insufficient, plan charging stops
  if (!recommendation.canReachDestination) {
    recommendation.needed = true;
    recommendation.reason = `Current range (${currentRangeKm.toFixed(1)} km) is less than trip distance (${distanceKm} km).`;

    // Decode polyline
    let routePoints: LatLng[] = [];
    try {
      routePoints = decodePolyline(primaryRoute.polyline);
      console.log(`✅ Decoded ${routePoints.length} route points`);
    } catch (error) {
      console.error('❌ Failed to decode polyline, using fallback:', error);
      routePoints = [primaryRoute.origin, primaryRoute.destination];
    }
    if (routePoints.length < 2) {
      routePoints = [primaryRoute.origin, primaryRoute.destination];
    }

    const routeDistanceProfileKm = buildRouteDistanceProfile(routePoints);
    const profileDistanceKm = routeDistanceProfileKm[routeDistanceProfileKm.length - 1] || 0;
    const effectiveRouteDistanceKm =
      Number.isFinite(profileDistanceKm) && profileDistanceKm > 1 ? profileDistanceKm : distanceKm;
    const TARGET_CHARGE_PERCENT = 100;
    const BATTERY_BUFFER = 5;
    const currentLegReachKm = Math.max(
      40,
      ((Math.max(0, currentBatteryPercent - BATTERY_BUFFER)) / 100) * maxRangeKm
    );
    const fullChargeLegReachKm = Math.max(
      60,
      ((Math.max(0, TARGET_CHARGE_PERCENT - BATTERY_BUFFER)) / 100) * maxRangeKm
    );
    const primarySpacingKm = clampNumber(fullChargeLegReachKm * 0.45, 55, 140);
    const fallbackSpacingKm = clampNumber(fullChargeLegReachKm * 0.3, 35, 95);
    const primarySampleCount = Math.max(
      12,
      Math.min(30, Math.ceil(effectiveRouteDistanceKm / primarySpacingKm))
    );
    const fallbackSampleCount = Math.max(
      primarySampleCount + 6,
      Math.min(60, Math.ceil(effectiveRouteDistanceKm / fallbackSpacingKm))
    );
    const primaryRadii = Array.from(
      new Set([
        Math.round(clampNumber(currentLegReachKm * 0.28, 70, 140)),
        Math.round(clampNumber(fullChargeLegReachKm * 0.55, 120, 240)),
      ])
    );
    const fallbackRadii = Array.from(
      new Set([
        Math.round(clampNumber(fullChargeLegReachKm * 0.45, 100, 200)),
        Math.round(clampNumber(fullChargeLegReachKm * 0.9, 180, 360)),
      ])
    );

    const stationSearchCache = new Map<string, Promise<EVChargingStation[]>>();
    const stationById = new Map<string, EVChargingStation>();
    const stationMetaById = new Map<string, { stationDistanceKm: number; detourKm: number }>();

    const searchChargingStationsCached = async (
      location: LatLng,
      radiusKm: number
    ): Promise<EVChargingStation[]> => {
      const key = `${location.lat.toFixed(3)},${location.lng.toFixed(3)}:${radiusKm}`;
      const cachedPromise = stationSearchCache.get(key);
      if (cachedPromise) return cachedPromise;
      const fetchPromise = searchChargingStationsNear(location, radiusKm).catch((error) => {
        console.error(`❌ Station lookup failed for cache key ${key}:`, error);
        return [];
      });
      stationSearchCache.set(key, fetchPromise);
      return fetchPromise;
    };

    const addStationsToPool = (stations: EVChargingStation[]) => {
      for (const station of stations) {
        if (stationById.has(station.id)) continue;
        stationById.set(station.id, station);
        const nearestRoutePointIndex = findClosestRoutePointIndex(routePoints, station.location);
        const stationDistanceKm = routeDistanceProfileKm[nearestRoutePointIndex] || 0;
        const detourKm = haversineKm(station.location, routePoints[nearestRoutePointIndex]);
        stationMetaById.set(station.id, { stationDistanceKm, detourKm });
      }
    };

    const collectStationsAlongRoute = async (sampleCount: number, radii: number[]) => {
      const samples = Math.max(2, Math.min(sampleCount, Math.max(2, routePoints.length - 1)));
      const tasks: Array<() => Promise<EVChargingStation[]>> = [];
      for (let i = 0; i <= samples; i += 1) {
        const sampledDistanceKm = (effectiveRouteDistanceKm * i) / samples;
        const sampleIndex = findRoutePointIndexAtDistance(routeDistanceProfileKm, sampledDistanceKm);
        const samplePoint = routePoints[sampleIndex] || primaryRoute.origin;
        for (const radiusKm of radii) {
          tasks.push(() => searchChargingStationsCached(samplePoint, radiusKm));
        }
      }

      console.log(
        `🔎 Collecting charging stations across ${tasks.length} route lookups (${samples + 1} samples, radii: ${radii.join(', ')})`
      );

      for (let index = 0; index < tasks.length; index += STATION_SEARCH_BATCH_SIZE) {
        const batch = tasks.slice(index, index + STATION_SEARCH_BATCH_SIZE);
        const results = await Promise.all(batch.map((task) => task()));
        results.forEach(addStationsToPool);
        console.log(
          `⏱️ Station lookup progress: ${Math.min(index + batch.length, tasks.length)}/${tasks.length} lookups, pool=${stationById.size}`
        );
        if (stationById.size >= 180) {
          console.log('✅ Station pool is sufficiently populated; stopping additional lookups early');
          break;
        }
      }
    };

    const collectStationsNearExpectedStops = async (radii: number[]) => {
      const targetDistances: number[] = [];
      const offsetSpreadKm = clampNumber(fullChargeLegReachKm * 0.18, 20, 75);

      let nextTargetKm = currentLegReachKm;
      while (nextTargetKm < effectiveRouteDistanceKm) {
        targetDistances.push(nextTargetKm);
        nextTargetKm += fullChargeLegReachKm;
      }

      if (targetDistances.length === 0) {
        return;
      }

      const tasks: Array<() => Promise<EVChargingStation[]>> = [];
      for (const targetDistanceKm of targetDistances) {
        for (const offsetMultiplier of MAX_HORIZON_OFFSETS) {
          const lookupDistanceKm = clampNumber(
            targetDistanceKm + offsetMultiplier * offsetSpreadKm,
            0,
            effectiveRouteDistanceKm
          );
          const sampleIndex = findRoutePointIndexAtDistance(
            routeDistanceProfileKm,
            lookupDistanceKm
          );
          const samplePoint = routePoints[sampleIndex] || primaryRoute.origin;
          for (const radiusKm of radii) {
            tasks.push(() => searchChargingStationsCached(samplePoint, radiusKm));
          }
        }
      }

      console.log(
        `🧭 Collecting stations near ${targetDistances.length} expected charging horizons (${tasks.length} targeted lookups)`
      );

      for (let index = 0; index < tasks.length; index += STATION_SEARCH_BATCH_SIZE) {
        const batch = tasks.slice(index, index + STATION_SEARCH_BATCH_SIZE);
        const results = await Promise.all(batch.map((task) => task()));
        results.forEach(addStationsToPool);
        if (stationById.size >= 220) {
          console.log('✅ Targeted horizon search gathered enough stations; stopping early');
          break;
        }
      }
    };

    await collectStationsAlongRoute(primarySampleCount, primaryRadii);
    await collectStationsNearExpectedStops(primaryRadii);
    console.log(`Built route-wide station pool with ${stationById.size} stations`);

    type PlannerNode = {
      id: string;
      type: 'start' | 'station' | 'destination';
      distanceKm: number;
      detourKm: number;
      station?: EVChargingStation;
      location: LatLng;
    };
    type StationPlannerNode = PlannerNode & {
      type: 'station';
      station: EVChargingStation;
    };

    const buildNodes = (maxDetourKm?: number): PlannerNode[] => {
      const stationNodes = Array.from(stationById.values())
        .map((station) => {
          const meta = stationMetaById.get(station.id);
          if (!meta) return null;
          if (meta.stationDistanceKm <= 0 || meta.stationDistanceKm >= effectiveRouteDistanceKm) {
            return null;
          }
          if (typeof maxDetourKm === 'number' && meta.detourKm > maxDetourKm) {
            return null;
          }
          return {
            id: station.id,
            type: 'station' as const,
            distanceKm: meta.stationDistanceKm,
            detourKm: meta.detourKm,
            station,
            location: station.location,
          };
        })
        .filter((node): node is StationPlannerNode => node !== null)
        .sort((a, b) => {
          if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
          return a.detourKm - b.detourKm;
        });

      return [
        {
          id: 'start',
          type: 'start',
          distanceKm: 0,
          detourKm: 0,
          location: primaryRoute.origin,
        },
        ...stationNodes,
        {
          id: 'destination',
          type: 'destination',
          distanceKm: effectiveRouteDistanceKm,
          detourKm: 0,
          location: primaryRoute.destination,
        },
      ];
    };

    const legDistanceKm = (from: PlannerNode, to: PlannerNode): number => {
      if (to.distanceKm <= from.distanceKm) return 0;
      return (to.distanceKm - from.distanceKm) + from.detourKm + to.detourKm;
    };

    const maxLegReachKm = (departureBatteryPercent: number): number =>
      ((Math.max(0, departureBatteryPercent - BATTERY_BUFFER)) / 100) * maxRangeKm;

    type PathResult = {
      reachedDestination: boolean;
      pathIndices: number[];
      furthestIndex: number;
      nearestGap?: {
        requiredKm: number;
        availableKm: number;
        fromKm: number;
        toKm: number;
      };
    };

    const findPath = (nodes: PlannerNode[]): PathResult => {
      type PathState = {
        stops: number;
        totalDetourKm: number;
        chargingPowerScore: number;
        prevIndex: number;
      };

      const isBetterState = (candidate: PathState, current?: PathState | null): boolean => {
        if (!current) return true;
        if (candidate.stops !== current.stops) return candidate.stops < current.stops;
        if (Math.abs(candidate.totalDetourKm - current.totalDetourKm) > 0.01) {
          return candidate.totalDetourKm < current.totalDetourKm;
        }
        if (Math.abs(candidate.chargingPowerScore - current.chargingPowerScore) > 0.001) {
          return candidate.chargingPowerScore > current.chargingPowerScore;
        }
        return false;
      };

      const destinationIndex = nodes.length - 1;
      const states: Array<PathState | null> = new Array(nodes.length).fill(null);
      states[0] = {
        stops: 0,
        totalDetourKm: 0,
        chargingPowerScore: 0,
        prevIndex: -1,
      };
      let furthestIndex = 0;

      for (let fromIndex = 0; fromIndex < nodes.length; fromIndex += 1) {
        const fromState = states[fromIndex];
        if (!fromState) continue;
        if (nodes[fromIndex].distanceKm > nodes[furthestIndex].distanceKm) {
          furthestIndex = fromIndex;
        }

        const departureBatteryPercent =
          nodes[fromIndex].type === 'start' ? currentBatteryPercent : TARGET_CHARGE_PERCENT;
        const availableKm = maxLegReachKm(departureBatteryPercent);

        for (let toIndex = fromIndex + 1; toIndex < nodes.length; toIndex += 1) {
          const requiredKm = legDistanceKm(nodes[fromIndex], nodes[toIndex]);
          if (requiredKm > availableKm + 0.01) continue;

          const toNode = nodes[toIndex];
          const stopIncrement = toNode.type === 'station' ? 1 : 0;
          const detourIncrement = toNode.type === 'station' ? toNode.detourKm : 0;
          const powerIncrement =
            toNode.type === 'station'
              ? clampNumber(
                  ((toNode.station?.power_kW || DEFAULT_CHARGING_POWER_KW) / 150),
                  0,
                  1
                )
              : 0;
          const candidateState: PathState = {
            stops: fromState.stops + stopIncrement,
            totalDetourKm: fromState.totalDetourKm + detourIncrement,
            chargingPowerScore: fromState.chargingPowerScore + powerIncrement,
            prevIndex: fromIndex,
          };

          if (isBetterState(candidateState, states[toIndex])) {
            states[toIndex] = candidateState;
          }
        }
      }

      const reachedDestination = states[destinationIndex] !== null;
      const endIndex = reachedDestination ? destinationIndex : furthestIndex;
      const pathIndices: number[] = [];
      let cursor = endIndex;
      while (cursor !== -1) {
        pathIndices.push(cursor);
        cursor = states[cursor]?.prevIndex ?? -1;
      }
      pathIndices.reverse();

      let nearestGap: PathResult['nearestGap'];
      if (!reachedDestination) {
        const fromNode = nodes[furthestIndex];
        const departureBatteryPercent =
          fromNode.type === 'start' ? currentBatteryPercent : TARGET_CHARGE_PERCENT;
        const availableKm = maxLegReachKm(departureBatteryPercent);

        let minimumRequiredKm = Number.POSITIVE_INFINITY;
        let nearestToKm = fromNode.distanceKm;
        for (let toIndex = furthestIndex + 1; toIndex < nodes.length; toIndex += 1) {
          const requiredKm = legDistanceKm(fromNode, nodes[toIndex]);
          if (requiredKm < minimumRequiredKm) {
            minimumRequiredKm = requiredKm;
            nearestToKm = nodes[toIndex].distanceKm;
          }
        }

        if (Number.isFinite(minimumRequiredKm)) {
          nearestGap = {
            requiredKm: minimumRequiredKm,
            availableKm,
            fromKm: fromNode.distanceKm,
            toKm: nearestToKm,
          };
        }
      }

      return {
        reachedDestination,
        pathIndices,
        furthestIndex,
        nearestGap,
      };
    };

    const initialMaxDetourKm = clampNumber(fullChargeLegReachKm * 0.12, 20, 40);
    let plannerNodes = buildNodes(initialMaxDetourKm);
    let pathResult = findPath(plannerNodes);

    if (!pathResult.reachedDestination) {
      await collectStationsAlongRoute(fallbackSampleCount, fallbackRadii);
      await collectStationsNearExpectedStops(fallbackRadii);
      plannerNodes = buildNodes(); // Remove detour filtering in fallback mode
      pathResult = findPath(plannerNodes);
    }

    const pathNodes = pathResult.pathIndices.map((index) => plannerNodes[index]);
    const chargingStops: ChargingStop[] = [];
    const chargingPower = maxChargingPower_kW || DEFAULT_CHARGING_POWER_KW;
    let departureBatteryPercent = currentBatteryPercent;
    let totalChargingDurationMinutes = 0;
    let totalEnergyToChargeKWh = 0;

    const buildSuggestionStopsFromStart = (limit: number): ChargingStop[] => {
      const startNode = plannerNodes[0];
      const availableKm = maxLegReachKm(currentBatteryPercent);
      const reachableStations = plannerNodes
        .filter(
          (node): node is StationPlannerNode =>
            node.type === 'station' &&
            legDistanceKm(startNode, node) <= availableKm + 0.01
        )
        .sort((a, b) => {
          if (b.distanceKm !== a.distanceKm) return b.distanceKm - a.distanceKm;
          const powerDelta = (b.station.power_kW || 0) - (a.station.power_kW || 0);
          if (powerDelta !== 0) return powerDelta;
          return a.detourKm - b.detourKm;
        })
        .slice(0, limit);

      return reachableStations.map((node, index) => {
        const legKm = legDistanceKm(startNode, node);
        const batteryUsedPercent = (legKm / maxRangeKm) * 100;
        const arrivalBatteryPercent = Math.max(0, currentBatteryPercent - batteryUsedPercent);
        const batteryPercentToFill = Math.max(0, TARGET_CHARGE_PERCENT - arrivalBatteryPercent);
        const energyToFillKWh = (battery_capacity_kWh * batteryPercentToFill) / 100;
        const chargingMinutes = Math.max(1, Math.round((energyToFillKWh / chargingPower) * 60));

        return {
          stopIndex: index + 1,
          station: {
            ...node.station,
            distanceFromRouteMeters: Math.round(node.detourKm * 1000),
          },
          distanceFromPreviousStopKm: Number(legKm.toFixed(2)),
          arrivalBatteryPercent: Number(arrivalBatteryPercent.toFixed(1)),
          departureBatteryPercent: TARGET_CHARGE_PERCENT,
          energyAdded_kWh: Number(energyToFillKWh.toFixed(2)),
          chargingDurationMinutes: chargingMinutes,
        };
      });
    };

    for (let i = 1; i < pathNodes.length; i += 1) {
      const fromNode = pathNodes[i - 1];
      const toNode = pathNodes[i];
      const legKm = legDistanceKm(fromNode, toNode);
      const batteryUsedPercent = (legKm / maxRangeKm) * 100;
      const arrivalBatteryPercent = Math.max(0, departureBatteryPercent - batteryUsedPercent);

      if (toNode.type === 'station' && toNode.station) {
        const batteryPercentToFill = Math.max(0, TARGET_CHARGE_PERCENT - arrivalBatteryPercent);
        const energyToFillKWh = (battery_capacity_kWh * batteryPercentToFill) / 100;
        const chargingMinutes = Math.max(1, Math.round((energyToFillKWh / chargingPower) * 60));

        chargingStops.push({
          stopIndex: chargingStops.length + 1,
          station: {
            ...toNode.station,
            distanceFromRouteMeters: Math.round(toNode.detourKm * 1000),
          },
          distanceFromPreviousStopKm: Number(legKm.toFixed(2)),
          arrivalBatteryPercent: Number(arrivalBatteryPercent.toFixed(1)),
          departureBatteryPercent: TARGET_CHARGE_PERCENT,
          energyAdded_kWh: Number(energyToFillKWh.toFixed(2)),
          chargingDurationMinutes: chargingMinutes,
        });

        totalChargingDurationMinutes += chargingMinutes;
        totalEnergyToChargeKWh += energyToFillKWh;
        departureBatteryPercent = TARGET_CHARGE_PERCENT;
      } else if (toNode.type === 'destination') {
        recommendation.arrivalBatteryPercent = Number(arrivalBatteryPercent.toFixed(1));
        departureBatteryPercent = arrivalBatteryPercent;
      }
    }

    recommendation.canReachDestination = pathResult.reachedDestination;

    if (recommendation.canReachDestination) {
      recommendation.chargingStops = chargingStops;
      recommendation.suggestedChargingStops = [];
      recommendation.numberOfStops = chargingStops.length;
      recommendation.targetBatteryPercent = TARGET_CHARGE_PERCENT;
      recommendation.chargingDurationMinutes =
        chargingStops.length > 0 ? chargingStops[0].chargingDurationMinutes : 0;
      recommendation.energyToCharge_kWh =
        chargingStops.length > 0 ? chargingStops[0].energyAdded_kWh : 0;
      recommendation.totalChargingDurationMinutes = totalChargingDurationMinutes;
      recommendation.totalEnergyToCharge_kWh = Number(totalEnergyToChargeKWh.toFixed(2));
      recommendation.reason = `Charging plan found with ${chargingStops.length} stop${chargingStops.length === 1 ? '' : 's'} to cover the full route.`;
    } else {
      const suggestedChargingStops =
        chargingStops.length > 0
          ? chargingStops.slice(0, MAX_PARTIAL_CHARGING_SUGGESTIONS)
          : buildSuggestionStopsFromStart(MAX_PARTIAL_CHARGING_SUGGESTIONS);

      recommendation.chargingStops = [];
      recommendation.suggestedChargingStops = suggestedChargingStops;
      recommendation.numberOfStops = 0;
      recommendation.targetBatteryPercent = TARGET_CHARGE_PERCENT;
      recommendation.chargingDurationMinutes = 0;
      recommendation.energyToCharge_kWh = 0;
      recommendation.totalChargingDurationMinutes = 0;
      recommendation.totalEnergyToCharge_kWh = 0;

      const gap = pathResult.nearestGap;
      if (gap) {
        recommendation.reason += ` Coverage gap near km ${gap.fromKm.toFixed(
          0
        )}: nearest next station is about ${gap.requiredKm.toFixed(
          1
        )} km away (max reachable leg ${gap.availableKm.toFixed(1)} km at current strategy).`;
      } else {
        recommendation.reason += ' Unable to construct a full charging path with available station data.';
      }

      if (suggestedChargingStops.length > 0) {
        recommendation.reason += ` Showing ${suggestedChargingStops.length} reachable charging suggestion${
          suggestedChargingStops.length === 1 ? '' : 's'
        } found along the route so far.`;
      }
    }
  }

  

  // 6. Return the analysis
  return {
    metrics,
    evAnalysis: {
      maxRangeKm: Number(maxRangeKm.toFixed(2)),
      currentRangeKm: Number(currentRangeKm.toFixed(2)),
      consumptionPerKm: Number(consumptionPerKm.toFixed(3)),
      recommendation,
    },
  };
}





