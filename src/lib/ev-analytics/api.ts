import {
  RangePredictionInput,
  RangePredictionResponse,
  RealWorldRangeInput,
  RealWorldRangeResponse,
  EfficiencyRankingsResponse,
  CompareVehiclesRequest,
  CompareVehiclesResponse,
  SearchVehiclesParams,
  SearchVehiclesResponse,
  APIResponse
} from './types';

const ML_SERVICE_URL = process.env.NEXT_PUBLIC_ML_SERVICE_URL || 'http://localhost:5000';

export type { RangePredictionInput, RealWorldRangeInput, CompareVehiclesRequest };

// Range Prediction
export async function predictRange(data: RangePredictionInput): Promise<APIResponse<RangePredictionResponse>> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict-range`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const raw = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(raw?.error || 'Failed to predict range');
    }

    const predicted =
      typeof raw?.predicted_range_km === 'number'
        ? raw.predicted_range_km
        : raw?.prediction?.predicted_range_km;
    if (typeof predicted !== 'number') {
      throw new Error('Invalid range prediction response');
    }

    const result: RangePredictionResponse = {
      success: true,
      predicted_range_km: predicted,
      input: data,
    };
    return { success: true, data: result };
  } catch (error) {
    console.error('Predict range error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Real-World Range Prediction
export async function predictRealWorldRange(data: RealWorldRangeInput): Promise<APIResponse<RealWorldRangeResponse>> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict-real-world-range`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const raw = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(raw?.error || 'Failed to predict real-world range');
    }

    const predicted = raw?.predicted_range_km;
    if (typeof predicted !== 'number') {
      throw new Error('Invalid real-world range response');
    }

    const result: RealWorldRangeResponse = {
      success: true,
      predicted_range_km: predicted,
      input: data,
    };
    return { success: true, data: result };
  } catch (error) {
    console.error('Predict real-world range error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Get Efficiency Rankings
export async function getEfficiencyRankings(): Promise<APIResponse<EfficiencyRankingsResponse>> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/efficiency-rankings`);

    if (!response.ok) {
      throw new Error('Failed to fetch rankings');
    }

    const result: EfficiencyRankingsResponse = await response.json();
    return { success: true, data: result };
  } catch (error) {
    console.error('Get rankings error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Compare Vehicles
export async function compareVehicles(data: CompareVehiclesRequest): Promise<APIResponse<CompareVehiclesResponse>> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/compare-vehicles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Failed to compare vehicles');
    }

    const result: CompareVehiclesResponse = await response.json();
    return { success: true, data: result };
  } catch (error) {
    console.error('Compare vehicles error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Search Vehicles
export async function searchVehicles(params: SearchVehiclesParams): Promise<APIResponse<SearchVehiclesResponse>> {
  try {
    const queryParams = new URLSearchParams();
    
    if (params.brand) queryParams.append('brand', params.brand);
    if (params.model) queryParams.append('model', params.model);
    if (params.minRange) queryParams.append('minRange', params.minRange.toString());
    if (params.maxRange) queryParams.append('maxRange', params.maxRange.toString());

    const response = await fetch(`${ML_SERVICE_URL}/search-vehicles?${queryParams}`);

    if (!response.ok) {
      throw new Error('Failed to search vehicles');
    }

    const result: SearchVehiclesResponse = await response.json();
    return { success: true, data: result };
  } catch (error) {
    console.error('Search vehicles error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Health Check
export async function checkMLServiceHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
