import type { RouteTrafficMetrics } from '@/lib/planner/types';

type RouteEnvironmentMetrics = {
  totalElevationGainM: number;
  avgGradientPercent: number;
  temperatureC: number;
  windSpeedKmh: number;
  precipitationMm: number;
};

const DEFAULT_ENVIRONMENT: RouteEnvironmentMetrics = {
  totalElevationGainM: 0,
  avgGradientPercent: 0,
  temperatureC: 25,
  windSpeedKmh: 8,
  precipitationMm: 0,
};

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

function sampleRoutePoints(
  routePoints: Array<{ lat: number; lng: number }>,
  samples = 20
): Array<{ lat: number; lng: number }> {
  if (routePoints.length === 0) return [];
  if (routePoints.length <= samples) return routePoints;

  const result: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < samples; i += 1) {
    const ratio = i / (samples - 1);
    const index = Math.min(
      routePoints.length - 1,
      Math.max(0, Math.round(ratio * (routePoints.length - 1)))
    );
    result.push(routePoints[index]);
  }
  return result;
}

function computeElevationMetrics(
  elevations: number[],
  tripDistanceKm: number
): { totalElevationGainM: number; avgGradientPercent: number } {
  if (elevations.length < 2 || tripDistanceKm <= 0) {
    return { totalElevationGainM: 0, avgGradientPercent: 0 };
  }

  let totalGain = 0;
  for (let i = 1; i < elevations.length; i += 1) {
    const delta = elevations[i] - elevations[i - 1];
    if (delta > 0) {
      totalGain += delta;
    }
  }

  const avgGradientPercent = (totalGain / Math.max(1, tripDistanceKm * 1000)) * 100;
  return {
    totalElevationGainM: Number(totalGain.toFixed(1)),
    avgGradientPercent: Number(avgGradientPercent.toFixed(3)),
  };
}

async function fetchElevationMetrics(
  sampledPoints: Array<{ lat: number; lng: number }>,
  tripDistanceKm: number
): Promise<{ totalElevationGainM: number; avgGradientPercent: number }> {
  if (sampledPoints.length < 2) {
    return { totalElevationGainM: 0, avgGradientPercent: 0 };
  }

  try {
    const latitude = sampledPoints.map((point) => point.lat.toFixed(6)).join(',');
    const longitude = sampledPoints.map((point) => point.lng.toFixed(6)).join(',');
    const response = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`,
      { method: 'GET', cache: 'no-store' }
    );
    if (!response.ok) {
      return { totalElevationGainM: 0, avgGradientPercent: 0 };
    }
    const data = (await response.json()) as { elevation?: number[] };
    const elevations = Array.isArray(data.elevation)
      ? data.elevation.filter((value) => Number.isFinite(value))
      : [];
    return computeElevationMetrics(elevations, tripDistanceKm);
  } catch {
    return { totalElevationGainM: 0, avgGradientPercent: 0 };
  }
}

async function fetchWeatherMetrics(
  midpoint: { lat: number; lng: number }
): Promise<{ temperatureC: number; windSpeedKmh: number; precipitationMm: number }> {
  try {
    const params = new URLSearchParams({
      latitude: midpoint.lat.toFixed(6),
      longitude: midpoint.lng.toFixed(6),
      current: 'temperature_2m,wind_speed_10m,precipitation',
      timezone: 'auto',
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) {
      return {
        temperatureC: DEFAULT_ENVIRONMENT.temperatureC,
        windSpeedKmh: DEFAULT_ENVIRONMENT.windSpeedKmh,
        precipitationMm: DEFAULT_ENVIRONMENT.precipitationMm,
      };
    }

    const data = (await response.json()) as {
      current?: {
        temperature_2m?: number;
        wind_speed_10m?: number;
        precipitation?: number;
      };
    };

    const temperatureC = Number(data.current?.temperature_2m);
    const windSpeedKmh = Number(data.current?.wind_speed_10m);
    const precipitationMm = Number(data.current?.precipitation);

    return {
      temperatureC: Number.isFinite(temperatureC)
        ? temperatureC
        : DEFAULT_ENVIRONMENT.temperatureC,
      windSpeedKmh: Number.isFinite(windSpeedKmh)
        ? windSpeedKmh
        : DEFAULT_ENVIRONMENT.windSpeedKmh,
      precipitationMm: Number.isFinite(precipitationMm)
        ? precipitationMm
        : DEFAULT_ENVIRONMENT.precipitationMm,
    };
  } catch {
    return {
      temperatureC: DEFAULT_ENVIRONMENT.temperatureC,
      windSpeedKmh: DEFAULT_ENVIRONMENT.windSpeedKmh,
      precipitationMm: DEFAULT_ENVIRONMENT.precipitationMm,
    };
  }
}

export async function fetchRouteEnvironment(
  route: RouteTrafficMetrics
): Promise<RouteEnvironmentMetrics> {
  const routePoints = route.polyline ? decodePolyline(route.polyline) : [];
  if (routePoints.length === 0) {
    return DEFAULT_ENVIRONMENT;
  }

  const sampledPoints = sampleRoutePoints(routePoints);
  const midpoint = sampledPoints[Math.floor(sampledPoints.length / 2)] || route.origin;

  const [elevation, weather] = await Promise.all([
    fetchElevationMetrics(sampledPoints, route.distanceKm),
    fetchWeatherMetrics(midpoint),
  ]);

  return {
    totalElevationGainM: elevation.totalElevationGainM,
    avgGradientPercent: elevation.avgGradientPercent,
    temperatureC: weather.temperatureC,
    windSpeedKmh: weather.windSpeedKmh,
    precipitationMm: weather.precipitationMm,
  };
}
