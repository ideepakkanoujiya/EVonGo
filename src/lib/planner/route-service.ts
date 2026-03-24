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
  LatLng,
} from '@/lib/planner/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CONGESTION_RATIO = 3;
const MAX_TOMTOM_ALTERNATIVES = 2;
const COORDINATE_REGEX = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
const EARTH_RADIUS_KM = 6371;
const DEFAULT_CHARGING_POWER_KW = 50;
const STATION_PROVIDER_TIMEOUT_MS = 8000;
const STATION_SEARCH_BATCH_SIZE = 6;
const MAX_PARTIAL_CHARGING_SUGGESTIONS = 5;
const MAX_HORIZON_OFFSETS = [-0.35, -0.2, 0, 0.2, 0.35];

/**
 * Always charge to 100% — ensures the longest possible leg out of each stop.
 * See NOTE [TARGET_CHARGE] below if you want smarter partial charging.
 */
const TARGET_CHARGE_PERCENT = 100;

/**
 * FIX [BUFFER]: Minimum battery % we must have at EVERY waypoint (including
 * the final destination). Previously the planner could arrive at 1 %.
 */
const BATTERY_BUFFER_PERCENT = 10; // was 8 — raised to give real safety margin

const PRIMARY_STATION_POOL_TARGET = 220;
const SECONDARY_STATION_POOL_TARGET = 280;
const TERTIARY_STATION_POOL_TARGET = 360;

// ─── Schemas ─────────────────────────────────────────────────────────────────

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
    maxChargingPower_kW: z
      .number()
      .min(10)
      .max(350)
      .optional()
      .default(DEFAULT_CHARGING_POWER_KW),
  }),
  alternatives: z.boolean().optional(),
});

// ─── Local Types ──────────────────────────────────────────────────────────────

type RoutingProvider = 'openrouteservice' | 'tomtom';

type ResolvedLocation = LatLng & { label: string };

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
  features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
};

type TomTomRouteResponse = {
  routes?: Array<{
    summary?: {
      lengthInMeters?: number;
      travelTimeInSeconds?: number;
      noTrafficTravelTimeInSeconds?: number;
      trafficDelayInSeconds?: number;
    };
    legs?: Array<{ points?: Array<{ latitude: number; longitude: number }> }>;
  }>;
};

type TomTomGeocodeResponse = {
  results?: Array<{ position?: { lat?: number; lon?: number } }>;
};

type NominatimGeocodeResponse = Array<{ lat?: string; lon?: string }>;

type OsrmRouteResponse = {
  routes?: Array<{ distance?: number; duration?: number; geometry?: string }>;
};

// ─── Validation ───────────────────────────────────────────────────────────────

export function validatePlannerAnalyzeInput(
  input: unknown
): PlannerAnalyzeRequest {
  return PlannerRequestSchema.parse(input);
}

// ─── Math & Geometry ──────────────────────────────────────────────────────────

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
  if (routePoints.length === 0) return [0];
  const profile: number[] = [0];
  for (let i = 1; i < routePoints.length; i++) {
    profile.push(profile[i - 1] + haversineKm(routePoints[i - 1], routePoints[i]));
  }
  return profile;
}

function findRoutePointIndexAtDistance(
  profile: number[],
  targetKm: number
): number {
  if (profile.length <= 1) return 0;
  const clamped = Math.max(0, Math.min(targetKm, profile[profile.length - 1]));
  for (let i = 1; i < profile.length; i++) {
    if (profile[i] >= clamped) return i;
  }
  return profile.length - 1;
}

function findClosestRoutePointIndex(routePoints: LatLng[], target: LatLng): number {
  if (routePoints.length <= 1) return 0;
  let bestIndex = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < routePoints.length; i++) {
    const d = haversineKm(routePoints[i], target);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function getRoutingProvider(): RoutingProvider {
  const provider = (process.env.ROUTING_PROVIDER || 'tomtom').toLowerCase();
  if (provider === 'openrouteservice' || provider === 'tomtom') return provider;
  throw new Error(
    `Invalid ROUTING_PROVIDER "${provider}". Use "openrouteservice" or "tomtom".`
  );
}

function parseCoordinateInput(value: string): LatLng | null {
  const match = value.match(COORDINATE_REGEX);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 || lat > 90 ||
    lng < -180 || lng > 180
  )
    return null;
  return { lat, lng };
}

