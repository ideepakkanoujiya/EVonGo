'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { searchVehicles } from '@/lib/ev-analytics/api';
import { type EVVehicle, type SearchVehiclesParams } from '@/lib/ev-analytics/types';
import { Loader2, Search } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const initialFilters: SearchVehiclesParams = {
  brand: '',
  model: '',
  minRange: undefined,
  maxRange: undefined,
};

export function VehicleSearch() {
  const [filters, setFilters] = useState<SearchVehiclesParams>(initialFilters);
  const [results, setResults] = useState<EVVehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await searchVehicles(filters);
      if (result.success && result.data) {
        setResults(result.data.vehicles);
        setTotal(result.data.total);
      } else {
        setError(result.error || 'Search failed');
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
          <Search className="h-6 w-6 text-blue-600" />
          Vehicle Search
        </CardTitle>
        <CardDescription>Find EVs by brand, model, and range.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vs-brand">Brand</Label>
              <Input
                id="vs-brand"
                value={filters.brand || ''}
                onChange={(e) => setFilters((prev: SearchVehiclesParams) => ({ ...prev, brand: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vs-model">Model</Label>
              <Input
                id="vs-model"
                value={filters.model || ''}
                onChange={(e) => setFilters((prev: SearchVehiclesParams) => ({ ...prev, model: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vs-min-range">Min Range (km)</Label>
              <Input
                id="vs-min-range"
                type="number"
                value={filters.minRange ?? ''}
                onChange={(e) =>
                  setFilters((prev: SearchVehiclesParams) => ({
                    ...prev,
                    minRange: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vs-max-range">Max Range (km)</Label>
              <Input
                id="vs-max-range"
                type="number"
                value={filters.maxRange ?? ''}
                onChange={(e) =>
                  setFilters((prev: SearchVehiclesParams) => ({
                    ...prev,
                    maxRange: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              'Search Vehicles'
            )}
          </Button>
        </form>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{total} result(s)</p>
          {results.map((vehicle: EVVehicle, index: number) => (
            <div key={`${vehicle.brand}-${vehicle.model}-${index}`} className="rounded-lg border p-3">
              <p className="font-semibold">
                {vehicle.brand} {vehicle.model}
              </p>
              <div className="mt-1 grid grid-cols-2 gap-2 text-sm text-muted-foreground md:grid-cols-4">
                <span>Range: {vehicle.range_km ?? 'N/A'} km</span>
                <span>Efficiency: {vehicle.efficiency_wh_per_km ?? 'N/A'} Wh/km</span>
                <span>Battery: {vehicle.battery_capacity_kWh ?? 'N/A'} kWh</span>
                <span>Fast charge: {vehicle.fast_charging_power_kw_dc ?? 'N/A'} kW</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
