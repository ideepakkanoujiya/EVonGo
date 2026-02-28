import type {
  EVChargingStationCandidate,
  RouteTrafficMetrics,
  TrafficRangeResponse,
  VehicleSpecs,
} from '@/lib/planner/types';

type OpenChargeMapStation = {
  ID: number;
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Latitude?: number;
    Longitude?: number;
  };
  Connections?: Array<{
    PowerKW?: number;
    ConnectionType?: { Title?: string };
  }>;
};

const EARTH_RADIUS_KM = 6371;
const MIN_FAST_CHARGING_POWER_KW = 10;
const RELAXED_MIN_CHARGING_POWER_KW = 3;
const DEFAULT_COUNTRY_CODE = 'IN';
const ARRIVAL_RESERVE_PERCENT = 8;
const TARGET_CHARGE_PERCENT = 80;
const MAX_CHARGE_PERCENT = 100;
const LEG_RECOMMENDATIONS = 3;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const angle =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(angle));
}

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

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

function routeProgressRatio(
  routePoints: Array<{ lat: number; lng: number }>,
  point: { lat: number; lng: number }
): number {
  let minDistance = Number.POSITIVE_INFINITY;
  let bestIndex = 0;

  routePoints.forEach((routePoint, index) => {
    const dist = haversineKm(routePoint.lat, routePoint.lng, point.lat, point.lng);
    if (dist < minDistance) {
      minDistance = dist;
      bestIndex = index;
    }
  });

  if (routePoints.length <= 1) return 0;
  return bestIndex / (routePoints.length - 1);
}

function minDistanceToRouteKm(
  routePoints: Array<{ lat: number; lng: number }>,
  point: { lat: number; lng: number }
): number {
  return routePoints.reduce((min, routePoint) => {
    const dist = haversineKm(routePoint.lat, routePoint.lng, point.lat, point.lng);
    return Math.min(min, dist);
  }, Number.POSITIVE_INFINITY);
}

function buildMapsAddress(station: OpenChargeMapStation): string {
  return station.AddressInfo?.AddressLine1 || 'Address unavailable';
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 1;
  return (value - min) / (max - min);
}

function getPreferredPower(connections: OpenChargeMapStation['Connections']): number {
  if (!connections || connections.length === 0) return 0;
  return Math.max(...connections.map((connection) => connection.PowerKW || 0));
}

function getConnectorLabel(connections: OpenChargeMapStation['Connections']): string {
  const label = connections?.find((connection) => connection.ConnectionType?.Title)?.ConnectionType
    ?.Title;
  return label || 'Unknown';
}

function normalizeConnectorLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function connectorFamilies(value: string): string[] {
  const normalized = normalizeConnectorLabel(value);
  const families = new Set<string>();

  if (
    normalized.includes('ccs') ||
    normalized.includes('combo') ||
    normalized.includes('iec621963configurationff')
  ) {
    families.add('ccs');
  }
  if (
    normalized.includes('type2') ||
    normalized.includes('mennekes') ||
    normalized.includes('iec621962')
  ) {
    families.add('type2');
  }
  if (normalized.includes('chademo')) {
    families.add('chademo');
  }
  if (normalized.includes('gbt') || normalized.includes('gbtac') || normalized.includes('gbtdc')) {
    families.add('gbt');
  }
  if (normalized.includes('tesla') || normalized.includes('nacs')) {
    families.add('tesla');
  }
  if (
    normalized.includes('j1772') ||
    normalized.includes('saej1772') ||
    normalized.includes('type1')
  ) {
    families.add('j1772');
  }

  if (families.size === 0 && normalized) {
    families.add(normalized);
  }

  return Array.from(families);
}

function isCompatibleConnector(label: string, vehicleConnector?: string): boolean {
  if (!vehicleConnector) return true;
  const source = normalizeConnectorLabel(label);
  const target = normalizeConnectorLabel(vehicleConnector);
  if (!target) return true;
  if (source.includes(target) || target.includes(source)) return true;

  const sourceFamilies = connectorFamilies(label);
  const targetFamilies = connectorFamilies(vehicleConnector);
  return sourceFamilies.some((family) => targetFamilies.includes(family));
}