function encodePolyline(points: LatLng[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let result = '';
  const enc = (value: number): string => {
    let cur = value < 0 ? ~(value << 1) : value << 1;
    let out = '';
    while (cur >= 0x20) {
      out += String.fromCharCode((0x20 | (cur & 0x1f)) + 63);
      cur >>= 5;
    }
    return out + String.fromCharCode(cur + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    result += enc(lat - lastLat);
    result += enc(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return result;
}

function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
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

// ─── Location Resolution ──────────────────────────────────────────────────────

async function resolveLocation(
  raw: string,
  provider: RoutingProvider,
  apiKey: string
): Promise<ResolvedLocation> {
  const parsed = parseCoordinateInput(raw);
  if (parsed) return { ...parsed, label: raw };

  if (provider === 'openrouteservice') {
    const params = new URLSearchParams({ api_key: apiKey, text: raw, size: '1' });
    const response = await fetch(
      `https://api.openrouteservice.org/geocode/search?${params}`,
      { method: 'GET', cache: 'no-store' }
    );
    if (!response.ok)
      throw new Error(
        `ORS geocode failed for "${raw}" with status ${response.status}`
      );
    const data = (await response.json()) as OpenRouteServiceGeocodeResponse;
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!coords)
      throw new Error(`Could not geocode "${raw}" with OpenRouteService`);
    return { lat: coords[1], lng: coords[0], label: raw };
  }

  const response = await fetch(
    `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(raw)}.json?key=${encodeURIComponent(apiKey)}&limit=1`,
    { method: 'GET', cache: 'no-store' }
  );
  if (!response.ok)
    throw new Error(`TomTom geocode failed for "${raw}" with status ${response.status}`);
  const data = (await response.json()) as TomTomGeocodeResponse;
  const pos = data.results?.[0]?.position;
  if (typeof pos?.lat !== 'number' || typeof pos?.lon !== 'number')
    throw new Error(`Could not geocode "${raw}" with TomTom`);
  return { lat: pos.lat, lng: pos.lon, label: raw };
}

function createFallbackPolyline(origin: LatLng, destination: LatLng): string {
  return encodePolyline([origin, destination]);
}

async function resolveLocationWithNominatim(raw: string): Promise<ResolvedLocation> {
  const parsed = parseCoordinateInput(raw);
  if (parsed) return { ...parsed, label: raw };
  const params = new URLSearchParams({ q: raw, format: 'jsonv2', limit: '1' });
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    { method: 'GET', cache: 'no-store', headers: { 'User-Agent': 'MoveOnEV Planner' } }
  );
  if (!response.ok)
    throw new Error(`Nominatim geocode failed for "${raw}" with status ${response.status}`);
  const data = (await response.json()) as NominatimGeocodeResponse;
  const match = Array.isArray(data) ? data[0] : undefined;
  const lat = Number(match?.lat);
  const lng = Number(match?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    throw new Error(`Could not geocode "${raw}" with Nominatim`);
  return { lat, lng, label: raw };
}

// ─── Routing Providers ────────────────────────────────────────────────────────

async function fetchOpenRouteServiceMetrics(
  input: PlannerAnalyzeRequest
): Promise<RouteTrafficMetrics[]> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey)
    throw new Error('Missing OPENROUTESERVICE_API_KEY. Add it to your .env.local file.');

  const origin = await resolveLocation(input.origin, 'openrouteservice', apiKey);
  const destination = await resolveLocation(input.destination, 'openrouteservice', apiKey);

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
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
    }
  );
  if (!response.ok)
    throw new Error(`ORS directions failed with status ${response.status}`);

  const data = (await response.json()) as OpenRouteServiceRouteResponse;
  const routes = Array.isArray(data.routes) ? data.routes : [];
  if (routes.length === 0) throw new Error('OpenRouteService returned no routes');

  return toRouteTrafficMetrics(
    routes.map((route, index) => ({
      summary: `Route ${index + 1} (OpenRouteService)`,
      distanceMeters:
        route.summary?.distance ?? haversineKm(origin, destination) * 1000,
      durationSeconds: route.summary?.duration ?? 0,
      durationInTrafficSeconds: route.summary?.duration ?? 0,
      polyline:
        typeof route.geometry === 'string' && route.geometry.length > 0
          ? route.geometry
          : createFallbackPolyline(origin, destination),
      origin,
      destination,
    }))
  );
}

async function fetchTomTomMetrics(
  input: PlannerAnalyzeRequest
): Promise<RouteTrafficMetrics[]> {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey)
    throw new Error('Missing TOMTOM_API_KEY. Add it to your .env.local file.');

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
    `https://api.tomtom.com/routing/1/calculateRoute/${origin.lat},${origin.lng}:${destination.lat},${destination.lng}/json?${params}`,
    { method: 'GET', cache: 'no-store' }
  );
  if (!response.ok)
    throw new Error(`TomTom route lookup failed with status ${response.status}`);

  const data = (await response.json()) as TomTomRouteResponse;
  const routes = Array.isArray(data.routes) ? data.routes : [];
  if (routes.length === 0) throw new Error('TomTom returned no routes');

  return toRouteTrafficMetrics(
    routes.map((route, index) => {
      const travelTime = route.summary?.travelTimeInSeconds ?? 0;
      const noTraffic = route.summary?.noTrafficTravelTimeInSeconds ?? 0;
      const trafficDelay = route.summary?.trafficDelayInSeconds ?? 0;
      const durationSeconds =
        noTraffic > 0 ? noTraffic : Math.max(0, travelTime - trafficDelay);
      const durationInTrafficSeconds =
        travelTime > 0 ? travelTime : Math.max(0, durationSeconds + trafficDelay);
      const points: LatLng[] =
        route.legs
          ?.flatMap((leg) =>
            leg.points?.map((p) => ({ lat: p.latitude, lng: p.longitude })) || []
          )
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)) || [];
      return {
        summary: `Route ${index + 1} (TomTom)`,
        distanceMeters: route.summary?.lengthInMeters ?? 0,
        durationSeconds,
        durationInTrafficSeconds,
        polyline:
          points.length > 1
            ? encodePolyline(points)
            : createFallbackPolyline(origin, destination),
        origin: points[0] || origin,
        destination: points[points.length - 1] || destination,
      };
    })
  );
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
    `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?${params}`,
    { method: 'GET', cache: 'no-store' }
  );
  if (!response.ok)
    throw new Error(`OSRM route lookup failed with status ${response.status}`);

  const data = (await response.json()) as OsrmRouteResponse;
  const routes = Array.isArray(data.routes) ? data.routes : [];
  if (routes.length === 0) throw new Error('OSRM returned no routes');

  return toRouteTrafficMetrics(
    routes.map((route, index) => ({
      summary: `Route ${index + 1} (OSRM)`,
      distanceMeters: route.distance ?? haversineKm(origin, destination) * 1000,
      durationSeconds: route.duration ?? 0,
      durationInTrafficSeconds: route.duration ?? 0,
      polyline:
        typeof route.geometry === 'string' && route.geometry.length > 0
          ? route.geometry
          : createFallbackPolyline(origin, destination),
      origin,
      destination,
    }))
  );
}

