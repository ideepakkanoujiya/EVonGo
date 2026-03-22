export type LatLng = {
  lat: number;
  lng: number;
};

export type VehicleSpecs = {
  evModel: string;
  battery_capacity_kWh: number;
  efficiency_wh_per_km: number;
  torque_nm: number;
  top_speed_kmh: number;
  connectorType?: string;
  maxChargingPower_kW?: number; 
};

export type RouteTrafficMetrics = {
  routeIndex: number;
  summary: string;
  polyline: string;
  distanceMeters: number;
  durationSeconds: number;
  durationInTrafficSeconds: number;
  distanceKm: number;
  durationMinutes: number;
  durationInTrafficMinutes: number;
  avgSpeedKmh: number;
  congestionRatio: number;
  origin: LatLng;
  destination: LatLng;
};

export type TrafficRangeRequest = {
  battery_capacity_kWh: number;
  efficiency_wh_per_km: number;
  torque_nm: number;
  top_speed_kmh: number;
  battery_percent: number;
  avg_speed: number;
  congestion_factor: number;
  trip_distance_km: number;
  total_elevation_gain_m: number;
  avg_gradient_percent: number;
  temperature_c: number;
  wind_speed_kmh: number;
  precipitation_mm: number;
};

export type TrafficRangeResponse = {
  success: boolean;
  baseRangeKm: number;
  trafficAdjustedRangeKm: number;
  speedPenaltyPercent: number;
  trafficPenaltyPercent: number;
  elevationPenaltyPercent: number;
  weatherPenaltyPercent: number;
  canReachDestination: boolean;
  estimatedBatteryLeftPercent: number;
  consumptionWhPerKm: number;
  confidenceScore: number;
  modelUsed: string;
};

export type ChargingStationCandidate = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  powerKw: number;
  connectorType: string;
  detourKm: number;
  progressRatio: number;
  score: number;
  estimatedBatteryAtArrivalPercent: number;
  recommended: boolean;
  recommendation: string;
};

export type EVChargingStationCandidate = ChargingStationCandidate;

export type PlannerAnalyzeRequest = {
  origin: string;
  destination: string;
  batteryPercent: number;
  vehicle: VehicleSpecs;
  alternatives?: boolean;
};

export type EVChargingStation = {
  id: string;
  name: string;
  location: LatLng;
  distanceFromRouteMeters: number;
  connectorTypes: string[];
  power_kW?: number;
};

export type ChargingStop = {
  stopIndex: number;
  station: EVChargingStation;
  distanceFromPreviousStopKm: number;
  arrivalBatteryPercent: number;
  departureBatteryPercent: number;
  energyAdded_kWh: number;
  chargingDurationMinutes: number;
  estimatedArrivalTime?: string;
};

export type EVChargingRecommendation = {
  needed: boolean;
  reason?: string;
  station?: EVChargingStation;
  stations?: EVChargingStation[];
  chargingStops: ChargingStop[];
  suggestedChargingStops?: ChargingStop[];
  arrivalBatteryPercent: number;
  targetBatteryPercent: number;
  chargingDurationMinutes: number;
  totalChargingDurationMinutes: number;
  energyToCharge_kWh: number;
  totalEnergyToCharge_kWh: number;
  canReachDestination: boolean;
  numberOfStops: number;
};

export type EVRouteAnalysis = {
  metrics: RouteTrafficMetrics[];
  evAnalysis: {
    maxRangeKm: number;
    currentRangeKm: number;
    consumptionPerKm: number;
    recommendation: EVChargingRecommendation;
  };
};

export type PlannerAnalyzeResponse = {
  success: boolean;
  selectedRoute: RouteTrafficMetrics;
  routeScore: number;
  range: TrafficRangeResponse;
  chargingStops: ChargingStationCandidate[];
  chargingTimeMinutesNeeded: number;
  routeMapUrl: string;
  diagnostics: {
    routesEvaluated: number;
    selectedRouteIndex: number;
  };
};