function pickSearchPoints(
  routePoints: Array<{ lat: number; lng: number }>,
  fallbackOrigin: { lat: number; lng: number },
  fallbackDestination: { lat: number; lng: number }
): Array<{ lat: number; lng: number }> {
  if (routePoints.length === 0) {
    return [fallbackOrigin, fallbackDestination];
  }

  const indexes = Array.from({ length: 21 }, (_, i) => i / 20).map((ratio) =>
    Math.min(routePoints.length - 1, Math.max(0, Math.round((routePoints.length - 1) * ratio)))
  );

  const points = indexes.map((index) => routePoints[index]);
  const unique = new Map<string, { lat: number; lng: number }>();
  points.forEach((point) => {
    unique.set(`${point.lat.toFixed(4)},${point.lng.toFixed(4)}`, point);
  });
  return Array.from(unique.values());
}

export async function fetchStationsNearRoute(
  route: RouteTrafficMetrics
): Promise<OpenChargeMapStation[]> {
  const apiKey = process.env.OPENCHARGEMAP_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENCHARGEMAP_API_KEY. Add it to your .env.local file.');
  }
  const countryCode = process.env.OPENCHARGEMAP_COUNTRY_CODE || DEFAULT_COUNTRY_CODE;
  const routePoints = route.polyline ? decodePolyline(route.polyline) : [];
  const searchPoints = pickSearchPoints(routePoints, route.origin, route.destination);
  const radiusKm = Math.min(90, Math.max(30, Math.ceil(route.distanceKm * 0.12)));
  const headers: HeadersInit = { 'X-API-Key': apiKey };

  const queryStations = async (
    distanceKm: number,
    includeCountryFilter: boolean
  ): Promise<OpenChargeMapStation[]> => {
    const stationGroups = await Promise.all(
      searchPoints.map(async (point) => {
        const params = new URLSearchParams({
          output: 'json',
          maxresults: '100',
          compact: 'true',
          verbose: 'false',
          latitude: String(point.lat),
          longitude: String(point.lng),
          distance: String(distanceKm),
          distanceunit: 'KM',
          key: apiKey,
        });
        if (includeCountryFilter && countryCode) {
          params.set('countrycode', countryCode);
        }

        const response = await fetch(
          `https://api.openchargemap.io/v3/poi/?${params.toString()}`,
          {
            method: 'GET',
            headers,
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          throw new Error(`Charging station lookup failed with status ${response.status}`);
        }

        return (await response.json()) as OpenChargeMapStation[];
      })
    );

    return stationGroups.flat();
  };

  const primaryStations = await queryStations(radiusKm, true);

  const unique = new Map<number, OpenChargeMapStation>();
  primaryStations.forEach((station) => {
    unique.set(station.ID, station);
  });

  if (unique.size < 120) {
    const fallbackStations = await queryStations(Math.min(130, radiusKm + 35), false);
    fallbackStations.forEach((station) => {
      unique.set(station.ID, station);
    });
  }

  // Sparse-route fallback: expand search further without country filter
  if (unique.size < 40) {
    const expandedStations = await queryStations(
      Math.min(220, Math.max(90, radiusKm + 90)),
      false
    );
    expandedStations.forEach((station) => {
      unique.set(station.ID, station);
    });
  }

  return Array.from(unique.values());
}