export async function fetchRouteTrafficMetrics(
  input: PlannerAnalyzeRequest
): Promise<RouteTrafficMetrics[]> {
  const primary = getRoutingProvider();
  const fallback: RoutingProvider =
    primary === 'tomtom' ? 'openrouteservice' : 'tomtom';
  const errors: string[] = [];

  try {
    return primary === 'tomtom'
      ? await fetchTomTomMetrics(input)
      : await fetchOpenRouteServiceMetrics(input);
  } catch (e) {
    errors.push(`${primary}: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    return fallback === 'tomtom'
      ? await fetchTomTomMetrics(input)
      : await fetchOpenRouteServiceMetrics(input);
  } catch (e) {
    errors.push(`${fallback}: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    return await fetchOsrmMetrics(input);
  } catch (e) {
    errors.push(`osrm: ${e instanceof Error ? e.message : String(e)}`);
  }

  throw new Error(`Routing failed across all providers. ${errors.join(' | ')}`);
}

// ─── Charging Station Search ──────────────────────────────────────────────────

async function searchChargingStationsNear(
  location: LatLng,
  radiusKm: number = 10
): Promise<EVChargingStation[]> {
  try {
    const ocmApiKey = process.env.OPENCHARGEMAP_API_KEY;
    const tomtomApiKey = process.env.TOMTOM_API_KEY;
    const googlePlacesKey =
      process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

    const providerSummaries: string[] = [];

    const normalizeStation = (s: EVChargingStation): EVChargingStation => ({
      ...s,
      name: s.name || 'Charging Station',
      connectorTypes: Array.isArray(s.connectorTypes) ? s.connectorTypes : [],
    });

    const mergeKey = (s: EVChargingStation) =>
      `${s.location.lat.toFixed(4)},${s.location.lng.toFixed(4)}:${s.name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()}`;

    const mergeStations = (sources: EVChargingStation[][]): EVChargingStation[] => {
      const merged = new Map<string, EVChargingStation>();
      for (const source of sources) {
        for (const station of source) {
          const n = normalizeStation(station);
          const key = mergeKey(n);
          const existing = merged.get(key);
          if (!existing) { merged.set(key, n); continue; }
          merged.set(key, {
            ...existing,
            connectorTypes: Array.from(
              new Set([...(existing.connectorTypes || []), ...(n.connectorTypes || [])])
            ),
            power_kW: Math.max(existing.power_kW || 0, n.power_kW || 0) || undefined,
            distanceFromRouteMeters: Math.min(
              existing.distanceFromRouteMeters,
              n.distanceFromRouteMeters
            ),
          });
        }
      }
      return Array.from(merged.values());
    };

    // ── OpenChargeMap ────────────────────────────────────────────────────────
    const fetchFromOpenChargeMap = async (): Promise<EVChargingStation[]> => {
      if (!ocmApiKey) { providerSummaries.push('ocm:skipped(no key)'); return []; }
      const t = Date.now();
      const url =
        `https://api.openchargemap.io/v3/poi/?output=json` +
        `&latitude=${location.lat}&longitude=${location.lng}` +
        `&distance=${radiusKm}&distanceunit=KM&maxresults=100&key=${ocmApiKey}`;
      const res = await fetchWithTimeout(url, { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!res.ok) {
        providerSummaries.push(`ocm:error(${res.status})`);
        return [];
      }
      type OCMResult = {
        ID?: number;
        AddressInfo?: { Title?: string; Latitude?: number; Longitude?: number };
        Connections?: Array<{ ConnectionType?: { Title?: string }; PowerKW?: number | null }>;
      };
      const data = (await res.json()) as OCMResult[];
      const stations = data
        .filter(
          (s): s is OCMResult & { AddressInfo: { Latitude: number; Longitude: number } } =>
            s.AddressInfo?.Latitude != null && s.AddressInfo?.Longitude != null
        )
        .map((s, i) => {
          const loc: LatLng = { lat: s.AddressInfo.Latitude, lng: s.AddressInfo.Longitude };
          const connectorTypes =
            s.Connections?.map((c) => c.ConnectionType?.Title).filter((t): t is string => Boolean(t)) || [];
          const power_kW = s.Connections
            ?.map((c) => c.PowerKW)
            .filter((v): v is number => v != null && v > 0)
            .reduce((max, v) => Math.max(max, v), 0);
          return {
            id: s.ID ? `ocm-${s.ID}` : `ocm-fallback-${i}`,
            name: s.AddressInfo.Title || `Charging Station ${i + 1}`,
            location: loc,
            distanceFromRouteMeters: Math.round(haversineKm(location, loc) * 1000),
            connectorTypes,
            power_kW,
          };
        });
      providerSummaries.push(`ocm:${stations.length} in ${Date.now() - t}ms`);
      return stations;
    };

    // ── TomTom ───────────────────────────────────────────────────────────────
    const fetchFromTomTom = async (): Promise<EVChargingStation[]> => {
      if (!tomtomApiKey) { providerSummaries.push('tomtom:skipped(no key)'); return []; }
      const t = Date.now();
      const params = new URLSearchParams({
        key: tomtomApiKey,
        lat: String(location.lat),
        lon: String(location.lng),
        radius: String(Math.round(radiusKm * 1000)),
        limit: '100',
      });
      const res = await fetchWithTimeout(
        `https://api.tomtom.com/search/2/poiSearch/${encodeURIComponent('ev charging station')}.json?${params}`,
        { method: 'GET', cache: 'no-store' }
      );
      if (!res.ok) { providerSummaries.push(`tomtom:error(${res.status})`); return []; }
      type TTPoi = {
        id?: string;
        poi?: { name?: string };
        position?: { lat?: number; lon?: number };
        dist?: number;
      };
      const data = (await res.json()) as { results?: TTPoi[] };
      const stations = (data.results || [])
        .filter(
          (r): r is TTPoi & { position: { lat: number; lon: number } } =>
            typeof r.position?.lat === 'number' && typeof r.position?.lon === 'number'
        )
        .map((r, i) => ({
          id: r.id ? `tt-${r.id}` : `tt-fallback-${i}-${r.position.lat}`,
          name: r.poi?.name || 'EV Charging Station',
          location: { lat: r.position.lat, lng: r.position.lon },
          distanceFromRouteMeters:
            typeof r.dist === 'number'
              ? Math.round(r.dist)
              : Math.round(haversineKm(location, { lat: r.position.lat, lng: r.position.lon }) * 1000),
          connectorTypes: [],
        }));
      providerSummaries.push(`tomtom:${stations.length} in ${Date.now() - t}ms`);
      return stations;
    };

    // ── Google Places ─────────────────────────────────────────────────────────
    const fetchFromGooglePlaces = async (): Promise<EVChargingStation[]> => {
      if (!googlePlacesKey) { providerSummaries.push('google:skipped(no key)'); return []; }
      const t = Date.now();
      const params = new URLSearchParams({
        location: `${location.lat},${location.lng}`,
        radius: String(Math.max(1000, Math.min(50000, Math.round(radiusKm * 1000)))),
        keyword: 'ev charging station',
        key: googlePlacesKey,
      });
      const res = await fetchWithTimeout(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`,
        { method: 'GET', cache: 'no-store' }
      );
      if (!res.ok) { providerSummaries.push(`google:error(${res.status})`); return []; }
      type GResult = {
        place_id?: string;
        name?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      };
      const data = (await res.json()) as { status?: string; results?: GResult[] };
      if (!Array.isArray(data.results)) { providerSummaries.push(`google:0 in ${Date.now() - t}ms`); return []; }
      const stations = data.results
        .filter(
          (r): r is GResult & { geometry: { location: { lat: number; lng: number } } } =>
            typeof r.geometry?.location?.lat === 'number' &&
            typeof r.geometry?.location?.lng === 'number'
        )
        .map((r, i) => ({
          id: r.place_id ? `gp-${r.place_id}` : `gp-fallback-${i}`,
          name: r.name || 'EV Charging Station',
          location: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
          distanceFromRouteMeters: Math.round(
            haversineKm(location, { lat: r.geometry.location.lat, lng: r.geometry.location.lng }) * 1000
          ),
          connectorTypes: [],
        }));
      providerSummaries.push(`google:${stations.length} in ${Date.now() - t}ms`);
      return stations;
    };

    const settled = await Promise.allSettled([
      fetchFromOpenChargeMap(),
      fetchFromTomTom(),
      fetchFromGooglePlaces(),
    ]);

    settled.forEach((r, i) => {
      if (r.status === 'rejected') {
        const name = ['ocm', 'tomtom', 'google'][i] ?? `provider-${i}`;
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        providerSummaries.push(`${name}:failed(${msg})`);
        console.error(`❌ ${name} station lookup failed:`, r.reason);
      }
    });

    const merged = mergeStations(
      settled
        .filter((r): r is PromiseFulfilledResult<EVChargingStation[]> => r.status === 'fulfilled')
        .map((r) => r.value)
    );
    console.log(`✅ Aggregated ${merged.length} stations [${providerSummaries.join(', ')}]`);
    return merged;
  } catch (error) {
    console.error('❌ Station search error:', error);
    return [];
  }
}

// ─── Main EV Route Analysis ───────────────────────────────────────────────────

export async function analyzeEVRoute(
  input: PlannerAnalyzeRequest
): Promise<EVRouteAnalysis> {
  console.log('=== Starting EV Route Analysis ===');

  // 1. Fetch route metrics
  const metrics = await fetchRouteTrafficMetrics(input);
  const primaryRoute = metrics[0];
  const distanceKm = primaryRoute.distanceKm;

  // 2. Resolve vehicle specs and predict traffic-adjusted range
  const resolvedVehicle = await resolveVehicleSpecs(input.vehicle);
  const normalizedInput: PlannerAnalyzeRequest = { ...input, vehicle: resolvedVehicle };
  const { battery_capacity_kWh, maxChargingPower_kW } = resolvedVehicle;
  const currentBatteryPercent = input.batteryPercent;

  const currentBatteryRange = await predictTrafficAdjustedRange(
    buildTrafficRangePayload(normalizedInput, primaryRoute)
  );
  const fullBatteryRange = await predictTrafficAdjustedRange(
    buildTrafficRangePayload({ ...normalizedInput, batteryPercent: 100 }, primaryRoute)
  );

  // FIX [RANGE]: Use traffic-adjusted range for all calculations so congestion
  // is properly reflected in every leg estimate.
  const trafficFactor =
    fullBatteryRange.trafficAdjustedRangeKm > 0
      ? fullBatteryRange.trafficAdjustedRangeKm /
        Math.max(1, fullBatteryRange.trafficAdjustedRangeKm / (1 - primaryRoute.congestionRatio * 0.15))
      : 1;

  const maxRangeKm = Math.max(1, fullBatteryRange.trafficAdjustedRangeKm);
  const currentRangeKm = Math.max(0, currentBatteryRange.trafficAdjustedRangeKm);
  const consumptionPerKm = currentBatteryRange.consumptionWhPerKm / 1000;

  // FIX [DESTINATION_BUFFER]: Journey can only be completed if we arrive with
  // at least BATTERY_BUFFER_PERCENT remaining — not just > 0.
  const batteryAtDestination = currentBatteryRange.estimatedBatteryLeftPercent ?? 0;
  const canReachDestination =
    currentBatteryRange.canReachDestination &&
    currentRangeKm >= distanceKm &&
    batteryAtDestination >= BATTERY_BUFFER_PERCENT;

  // 3. Initial recommendation
  const recommendation: EVChargingRecommendation = {
    needed: false,
    chargingStops: [],
    suggestedChargingStops: [],
    arrivalBatteryPercent: canReachDestination ? batteryAtDestination : currentBatteryPercent,
    targetBatteryPercent: currentBatteryPercent,
    chargingDurationMinutes: 0,
    totalChargingDurationMinutes: 0,
    energyToCharge_kWh: 0,
    totalEnergyToCharge_kWh: 0,
    canReachDestination,
    numberOfStops: 0,
    reason: canReachDestination ? 'Sufficient charge to reach destination.' : undefined,
  };

  if (!recommendation.canReachDestination) {
    recommendation.needed = true;
    recommendation.reason = `Current range (${currentRangeKm.toFixed(1)} km) is less than trip distance (${distanceKm} km).`;

    // 4. Decode polyline
    let routePoints: LatLng[] = [];
    try {
      routePoints = decodePolyline(primaryRoute.polyline);
      console.log(`✅ Decoded ${routePoints.length} route points`);
    } catch {
      routePoints = [primaryRoute.origin, primaryRoute.destination];
    }
    if (routePoints.length < 2)
      routePoints = [primaryRoute.origin, primaryRoute.destination];

    const routeProfile = buildRouteDistanceProfile(routePoints);
    const profileEnd = routeProfile[routeProfile.length - 1] ?? 0;
    const effectiveRouteKm =
      Number.isFinite(profileEnd) && profileEnd > 1 ? profileEnd : distanceKm;

    // ── Range helpers ──────────────────────────────────────────────────────
    const BUFFER = BATTERY_BUFFER_PERCENT;

    /**
     * FIX [LEG_REACH]: Compute max km reachable from a departure battery %,
     * factoring in the buffer we must keep at arrival.
     * usable % = departurePct - BUFFER  (must arrive with at least BUFFER)
     */
    const maxLegReachKm = (departurePct: number): number =>
      ((Math.max(0, departurePct - BUFFER)) / 100) * maxRangeKm * trafficFactor;

    const currentLegReachKm = Math.max(40, maxLegReachKm(currentBatteryPercent));
    const fullChargeLegReachKm = Math.max(60, maxLegReachKm(TARGET_CHARGE_PERCENT));

    // ── Search spacing & radii ─────────────────────────────────────────────
    const primarySpacingKm = clampNumber(fullChargeLegReachKm * 0.38, 45, 120);
    const fallbackSpacingKm = clampNumber(fullChargeLegReachKm * 0.24, 30, 80);
    const tertiarySpacingKm = clampNumber(fullChargeLegReachKm * 0.18, 24, 65);

    const primarySampleCount = clampNumber(
      Math.ceil(effectiveRouteKm / primarySpacingKm), 16, 36
    );
    const fallbackSampleCount = clampNumber(
      Math.ceil(effectiveRouteKm / fallbackSpacingKm), primarySampleCount + 10, 72
    );
    const tertiarySampleCount = clampNumber(
      Math.ceil(effectiveRouteKm / tertiarySpacingKm), fallbackSampleCount + 12, 96
    );

    const primaryRadii = Array.from(
      new Set([
        Math.round(clampNumber(currentLegReachKm * 0.32, 80, 160)),
        Math.round(clampNumber(fullChargeLegReachKm * 0.65, 140, 280)),
      ])
    );
    const fallbackRadii = Array.from(
      new Set([
        Math.round(clampNumber(fullChargeLegReachKm * 0.55, 120, 240)),
        Math.round(clampNumber(fullChargeLegReachKm * 1.05, 220, 420)),
      ])
    );
    const tertiaryRadii = Array.from(
      new Set([
        Math.round(clampNumber(fullChargeLegReachKm * 0.7, 160, 300)),
        Math.round(clampNumber(fullChargeLegReachKm * 1.35, 280, 520)),
      ])
    );

    // ── Station pool ───────────────────────────────────────────────────────
    const stationSearchCache = new Map<string, Promise<EVChargingStation[]>>();
    const stationById = new Map<string, EVChargingStation>();
    // FIX [META]: track projection distance and detour separately
    const stationMetaById = new Map<
      string,
      { projectionKm: number; detourKm: number }
    >();

    const searchCached = async (loc: LatLng, radiusKm: number): Promise<EVChargingStation[]> => {
      const key = `${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}:${radiusKm}`;
      let p = stationSearchCache.get(key);
      if (!p) {
        p = searchChargingStationsNear(loc, radiusKm).catch((e) => {
          console.error(`❌ Station lookup failed for ${key}:`, e);
          return [];
        });
        stationSearchCache.set(key, p);
      }
      return p;
    };

    const addToPool = (stations: EVChargingStation[]) => {
      for (const s of stations) {
        if (stationById.has(s.id)) continue;
        stationById.set(s.id, s);
        const idx = findClosestRoutePointIndex(routePoints, s.location);
        const projectionKm = routeProfile[idx] ?? 0;
        const detourKm = haversineKm(s.location, routePoints[idx]);
        stationMetaById.set(s.id, { projectionKm, detourKm });
      }
    };

    const collectAlongRoute = async (
      sampleCount: number,
      radii: number[],
      poolTarget: number
    ) => {
      const samples = clampNumber(sampleCount, 2, Math.max(2, routePoints.length - 1));
      const tasks: Array<() => Promise<EVChargingStation[]>> = [];
      for (let i = 0; i <= samples; i++) {
        const km = (effectiveRouteKm * i) / samples;
        const idx = findRoutePointIndexAtDistance(routeProfile, km);
        const pt = routePoints[idx] ?? primaryRoute.origin;
        for (const r of radii) tasks.push(() => searchCached(pt, r));
      }
      for (let i = 0; i < tasks.length; i += STATION_SEARCH_BATCH_SIZE) {
        const results = await Promise.all(
          tasks.slice(i, i + STATION_SEARCH_BATCH_SIZE).map((t) => t())
        );
        results.forEach(addToPool);
        if (stationById.size >= poolTarget) break;
      }
    };

    const collectNearExpectedStops = async (radii: number[], poolTarget: number) => {
      const targets: number[] = [];
      const spread = clampNumber(fullChargeLegReachKm * 0.18, 20, 75);
      for (let d = currentLegReachKm; d < effectiveRouteKm; d += fullChargeLegReachKm)
        targets.push(d);
      if (targets.length === 0) return;

      const tasks: Array<() => Promise<EVChargingStation[]>> = [];
      for (const targetKm of targets) {
        for (const offset of MAX_HORIZON_OFFSETS) {
          const km = clampNumber(targetKm + offset * spread, 0, effectiveRouteKm);
          const idx = findRoutePointIndexAtDistance(routeProfile, km);
          const pt = routePoints[idx] ?? primaryRoute.origin;
          for (const r of radii) tasks.push(() => searchCached(pt, r));
        }
      }
      for (let i = 0; i < tasks.length; i += STATION_SEARCH_BATCH_SIZE) {
        const results = await Promise.all(
          tasks.slice(i, i + STATION_SEARCH_BATCH_SIZE).map((t) => t())
        );
        results.forEach(addToPool);
        if (stationById.size >= poolTarget) break;
      }
    };

    const collectNearAnchors = async (radii: number[]) => {
      const anchors = new Set<number>([
        0,
        Math.max(0, currentLegReachKm * 0.9),
        effectiveRouteKm * 0.5,
        // FIX [ANCHORS]: Add anchor just before the destination so we always
        // search for a final station reachable enough to reach the end.
        Math.max(0, effectiveRouteKm - fullChargeLegReachKm * 0.5),
        Math.max(0, effectiveRouteKm - fullChargeLegReachKm),
        effectiveRouteKm,
      ]);
      const tasks: Array<() => Promise<EVChargingStation[]>> = [];
      for (const km of anchors) {
        const idx = findRoutePointIndexAtDistance(routeProfile, km);
        const pt = routePoints[idx] ?? primaryRoute.origin;
        for (const r of radii) tasks.push(() => searchCached(pt, r));
      }
      for (let i = 0; i < tasks.length; i += STATION_SEARCH_BATCH_SIZE) {
        const results = await Promise.all(
          tasks.slice(i, i + STATION_SEARCH_BATCH_SIZE).map((t) => t())
        );
        results.forEach(addToPool);
      }
    };

    // 5. Build planner nodes
    type PlannerNode = {
      id: string;
      type: 'start' | 'station' | 'destination';
      projectionKm: number; // distance along route where this node projects
      detourKm: number;     // straight-line detour from route
      station?: EVChargingStation;
      location: LatLng;
    };
    type StationNode = PlannerNode & { type: 'station'; station: EVChargingStation };

    const buildNodes = (maxDetourKm?: number): PlannerNode[] => {
      const stationNodes = Array.from(stationById.values())
        .map((s): StationNode | null => {
          const meta = stationMetaById.get(s.id);
          if (!meta) return null;
          // exclude stations at/past the ends — they're not valid en-route stops
          if (meta.projectionKm <= 0 || meta.projectionKm >= effectiveRouteKm) return null;
          if (maxDetourKm !== undefined && meta.detourKm > maxDetourKm) return null;

          // Keep all en-route stations in the graph. The path finder already
          // checks whether each leg is reachable, so filtering here to only
          // "one-leg-to-destination" stations breaks multi-stop plans and can
          // leave partial suggestions empty on long trips.

          return {
            id: s.id,
            type: 'station',
            projectionKm: meta.projectionKm,
            detourKm: meta.detourKm,
            station: s,
            location: s.location,
          };
        })
        .filter((n): n is StationNode => n !== null)
        .sort((a, b) =>
          a.projectionKm !== b.projectionKm
            ? a.projectionKm - b.projectionKm
            : a.detourKm - b.detourKm
        );

      return [
        { id: 'start', type: 'start', projectionKm: 0, detourKm: 0, location: primaryRoute.origin },
        ...stationNodes,
        {
          id: 'destination',
          type: 'destination',
          projectionKm: effectiveRouteKm,
          detourKm: 0,
          location: primaryRoute.destination,
        },
      ];
    };

    /**
     * FIX [LEG_DISTANCE]: Detour must only be counted ONCE — the round-trip cost
     * of detouring to a station is captured by `node.detourKm` for the station
     * we're going TO, not both ends.
     *
     * Old formula added from.detourKm + to.detourKm, double-counting previous
     * detour legs and causing the planner to underestimate reachable stations.
     */
    const legKm = (from: PlannerNode, to: PlannerNode): number => {
      if (to.projectionKm <= from.projectionKm) return 0;
      // Distance along route + the detour cost of reaching the 'to' node only.
      return (to.projectionKm - from.projectionKm) + to.detourKm;
    };

    // ── Dijkstra / DP path finder ──────────────────────────────────────────
    type PathResult = {
      reachedDestination: boolean;
      pathIndices: number[];
      furthestIndex: number;
      nearestGap?: { requiredKm: number; availableKm: number; fromKm: number; toKm: number };
    };

    const findPath = (nodes: PlannerNode[]): PathResult => {
      type State = {
        stops: number;
        totalDetourKm: number;
        chargingPowerScore: number;
        prevIndex: number;
      };
      const isBetter = (a: State, b?: State | null): boolean => {
        if (!b) return true;
        if (a.stops !== b.stops) return a.stops < b.stops;
        if (Math.abs(a.totalDetourKm - b.totalDetourKm) > 0.01)
          return a.totalDetourKm < b.totalDetourKm;
        if (Math.abs(a.chargingPowerScore - b.chargingPowerScore) > 0.001)
          return a.chargingPowerScore > b.chargingPowerScore;
        return false;
      };

      const destIdx = nodes.length - 1;
      const states: Array<State | null> = new Array(nodes.length).fill(null);
      states[0] = { stops: 0, totalDetourKm: 0, chargingPowerScore: 0, prevIndex: -1 };
      let furthest = 0;

      for (let from = 0; from < nodes.length; from++) {
        const st = states[from];
        if (!st) continue;
        if (nodes[from].projectionKm > nodes[furthest].projectionKm) furthest = from;

        const departurePct =
          nodes[from].type === 'start' ? currentBatteryPercent : TARGET_CHARGE_PERCENT;
        const reach = maxLegReachKm(departurePct);

        for (let to = from + 1; to < nodes.length; to++) {
          const required = legKm(nodes[from], nodes[to]);
          // FIX [BUFFER]: At the final destination we must still have BUFFER %
          // left, which is already baked into maxLegReachKm (it subtracts
          // BATTERY_BUFFER_PERCENT from departure before converting to km).
          if (required > reach + 0.01) continue;

          const toNode = nodes[to];
          const candidate: State = {
            stops: st.stops + (toNode.type === 'station' ? 1 : 0),
            totalDetourKm: st.totalDetourKm + (toNode.type === 'station' ? toNode.detourKm : 0),
            chargingPowerScore:
              st.chargingPowerScore +
              (toNode.type === 'station'
                ? clampNumber((toNode.station?.power_kW ?? DEFAULT_CHARGING_POWER_KW) / 150, 0, 1)
                : 0),
            prevIndex: from,
          };
          if (isBetter(candidate, states[to])) states[to] = candidate;
        }
      }

      const reached = states[destIdx] !== null;
      const endIdx = reached ? destIdx : furthest;
      const path: number[] = [];
      let cur = endIdx;
      while (cur !== -1) {
        path.push(cur);
        cur = states[cur]?.prevIndex ?? -1;
      }
      path.reverse();

      let nearestGap: PathResult['nearestGap'];
      if (!reached) {
        const fromNode = nodes[furthest];
        const reach = maxLegReachKm(
          fromNode.type === 'start' ? currentBatteryPercent : TARGET_CHARGE_PERCENT
        );
        let minRequired = Infinity;
        let nearestToKm = fromNode.projectionKm;
        for (let to = furthest + 1; to < nodes.length; to++) {
          const r = legKm(fromNode, nodes[to]);
          if (r < minRequired) { minRequired = r; nearestToKm = nodes[to].projectionKm; }
        }
        if (isFinite(minRequired)) {
          nearestGap = { requiredKm: minRequired, availableKm: reach, fromKm: fromNode.projectionKm, toKm: nearestToKm };
        }
      }
      return { reachedDestination: reached, pathIndices: path, furthestIndex: furthest, nearestGap };
    };

    // ── Build station pool (up to 3 tiers) ────────────────────────────────
    const initialDetourKm = clampNumber(fullChargeLegReachKm * 0.12, 20, 40);

    await collectAlongRoute(primarySampleCount, primaryRadii, PRIMARY_STATION_POOL_TARGET);
    await collectNearExpectedStops(primaryRadii, PRIMARY_STATION_POOL_TARGET);
    await collectNearAnchors(primaryRadii);
    console.log(`[Tier 1] Pool: ${stationById.size} stations`);

    let plannerNodes = buildNodes(initialDetourKm);
    let pathResult = findPath(plannerNodes);

    if (!pathResult.reachedDestination) {
      await collectAlongRoute(fallbackSampleCount, fallbackRadii, SECONDARY_STATION_POOL_TARGET);
      await collectNearExpectedStops(fallbackRadii, SECONDARY_STATION_POOL_TARGET);
      await collectNearAnchors(fallbackRadii);
      console.log(`[Tier 2] Pool: ${stationById.size} stations`);
      plannerNodes = buildNodes(); // no detour cap in fallback
      pathResult = findPath(plannerNodes);
    }

    if (!pathResult.reachedDestination) {
      await collectAlongRoute(tertiarySampleCount, tertiaryRadii, TERTIARY_STATION_POOL_TARGET);
      await collectNearExpectedStops(tertiaryRadii, TERTIARY_STATION_POOL_TARGET);
      await collectNearAnchors(tertiaryRadii);
      console.log(`[Tier 3] Pool: ${stationById.size} stations`);
      plannerNodes = buildNodes();
      pathResult = findPath(plannerNodes);
    }

    // ── Build charging stops from the found path ───────────────────────────
    const pathNodes = pathResult.pathIndices.map((i) => plannerNodes[i]);
    const chargingStops: ChargingStop[] = [];
    const chargingPower = maxChargingPower_kW || DEFAULT_CHARGING_POWER_KW;
    let departurePct = currentBatteryPercent;
    let totalChargingMinutes = 0;
    let totalEnergyKWh = 0;

    for (let i = 1; i < pathNodes.length; i++) {
      const from = pathNodes[i - 1];
      const to = pathNodes[i];
      const leg = legKm(from, to);

      // FIX [CONSUMPTION]: Use the same maxRangeKm (full-charge traffic-adjusted)
      // to derive consumption ratio consistently across all legs.
      const batteryUsedPct = (leg / maxRangeKm) * 100;
      const arrivalPct = Math.max(0, departurePct - batteryUsedPct);

      if (to.type === 'station' && to.station) {
        const toFill = Math.max(0, TARGET_CHARGE_PERCENT - arrivalPct);
        const energyKWh = (battery_capacity_kWh * toFill) / 100;
        const chargeMinutes = Math.max(1, Math.round((energyKWh / chargingPower) * 60));

        chargingStops.push({
          stopIndex: chargingStops.length + 1,
          station: { ...to.station, distanceFromRouteMeters: Math.round(to.detourKm * 1000) },
          distanceFromPreviousStopKm: Number(leg.toFixed(2)),
          arrivalBatteryPercent: Number(arrivalPct.toFixed(1)),
          departureBatteryPercent: TARGET_CHARGE_PERCENT,
          energyAdded_kWh: Number(energyKWh.toFixed(2)),
          chargingDurationMinutes: chargeMinutes,
        });

        totalChargingMinutes += chargeMinutes;
        totalEnergyKWh += energyKWh;
        departurePct = TARGET_CHARGE_PERCENT;
      } else if (to.type === 'destination') {
        // FIX [ARRIVAL_BUFFER]: Record realistic arrival battery
        recommendation.arrivalBatteryPercent = Number(arrivalPct.toFixed(1));
        departurePct = arrivalPct;
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
      recommendation.totalChargingDurationMinutes = totalChargingMinutes;
      recommendation.totalEnergyToCharge_kWh = Number(totalEnergyKWh.toFixed(2));
      recommendation.reason = `Charging plan found with ${chargingStops.length} stop${chargingStops.length === 1 ? '' : 's'} to cover the full route.`;
    } else {
      /**
       * FIX [SUGGESTION_CHAIN]: Build partial suggestions as a proper CHAIN,
       * not all relative to the start.  Each suggestion's departure is the
       * previous suggestion at full charge, so the list is internally
       * consistent and reaches as far as possible toward the destination.
       */
      const buildSuggestionChain = (limit: number): ChargingStop[] => {
        const stops: ChargingStop[] = [];
        let prevNode: PlannerNode = plannerNodes[0];
        let prevPct = currentBatteryPercent;

        while (stops.length < limit) {
          const reach = maxLegReachKm(prevPct);
          // Find the furthest reachable station from prevNode that is also
          // closer to the destination (greedy — maximise progress each hop)
          const candidates = plannerNodes
            .filter(
              (n): n is StationNode =>
                n.type === 'station' &&
                n.projectionKm > prevNode.projectionKm &&
                legKm(prevNode, n) <= reach + 0.01
            )
            .sort((a, b) => {
              if (b.projectionKm !== a.projectionKm)
                return b.projectionKm - a.projectionKm; // furthest first
              return (b.station.power_kW ?? 0) - (a.station.power_kW ?? 0); // then fastest charger
            });

          if (candidates.length === 0) break;
          const best = candidates[0];
          const leg = legKm(prevNode, best);
          const usedPct = (leg / maxRangeKm) * 100;
          const arrPct = Math.max(0, prevPct - usedPct);
          const toFill = Math.max(0, TARGET_CHARGE_PERCENT - arrPct);
          const energyKWh = (battery_capacity_kWh * toFill) / 100;
          const chargeMinutes = Math.max(1, Math.round((energyKWh / chargingPower) * 60));

          stops.push({
            stopIndex: stops.length + 1,
            station: { ...best.station, distanceFromRouteMeters: Math.round(best.detourKm * 1000) },
            distanceFromPreviousStopKm: Number(leg.toFixed(2)),
            arrivalBatteryPercent: Number(arrPct.toFixed(1)),
            departureBatteryPercent: TARGET_CHARGE_PERCENT,
            energyAdded_kWh: Number(energyKWh.toFixed(2)),
            chargingDurationMinutes: chargeMinutes,
          });

          prevNode = best;
          prevPct = TARGET_CHARGE_PERCENT;
        }
        return stops;
      };

      const suggestedStops =
        chargingStops.length > 0
          ? chargingStops.slice(0, MAX_PARTIAL_CHARGING_SUGGESTIONS)
          : buildSuggestionChain(MAX_PARTIAL_CHARGING_SUGGESTIONS);

      recommendation.chargingStops = [];
      recommendation.suggestedChargingStops = suggestedStops;
      recommendation.numberOfStops = 0;
      recommendation.targetBatteryPercent = TARGET_CHARGE_PERCENT;
      recommendation.chargingDurationMinutes = 0;
      recommendation.energyToCharge_kWh = 0;
      recommendation.totalChargingDurationMinutes = 0;
      recommendation.totalEnergyToCharge_kWh = 0;

      const gap = pathResult.nearestGap;
      if (gap) {
        recommendation.reason +=
          ` Coverage gap near km ${gap.fromKm.toFixed(0)}: nearest next station requires` +
          ` ${gap.requiredKm.toFixed(1)} km but max reachable leg is ${gap.availableKm.toFixed(1)} km.`;
      } else {
        recommendation.reason +=
          ' Unable to construct a full charging path with available station data.';
      }

      if (suggestedStops.length > 0) {
        recommendation.reason +=
          ` Showing ${suggestedStops.length} best reachable charging suggestion${suggestedStops.length === 1 ? '' : 's'} along the route.`;
      }
    }
  }

  // 6. Return
  return {
    metrics,
    evAnalysis: {
      maxRangeKm: Number(maxRangeKm.toFixed(2)),
      currentRangeKm: Number(currentRangeKm.toFixed(2)),
      consumptionPerKm: Number(consumptionPerKm.toFixed(3)),
      range: currentBatteryRange,
      recommendation,
    },
  };
}
