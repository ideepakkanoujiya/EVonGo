'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { predictRealWorldRange, type RealWorldRangeInput } from '@/lib/ev-analytics/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Route } from 'lucide-react';

const initialForm: RealWorldRangeInput = {
  Battery_Capacity_kWh: 75,
  Battery_Health_Percent: 95,
  Energy_Consumption_kWh_per_100km: 16,
  Avg_Speed_kmh: 55,
  Temperature_C: 28,
  Mileage_km: 18000,
};

export function RealWorldRangePredictor() {
  const [formData, setFormData] = useState<RealWorldRangeInput>(initialForm);
  const [prediction, setPrediction] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof RealWorldRangeInput, value: number) => {
    setFormData((prev: RealWorldRangeInput) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await predictRealWorldRange(formData);
      if (result.success && result.data) {
        setPrediction(result.data.predicted_range_km);
      } else {
        setError(result.error || 'Prediction failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="h-6 w-6 text-emerald-600" />
          Real-World Range Predictor
        </CardTitle>
        <CardDescription>
          Estimate practical range based on battery health, temperature, and usage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rw-battery-capacity">Battery Capacity (kWh)</Label>
              <Input
                id="rw-battery-capacity"
                type="number"
                value={formData.Battery_Capacity_kWh}
                onChange={(e) => handleChange('Battery_Capacity_kWh', Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rw-battery-health">Battery Health (%)</Label>
              <Input
                id="rw-battery-health"
                type="number"
                value={formData.Battery_Health_Percent}
                onChange={(e) => handleChange('Battery_Health_Percent', Number(e.target.value))}
                min="1"
                max="100"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rw-consumption">Consumption (kWh/100km)</Label>
              <Input
                id="rw-consumption"
                type="number"
                value={formData.Energy_Consumption_kWh_per_100km}
                onChange={(e) => handleChange('Energy_Consumption_kWh_per_100km', Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rw-speed">Average Speed (km/h)</Label>
              <Input
                id="rw-speed"
                type="number"
                value={formData.Avg_Speed_kmh}
                onChange={(e) => handleChange('Avg_Speed_kmh', Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rw-temperature">Temperature (C)</Label>
              <Input
                id="rw-temperature"
                type="number"
                value={formData.Temperature_C}
                onChange={(e) => handleChange('Temperature_C', Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rw-mileage">Vehicle Mileage (km)</Label>
              <Input
                id="rw-mileage"
                type="number"
                value={formData.Mileage_km}
                onChange={(e) => handleChange('Mileage_km', Number(e.target.value))}
                required
              />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Predicting...
              </>
            ) : (
              'Predict Real-World Range'
            )}
          </Button>
        </form>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {prediction !== null && (
          <div className="mt-4 rounded-lg bg-secondary p-4">
            <p className="text-sm text-muted-foreground">Estimated Real-World Range</p>
            <p className="text-3xl font-bold">{prediction.toLocaleString()} km</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
