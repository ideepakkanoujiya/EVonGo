'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { predictRange, type RangePredictionInput } from '@/lib/ev-analytics/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Zap, Target } from 'lucide-react';

export function RangePredictor() {
  const [formData, setFormData] = useState<RangePredictionInput>({
    battery_capacity_kWh: 75,
    efficiency_wh_per_km: 140,
    torque_nm: 450,
    top_speed_kmh: 225,
  });

  const [prediction, setPrediction] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await predictRange(formData);
      
      if (result.success && result.data) {
        setPrediction(result.data.predicted_range_km);
      } else {
        setError(result.error || 'Prediction failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof RangePredictionInput, value: number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-blue-600" />
          EV Range Predictor
        </CardTitle>
        <CardDescription>
          Estimate how far an electric vehicle can go on a full charge
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="battery">🔋 Battery Capacity (kWh)</Label>
              <Input
                id="battery"
                type="number"
                value={formData.battery_capacity_kWh}
                onChange={(e) => handleChange('battery_capacity_kWh', parseFloat(e.target.value))}
                min="10"
                max="200"
                step="0.1"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="efficiency">⚡ Efficiency (Wh/km)</Label>
              <Input
                id="efficiency"
                type="number"
                value={formData.efficiency_wh_per_km}
                onChange={(e) => handleChange('efficiency_wh_per_km', parseFloat(e.target.value))}
                min="80"
                max="300"
                step="1"
                required
              />
              <p className="text-xs text-muted-foreground">Lower = more efficient</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="torque">💪 Torque (Nm)</Label>
              <Input
                id="torque"
                type="number"
                value={formData.torque_nm}
                onChange={(e) => handleChange('torque_nm', parseFloat(e.target.value))}
                min="100"
                max="1500"
                step="1"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="speed">🏁 Top Speed (km/h)</Label>
              <Input
                id="speed"
                type="number"
                value={formData.top_speed_kmh}
                onChange={(e) => handleChange('top_speed_kmh', parseFloat(e.target.value))}
                min="100"
                max="350"
                step="1"
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
              'Predict Range'
            )}
          </Button>
        </form>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {prediction !== null && (
          <div className="mt-6 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Predicted Range</p>
                <h3 className="text-4xl font-bold mt-1">{prediction.toLocaleString()} km</h3>
              </div>
              <Target className="h-16 w-16 opacity-80" />
            </div>
            <p className="mt-2 text-sm opacity-90">
              Based on your vehicle specifications
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
