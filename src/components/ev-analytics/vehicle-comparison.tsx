'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { compareVehicles, type CompareVehiclesRequest } from '@/lib/ev-analytics/api';
import { type VehicleComparison } from '@/lib/ev-analytics/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Car } from 'lucide-react';

export function VehicleComparison() {
  const [vehicleNames, setVehicleNames] = useState<string[]>(['Model 3', 'Leaf']);
  const [comparison, setComparison] = useState<VehicleComparison[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const requestData: CompareVehiclesRequest = { vehicleNames };
      const result = await compareVehicles(requestData);
      
      if (result.success && result.data) {
        setComparison(result.data.comparison);
      } else {
        setError(result.error || result.data?.message || 'Comparison failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addVehicle = () => {
    setVehicleNames([...vehicleNames, '']);
  };

  const updateVehicle = (index: number, value: string) => {
    const newVehicles = [...vehicleNames];
    newVehicles[index] = value;
    setVehicleNames(newVehicles);
  };

  const removeVehicle = (index: number) => {
    if (vehicleNames.length > 1) {
      setVehicleNames(vehicleNames.filter((_, i) => i !== index));
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Car className="h-6 w-6 text-blue-600" />
          Compare Vehicles
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {vehicleNames.map((name, index) => (
              <div key={index} className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder={`Vehicle ${index + 1} (e.g., Model 3, Leaf, ID.4)`}
                    value={name}
                    onChange={(e) => updateVehicle(index, e.target.value)}
                    required
                  />
                </div>
                {vehicleNames.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeVehicle(index)}
                  >
                    ✕
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={addVehicle} className="w-full">
            + Add Another Vehicle
          </Button>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Comparing...
              </>
            ) : (
              'Compare Vehicles'
            )}
          </Button>
        </form>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {comparison.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="font-semibold text-lg">Comparison Results</h3>
            <div className="grid gap-4">
              {comparison.map((vehicle, index) => (
                <Card key={index} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-lg">{vehicle.brand} {vehicle.model}</h4>
                      <div className="grid grid-cols-3 gap-4 mt-3">
                        <div>
                          <p className="text-sm text-muted-foreground">Range</p>
                          <p className="font-semibold">{vehicle.range_km} km</p>
                          <div className="mt-1 h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600"
                              style={{ width: `${vehicle.range_score}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <p className="text-sm text-muted-foreground">Efficiency</p>
                          <p className="font-semibold">{vehicle.efficiency_wh_per_km} Wh/km</p>
                          <div className="mt-1 h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-600"
                              style={{ width: `${vehicle.efficiency_score}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <p className="text-sm text-muted-foreground">Charging</p>
                          <p className="font-semibold">{vehicle.fast_charging_power_kw_dc} kW</p>
                          <div className="mt-1 h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-600"
                              style={{ width: `${vehicle.charging_score}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