export function selectOptimalChargingStops(
  route: RouteTrafficMetrics,
  range: TrafficRangeResponse,
  vehicle: VehicleSpecs,
  stations: OpenChargeMapStation[],
  currentBatteryPercent: number
): { stops: EVChargingStationCandidate[]; chargingTimeMinutesNeeded: number; detourKm: number } {
  const routePoints = route.polyline ? decodePolyline(route.polyline) : [];
  if (routePoints.length === 0) {
    return { stops: [], chargingTimeMinutesNeeded: 0, detourKm: 0 };
  }

  const maxDetourKm = Math.min(60, Math.max(15, route.distanceKm * 0.12));
  const relaxedMaxDetourKm = Math.min(140, Math.max(35, route.distanceKm * 0.3));

  const rawCandidates: EVChargingStationCandidate[] = stations
    .map((station) => {
      const lat = station.AddressInfo?.Latitude;
      const lng = station.AddressInfo?.Longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') return null;

      const powerKw = getPreferredPower(station.Connections);
      const connectorType = getConnectorLabel(station.Connections);

      const detourKm = minDistanceToRouteKm(routePoints, { lat, lng });

      const progressRatio = routeProgressRatio(routePoints, { lat, lng });
      return {
        id: String(station.ID),
        name: station.AddressInfo?.Title || 'Charging Station',
        address: buildMapsAddress(station),
        lat,
        lng,
        powerKw,
        connectorType,
        detourKm: Number(detourKm.toFixed(2)),
        progressRatio: Number(progressRatio.toFixed(3)),
        score: 0,
        estimatedBatteryAtArrivalPercent: 0,
        recommended: false,
        recommendation: '',
      };
    })
    .filter((station): station is EVChargingStationCandidate => Boolean(station));

  let relaxedMode = false;
  let candidates = rawCandidates.filter(
    (candidate) =>
      candidate.powerKw >= MIN_FAST_CHARGING_POWER_KW && candidate.detourKm <= maxDetourKm
  );

  if (candidates.length === 0) {
    candidates = rawCandidates.filter(
      (candidate) =>
        candidate.powerKw >= RELAXED_MIN_CHARGING_POWER_KW &&
        candidate.detourKm <= relaxedMaxDetourKm
    );
    relaxedMode = candidates.length > 0;
  }

  if (candidates.length === 0) {
    candidates = rawCandidates
      .filter((candidate) => candidate.powerKw > 0)
      .sort((a, b) => a.detourKm - b.detourKm)
      .slice(0, 20);
    relaxedMode = candidates.length > 0;
  }

  if (candidates.length === 0) {
    return { stops: [], chargingTimeMinutesNeeded: 0, detourKm: 0 };
  }

  const detourValues = candidates.map((candidate) => candidate.detourKm);
  const powerValues = candidates.map((candidate) => candidate.powerKw);

  const minDetour = Math.min(...detourValues);
  const maxDetour = Math.max(...detourValues);
  const minPower = Math.min(...powerValues);
  const maxPower = Math.max(...powerValues);

  const scored = candidates
    .map((candidate) => {
      const detourScore = 1 - normalize(candidate.detourKm, minDetour, maxDetour);
      const powerScore = normalize(candidate.powerKw, minPower, maxPower);
      const progressDistanceFromTarget = Math.abs(candidate.progressRatio - 0.5);
      const targetProgressScore = 1 - Math.min(1, progressDistanceFromTarget / 0.5);
      const connectorCompatibilityScore = isCompatibleConnector(
        candidate.connectorType,
        vehicle.connectorType
      )
        ? 1
        : 0;

      const score =
        0.35 * detourScore +
        0.3 * powerScore +
        0.2 * targetProgressScore +
        0.15 * connectorCompatibilityScore;
      return {
        ...candidate,
        score: Number(score.toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score);

  const effectiveBatteryCapacityWh = Math.max(1000, vehicle.battery_capacity_kWh * 1000);
  const consumptionWhPerKm = Math.max(1, range.consumptionWhPerKm);
  const routeDistanceKm = Math.max(1, route.distanceKm);

  const orderedByProgress = [...scored]
    .sort((a, b) => a.progressRatio - b.progressRatio);

  const baselineStations = orderedByProgress.map((station) => {
    const distanceToStationKm = route.distanceKm * station.progressRatio;
    const consumedPercent =
      (distanceToStationKm * consumptionWhPerKm * 100) /
      effectiveBatteryCapacityWh;
    const estimatedBatteryAtArrivalPercent = Math.max(
      0,
      currentBatteryPercent - consumedPercent
    );

    return {
      ...station,
      estimatedBatteryAtArrivalPercent: Number(estimatedBatteryAtArrivalPercent.toFixed(1)),
      recommended: false,
      recommendation: '',
    };
  });

  const recommendedById = new Map<
    string,
    { estimatedBatteryAtArrivalPercent: number; recommendation: string }
  >();
  let totalChargingMinutes = 0;
  let totalRecommendedDetourKm = 0;

  if (!range.canReachDestination) {
    let currentProgress = 0;
    let currentBattery = currentBatteryPercent;
    const selectedStationIds = new Set<string>();
    let guard = 0;

    while (guard < 20) {
      guard += 1;
      const reachableKm =
        ((Math.max(0, currentBattery - ARRIVAL_RESERVE_PERCENT) / 100) *
          effectiveBatteryCapacityWh) /
        consumptionWhPerKm;
      const reachableProgress = currentProgress + reachableKm / routeDistanceKm;
      if (reachableProgress >= 1) {
        break;
      }

      const reachableCandidates = baselineStations.filter(
        (station) =>
          !selectedStationIds.has(station.id) &&
          station.progressRatio > currentProgress + 0.01 &&
          station.progressRatio <= Math.min(0.99, reachableProgress)
      );

      if (reachableCandidates.length === 0) {
        const aheadCandidates = baselineStations
          .filter(
            (station) =>
              !selectedStationIds.has(station.id) &&
              station.progressRatio > currentProgress + 0.01
          )
          .sort((a, b) => a.progressRatio - b.progressRatio)
          .slice(0, LEG_RECOMMENDATIONS);

        aheadCandidates.forEach((candidate, index) => {
          const legDistanceKm = routeDistanceKm * (candidate.progressRatio - currentProgress);
          const consumptionPercent =
            (legDistanceKm * consumptionWhPerKm * 100) / effectiveBatteryCapacityWh;
          const batteryAtArrival = Math.max(0, currentBattery - consumptionPercent);
          const existing = recommendedById.get(candidate.id);
          if (!existing) {
            recommendedById.set(candidate.id, {
              estimatedBatteryAtArrivalPercent: Number(batteryAtArrival.toFixed(1)),
              recommendation:
                index === 0
                  ? 'Next possible stop ahead; charge more at previous stop to reach it'
                  : 'Alternative stop ahead; may need higher charge before this leg',
            });
          }
        });
        break;
      }

      const rankedCandidates = [...reachableCandidates].sort((a, b) => {
        if (b.progressRatio !== a.progressRatio) return b.progressRatio - a.progressRatio;
        if (b.powerKw !== a.powerKw) return b.powerKw - a.powerKw;
        if (b.score !== a.score) return b.score - a.score;
        return a.detourKm - b.detourKm;
      });
      const selected = rankedCandidates[0];
      selectedStationIds.add(selected.id);

      const legAlternatives = rankedCandidates.slice(0, LEG_RECOMMENDATIONS);

      const legDistanceKm = routeDistanceKm * (selected.progressRatio - currentProgress);
      const legConsumptionPercent =
        (legDistanceKm * consumptionWhPerKm * 100) / effectiveBatteryCapacityWh;
      const batteryAtArrival = Math.max(0, currentBattery - legConsumptionPercent);
      const remainingDistanceKm = routeDistanceKm * (1 - selected.progressRatio);
      const requiredPercentForDestination =
        ARRIVAL_RESERVE_PERCENT +
        (remainingDistanceKm * consumptionWhPerKm * 100) / effectiveBatteryCapacityWh;
      const targetChargePercent = Math.max(
        TARGET_CHARGE_PERCENT,
        Math.min(
          MAX_CHARGE_PERCENT,
          Math.max(requiredPercentForDestination + 5, batteryAtArrival + 20)
        )
      );
      const addedWh =
        ((targetChargePercent - batteryAtArrival) / 100) * effectiveBatteryCapacityWh;
      const chargingPowerW = Math.max(30000, selected.powerKw * 1000 * 0.88);
      const chargingMinutes = Math.max(1, Math.ceil((addedWh / chargingPowerW) * 60));
      legAlternatives.forEach((candidate, candidateIndex) => {
        const alternativeLegDistanceKm =
          routeDistanceKm * (candidate.progressRatio - currentProgress);
        const alternativeConsumptionPercent =
          (alternativeLegDistanceKm * consumptionWhPerKm * 100) / effectiveBatteryCapacityWh;
        const alternativeArrival = Math.max(0, currentBattery - alternativeConsumptionPercent);
        const alternativeCompatible = isCompatibleConnector(
          candidate.connectorType,
          vehicle.connectorType
        );

        const recommendation =
          candidateIndex === 0
            ? alternativeCompatible
              ? `Primary stop: charge to ~${Math.round(targetChargePercent)}% to safely continue`
              : `Primary stop: charge to ~${Math.round(
                  targetChargePercent
                )}% (verify connector compatibility)`
            : alternativeCompatible
              ? `Backup stop ${candidateIndex}: use if preferred station is busy`
              : `Backup stop ${candidateIndex}: verify connector compatibility`;

        const existing = recommendedById.get(candidate.id);
        const shouldReplace =
          !existing ||
          (existing.recommendation.startsWith('Backup') &&
            !recommendation.startsWith('Backup'));

        if (shouldReplace) {
          recommendedById.set(candidate.id, {
            estimatedBatteryAtArrivalPercent: Number(alternativeArrival.toFixed(1)),
            recommendation,
          });
        }
      });

      totalChargingMinutes += chargingMinutes;
      totalRecommendedDetourKm += selected.detourKm;
      currentProgress = selected.progressRatio;
      currentBattery = targetChargePercent;

      const postChargeReachableKm =
        ((Math.max(0, currentBattery - ARRIVAL_RESERVE_PERCENT) / 100) *
          effectiveBatteryCapacityWh) /
        consumptionWhPerKm;
      const postChargeReachableProgress = currentProgress + postChargeReachableKm / routeDistanceKm;
      if (postChargeReachableProgress >= 1) {
        break;
      }
    }
  }

  if (!range.canReachDestination && recommendedById.size === 0 && baselineStations.length > 0) {
    const fallback = baselineStations
      .filter((station) => station.estimatedBatteryAtArrivalPercent >= ARRIVAL_RESERVE_PERCENT)
      .sort((a, b) => b.score - a.score)[0] || baselineStations[0];
    recommendedById.set(fallback.id, {
      estimatedBatteryAtArrivalPercent: fallback.estimatedBatteryAtArrivalPercent,
      recommendation:
        'Best feasible charging stop found; add an additional stop after charging',
    });
    totalRecommendedDetourKm = fallback.detourKm;
  }

  const enriched = baselineStations.map((station) => {
    const planned = recommendedById.get(station.id);
    if (!planned) {
      return station;
    }
    return {
      ...station,
      recommended: true,
      estimatedBatteryAtArrivalPercent: planned.estimatedBatteryAtArrivalPercent,
      recommendation: planned.recommendation,
    };
  });

  if (range.canReachDestination && enriched.length > 0) {
    const optional =
      [...enriched]
      .filter((station) => station.progressRatio >= 0.3 && station.progressRatio <= 0.8)
      .sort((a, b) => b.score - a.score)[0] ||
      [...enriched].sort((a, b) => b.score - a.score)[0];
    if (optional) {
      optional.recommended = true;
      optional.recommendation = relaxedMode
        ? 'Suggested stop in sparse coverage area'
        : 'Optional top-up stop for safer reserve';
      recommendedById.set(optional.id, {
        estimatedBatteryAtArrivalPercent: optional.estimatedBatteryAtArrivalPercent,
        recommendation: optional.recommendation,
      });
      totalRecommendedDetourKm = optional.detourKm;
    }
  }

  const resultStops = enriched.slice(0, 20);
  const chargingTimeMinutesNeeded = range.canReachDestination ? 0 : totalChargingMinutes;
  const detourKm =
    recommendedById.size > 0
      ? Number(totalRecommendedDetourKm.toFixed(2))
      : Number((resultStops[0]?.detourKm || 0).toFixed(2));

  return {
    stops: resultStops,
    chargingTimeMinutesNeeded,
    detourKm,
  };
}
