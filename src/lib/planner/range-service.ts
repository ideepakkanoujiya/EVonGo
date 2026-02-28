import type {
  PlannerAnalyzeRequest,
  RouteTrafficMetrics,
  TrafficRangeRequest,
  TrafficRangeResponse,
  VehicleSpecs,
} from '@/lib/planner/types';

/* -------------------------------------------------- */
/* Configuration & Constants                          */
/* -------------------------------------------------- */

const DEFAULT_CONNECTOR = 'CCS2';
const DEFAULT_MASS_BASE_KG = 1500; // Base chassis weight
const MASS_PER_KWH_KG = 45;        // Approx weight added per kWh of battery
const GRAVITY_MS2 = 9.81;
const JOULES_TO_WH = 3600;
const REQUEST_TIMEOUT_MS = 5000;

// Safety buffers
const MIN_CONFIDENCE_SCORE = 0.5;
const MAX_CONFIDENCE_SCORE = 0.99;
const FALLBACK_SAFETY_BUFFER = 0.90; // 10% buffer if ML fails

/* -------------------------------------------------- */
/* Utility Helpers                                    */
/* -------------------------------------------------- */

function getMlServiceUrl(): string {
  return (
    process.env.ML_SERVICE_URL ||
    process.env.NEXT_PUBLIC_ML_SERVICE_URL ||
    'http://localhost:5000'
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Estimates vehicle mass based on battery size.
 * EVs are heavily correlated with battery weight.
 */
function estimateVehicleMassKg(batteryCapacityKwh: number): number {
  return DEFAULT_MASS_BASE_KG + (batteryCapacityKwh * MASS_PER_KWH_KG);
}

/**
 * Performs a fetch request with a timeout.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* -------------------------------------------------- */
/* Vehicle Resolution                                 */
/* -------------------------------------------------- */

export async function resolveVehicleSpecs(
  vehicle: VehicleSpecs
): Promise<VehicleSpecs> {
  // 1. Validate existing data first
  const hasCapacity = !!vehicle.battery_capacity_kWh && vehicle.battery_capacity_kWh > 0;
  const hasEfficiency = !!vehicle.efficiency_wh_per_km && vehicle.efficiency_wh_per_km > 0;

  if (hasCapacity && hasEfficiency) {
    return {
      ...vehicle,
      connectorType: vehicle.connectorType || DEFAULT_CONNECTOR,
    };
  }

  // 2. Fetch missing data
  const model = vehicle.evModel?.trim();
  if (!model) throw new Error('EV model is required when specs are missing');

  const baseUrl = getMlServiceUrl();
  let response: Response;

  try {
    response = await fetchWithTimeout(
      `${baseUrl}/search-vehicles?model=${encodeURIComponent(model)}&maxRange=2000`,
      { method: 'GET', cache: 'no-store' }
    );
  } catch (error) {
    console.error('Vehicle spec lookup failed:', error);
    throw new Error('Failed to connect to vehicle database');
  }

  if (!response.ok) throw new Error('Failed to fetch vehicle specs');

  const data = await response.json();
  const matched = data?.vehicles?.[0];

  if (!matched) throw new Error(`No vehicle found for model: ${model}`);

  return {
    ...vehicle,
    battery_capacity_kWh: matched.battery_capacity_kWh || vehicle.battery_capacity_kWh,
    efficiency_wh_per_km: matched.efficiency_wh_per_km || vehicle.efficiency_wh_per_km,
    torque_nm: matched.torque_nm || vehicle.torque_nm,
    top_speed_kmh: matched.top_speed_kmh || vehicle.top_speed_kmh,
    connectorType: vehicle.connectorType || DEFAULT_CONNECTOR,
  };
}

/* -------------------------------------------------- */
/* Payload Builder                                    */
/* -------------------------------------------------- */

export function buildTrafficRangePayload(
  request: PlannerAnalyzeRequest,
  route: RouteTrafficMetrics,
  environment?: {
    totalElevationGainM?: number;
    avgGradientPercent?: number;
    temperatureC?: number;
    windSpeedKmh?: number;
    precipitationMm?: number;
  }
): TrafficRangeRequest {
  return {
    battery_capacity_kWh: request.vehicle.battery_capacity_kWh || 0,
    efficiency_wh_per_km: request.vehicle.efficiency_wh_per_km || 180, // Default safe efficiency
    torque_nm: request.vehicle.torque_nm || 300,
    top_speed_kmh: request.vehicle.top_speed_kmh || 160,
    battery_percent: clamp(request.batteryPercent, 0, 100),
    avg_speed: clamp(route.avgSpeedKmh, 0, 200),
    congestion_factor: clamp(route.congestionRatio, 0, 5), // Allow higher congestion
    trip_distance_km: Math.max(0.1, route.distanceKm), // Prevent div by zero
    total_elevation_gain_m: Number(environment?.totalElevationGainM ?? 0),
    avg_gradient_percent: Number(environment?.avgGradientPercent ?? 0),
    temperature_c: Number(environment?.temperatureC ?? 20),
    wind_speed_kmh: Number(environment?.windSpeedKmh ?? 0),
    precipitation_mm: Number(environment?.precipitationMm ?? 0),
  };
}

/* -------------------------------------------------- */
/* Physics & Adjustment Logic                         */
/* -------------------------------------------------- */

interface AdjustmentFactors {
  trafficMultiplier: number;
  speedMultiplier: number;
  performanceMultiplier: number;
  elevationMultiplier: number;
  weatherMultiplier: number;
  totalMultiplier: number;
  adjustedConsumptionWhPerKm: number;
}

/**
 * Calculates all environmental and dynamic multipliers.
 * Used by both ML and Fallback paths to ensure consistency.
 */
function calculateAdjustmentFactors(
  payload: TrafficRangeRequest,
  baseConsumptionWhPerKm: number
): AdjustmentFactors {
  const {
    avg_speed,
    congestion_factor,
    torque_nm,
    top_speed_kmh,
    total_elevation_gain_m,
    trip_distance_km,
    temperature_c,
    wind_speed_kmh,
    precipitation_mm,
    battery_capacity_kWh,
  } = payload;

  // 1. Traffic (Stop/Start increases acceleration energy)
  // Congestion 0 = Free flow, 3 = Heavy stop/go
  const congestion = clamp(congestion_factor, 0, 5);
  const trafficMultiplier = 1 + 0.15 * Math.pow(congestion, 1.3);

  // 2. Speed (Aerodynamic Drag ~ v^2)
  // Reference speed 60km/h is typically optimal for EVs
  const speed = clamp(avg_speed, 1, 200);
  const referenceSpeed = 60;
  // Energy per km increases roughly with square of speed due to drag
  const speedRatio = speed / referenceSpeed;
  const speedMultiplier = 0.8 + (0.2 * Math.pow(speedRatio, 2)); 
  
  // 3. Performance (High torque usage at high speeds)
  const topSpeed = Math.max(100, top_speed_kmh);
  const performanceMultiplier =
    1 +
    Math.max(0, speed / topSpeed - 0.6) * 0.15 +
    Math.max(0, torque_nm / 1000 - 0.3) * 0.05;

  // 4. Elevation (Potential Energy: m * g * h)
  const vehicleMassKg = estimateVehicleMassKg(battery_capacity_kWh);
  const elevationEnergyWh =
    (vehicleMassKg * GRAVITY_MS2 * total_elevation_gain_m) / JOULES_TO_WH;
  
  // Convert total elevation energy to Wh/km over the trip distance
  // Guard against very short distances causing infinite multipliers
  const safeDistanceKm = Math.max(1, trip_distance_km);
  const elevationWhPerKm = elevationEnergyWh / safeDistanceKm;
  const elevationMultiplier = 1 + elevationWhPerKm / baseConsumptionWhPerKm;

  // 5. Weather (Temperature, Wind, Precipitation)
  // Temperature: Li-Ion efficiency drops sharply below 10C
  let tempFactor = 1;
  if (temperature_c < 10) {
    tempFactor = 1 + (10 - temperature_c) * 0.02; // 2% per degree below 10
  } else if (temperature_c > 35) {
    tempFactor = 1 + (temperature_c - 35) * 0.008; // Cooling overhead
  }

  // Wind: Headwind approximation (Drag ~ v^2)
  const windFactor = 1 + 0.0005 * Math.pow(Math.max(0, wind_speed_kmh), 2);

  // Precipitation: Rolling resistance increase
  const precipFactor = 1 + Math.min(0.15, precipitation_mm * 0.01);

  const weatherMultiplier = tempFactor * windFactor * precipFactor;

  // 6. Global Clamp
  // Prevent unrealistic multipliers (e.g., 5x consumption)
  const totalMultiplier = clamp(
    trafficMultiplier *
      speedMultiplier *
      performanceMultiplier *
      elevationMultiplier *
      weatherMultiplier,
    0.8, // EVs can regen on downhill, so < 1 is possible
    2.5  // Extreme conditions
  );

  const adjustedConsumptionWhPerKm = baseConsumptionWhPerKm * totalMultiplier;

  return {
    trafficMultiplier,
    speedMultiplier,
    performanceMultiplier,
    elevationMultiplier,
    weatherMultiplier,
    totalMultiplier,
    adjustedConsumptionWhPerKm,
  };
}

/* -------------------------------------------------- */
/* Core Prediction Logic                              */
/* -------------------------------------------------- */

export async function predictTrafficAdjustedRange(
  payload: TrafficRangeRequest
): Promise<TrafficRangeResponse> {
  const baseUrl = getMlServiceUrl();
  
  // 1. Calculate Available Energy
  const batteryPercent = clamp(payload.battery_percent, 0, 100);
  const availableEnergyWh = payload.battery_capacity_kWh * 1000 * (batteryPercent / 100);
  
  // 2. Attempt ML Prediction
  let mlRange = 0;
  let confidenceScore = 0;
  let modelUsed = 'fallback';
  let baseConsumptionWhPerKm = payload.efficiency_wh_per_km;

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/predict-range`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battery_capacity_kWh: payload.battery_capacity_kWh,
          efficiency_wh_per_km: payload.efficiency_wh_per_km,
          torque_nm: payload.torque_nm,
          top_speed_kmh: payload.top_speed_kmh,
          model_type: 'best',
        }),
        timeoutMs: REQUEST_TIMEOUT_MS,
      }
    );

    if (response.ok) {
      const data = await response.json();
      const predicted = 
        Number(data.predicted_range_km ?? data.prediction?.predicted_range_km ?? 0);
      
      if (predicted > 0 && Number.isFinite(predicted)) {
        mlRange = predicted;
        confidenceScore = clamp(
          Number(data.prediction?.confidence_score ?? 0.7),
          MIN_CONFIDENCE_SCORE,
          MAX_CONFIDENCE_SCORE
        );
        modelUsed = data.prediction?.model_used || 'ml-v1';
        
        // Derive base consumption from ML range for consistency
        baseConsumptionWhPerKm = availableEnergyWh / mlRange;
      }
    }
  } catch (error) {
    console.warn('ML Service unavailable, using fallback physics model', error);
  }

  // 3. Apply Physics/Environmental Adjustments
  // This function is now shared between ML and Fallback logic
  const factors = calculateAdjustmentFactors(payload, baseConsumptionWhPerKm);

  // 4. Calculate Final Metrics
  const adjustedRangeKm = availableEnergyWh / factors.adjustedConsumptionWhPerKm;
  
  // Apply safety buffer based on confidence
  const safetyBuffer = modelUsed === 'fallback' 
    ? FALLBACK_SAFETY_BUFFER 
    : (0.9 + (0.1 * confidenceScore));
    
  const effectiveRangeKm = adjustedRangeKm * safetyBuffer;

  const distanceKm = Math.max(0.1, payload.trip_distance_km);
  const energyRequiredWh = distanceKm * factors.adjustedConsumptionWhPerKm;
  const consumedPercent = (energyRequiredWh / (payload.battery_capacity_kWh * 1000)) * 100;
  const batteryLeftPercent = clamp(batteryPercent - consumedPercent, 0, 100);

  return {
    success: modelUsed !== 'fallback',
    baseRangeKm: Number((availableEnergyWh / baseConsumptionWhPerKm).toFixed(1)),
    trafficAdjustedRangeKm: Number(adjustedRangeKm.toFixed(1)),
    speedPenaltyPercent: Number(((factors.speedMultiplier - 1) * 100).toFixed(2)),
    trafficPenaltyPercent: Number(
      ((factors.trafficMultiplier * factors.performanceMultiplier - 1) * 100).toFixed(2)
    ),
    elevationPenaltyPercent: Number(((factors.elevationMultiplier - 1) * 100).toFixed(2)),
    weatherPenaltyPercent: Number(((factors.weatherMultiplier - 1) * 100).toFixed(2)),
    canReachDestination: effectiveRangeKm >= distanceKm,
    estimatedBatteryLeftPercent: Number(batteryLeftPercent.toFixed(1)),
    consumptionWhPerKm: Number(factors.adjustedConsumptionWhPerKm.toFixed(2)),
    confidenceScore: Number(confidenceScore.toFixed(3)),
    modelUsed,
  };
}