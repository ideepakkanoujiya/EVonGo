// EV Vehicle Types
export interface EVVehicle {
  brand: string;
  model: string;
  range_km?: number;
  efficiency_wh_per_km?: number;
  battery_capacity_kWh?: number;
  fast_charging_power_kw_dc?: number;
  torque_nm?: number;
  top_speed_kmh?: number;
}

// Range Prediction Types
export interface RangePredictionInput {
  battery_capacity_kWh: number;
  efficiency_wh_per_km: number;
  torque_nm: number;
  top_speed_kmh: number;
}

export interface RangePredictionResponse {
  success: boolean;
  predicted_range_km: number;
  input: RangePredictionInput;
}

// Real-World Range Types
export interface RealWorldRangeInput {
  Battery_Capacity_kWh: number;
  Battery_Health_Percent: number;
  Energy_Consumption_kWh_per_100km: number;
  Avg_Speed_kmh: number;
  Temperature_C: number;
  Mileage_km: number;
}

export interface RealWorldRangeResponse {
  success: boolean;
  predicted_range_km: number;
  input: RealWorldRangeInput;
}

// Efficiency Ranking Types
export interface EfficiencyRanking {
  rank: number;
  brand: string;
  model: string;
  efficiency_wh_per_km: number;
  efficiency_score: number;
}

export interface EfficiencyRankingsResponse {
  success: boolean;
  rankings: EfficiencyRanking[];
}

// Vehicle Comparison Types
export interface VehicleComparison {
  brand: string;
  model: string;
  range_km: number;
  efficiency_wh_per_km: number;
  fast_charging_power_kw_dc: number;
  range_score: number;
  efficiency_score: number;
  charging_score: number;
}

export interface CompareVehiclesRequest {
  vehicleNames: string[];
}

export interface CompareVehiclesResponse {
  success: boolean;
  comparison: VehicleComparison[];
  message?: string;
  suggestions?: string[];
}

// Search Types
export interface SearchVehiclesParams {
  brand?: string;
  model?: string;
  minRange?: number;
  maxRange?: number;
}

export interface SearchVehiclesResponse {
  success: boolean;
  vehicles: EVVehicle[];
  total: number;
}

// API Response Types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}