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
const REQUEST_TIMEOUT_MS = 5000;
const NO_TRAFFIC_CONGESTION_THRESHOLD = 0.05;
const LOW_TRAFFIC_CONGESTION_THRESHOLD = 0.2;

const TRAFFIC_RANGE_FACTORS = {
  no_traffic: 1.15,
  low_traffic: 1.1,
  high_traffic: 0.7,
} as const;

// Safety buffers
const MIN_CONFIDENCE_SCORE = 0.5;
const MAX_CONFIDENCE_SCORE = 0.99;
const FALLBACK_SAFETY_BUFFER = 0.90; // 10% buffer if ML fails
const MIN_EFFICIENCY_WH_PER_KM = 60;
const MAX_EFFICIENCY_WH_PER_KM = 400;

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
  route: RouteTrafficMetrics
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
  };
}

/* -------------------------------------------------- */
/* Physics & Adjustment Logic                         */
/* -------------------------------------------------- */

interface AdjustmentFactors {
  trafficCondition: 'no_traffic' | 'low_traffic' | 'high_traffic';
  trafficRangeFactor: number;
  trafficMultiplier: number;
  speedMultiplier: number;
  performanceMultiplier: number;
  adjustedConsumptionWhPerKm: number;
}

function resolveTrafficCondition(congestionFactor: number): {
  trafficCondition: 'no_traffic' | 'low_traffic' | 'high_traffic';
  trafficRangeFactor: number;
} {
  if (congestionFactor < NO_TRAFFIC_CONGESTION_THRESHOLD) {
    return {
      trafficCondition: 'no_traffic',
      trafficRangeFactor: TRAFFIC_RANGE_FACTORS.no_traffic,
    };
  }

  if (congestionFactor < LOW_TRAFFIC_CONGESTION_THRESHOLD) {
    return {
      trafficCondition: 'low_traffic',
      trafficRangeFactor: TRAFFIC_RANGE_FACTORS.low_traffic,
    };
  }

  return {
    trafficCondition: 'high_traffic',
    trafficRangeFactor: TRAFFIC_RANGE_FACTORS.high_traffic,
  };
}

/**
 * Calculates dynamic multipliers used by both ML and fallback paths.
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
  } = payload;

  // 1. Traffic condition factor based on live congestion.
  const congestion = clamp(congestion_factor, 0, 5);
  const { trafficCondition, trafficRangeFactor } = resolveTrafficCondition(congestion);
  const trafficMultiplier = 1 / trafficRangeFactor;

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

  // 4. Global Clamp
  // Prevent unrealistic multipliers (e.g., 5x consumption)
  const totalMultiplier = clamp(
    trafficMultiplier * speedMultiplier * performanceMultiplier,
    0.7,
    2.5
  );

  const adjustedConsumptionWhPerKm = baseConsumptionWhPerKm * totalMultiplier;

  return {
    trafficCondition,
    trafficRangeFactor,
    trafficMultiplier,
    speedMultiplier,
    performanceMultiplier,
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
  const fullBatteryEnergyWh = payload.battery_capacity_kWh * 1000;
  const availableEnergyWh = payload.battery_capacity_kWh * 1000 * (batteryPercent / 100);
  
  // 2. Attempt ML Prediction
  let mlRange = 0;
  let confidenceScore = 0;
  let modelUsed = 'fallback';
  const manualConsumptionWhPerKm = clamp(
    payload.efficiency_wh_per_km,
    MIN_EFFICIENCY_WH_PER_KM,
    MAX_EFFICIENCY_WH_PER_KM
  );
  let baseConsumptionWhPerKm = manualConsumptionWhPerKm;

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

        // Blend the ML-derived nominal consumption with the user-entered
        // efficiency so manual planner edits always affect the output.
        const mlConsumptionWhPerKm = clamp(
          fullBatteryEnergyWh / mlRange,
          MIN_EFFICIENCY_WH_PER_KM,
          MAX_EFFICIENCY_WH_PER_KM
        );
        const mlWeight = clamp(0.35 + confidenceScore * 0.35, 0.4, 0.7);
        baseConsumptionWhPerKm =
          manualConsumptionWhPerKm * (1 - mlWeight) +
          mlConsumptionWhPerKm * mlWeight;
        modelUsed = `${modelUsed}-blended`;
      }
    }
  } catch (error) {
    console.warn('ML Service unavailable, using fallback physics model', error);
  }

  // 3. Apply planner-side traffic/speed/performance adjustments
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
    trafficCondition: factors.trafficCondition,
    trafficRangeFactor: factors.trafficRangeFactor,
    speedPenaltyPercent: Number(((factors.speedMultiplier - 1) * 100).toFixed(2)),
    trafficPenaltyPercent: Number(
      ((factors.trafficMultiplier * factors.performanceMultiplier - 1) * 100).toFixed(2)
    ),
    elevationPenaltyPercent: 0,
    weatherPenaltyPercent: 0,
    canReachDestination: effectiveRangeKm >= distanceKm,
    estimatedBatteryLeftPercent: Number(batteryLeftPercent.toFixed(1)),
    consumptionWhPerKm: Number(factors.adjustedConsumptionWhPerKm.toFixed(2)),
    confidenceScore: Number(confidenceScore.toFixed(3)),
    modelUsed,
  };
}
