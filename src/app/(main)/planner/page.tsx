'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map, Clock, AlertCircle, Navigation, Search, LocateFixed, CheckCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { addTripRecord } from '@/lib/user-data';
import { analyzePlannerRoute } from '@/lib/planner/api';
import type { EVRouteAnalysis } from '@/lib/planner/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type PlannerFormState = {
  origin: string;
  destination: string;
  vehicleMake: string;
  vehicleModel: string;
  batteryPercent: number;
};

type LocationSuggestion = {
  id: string;
  label: string;
  subtitle?: string;
  value: string;
};

type VehicleOption = {
  optionId: string;
  make: string;
  model: string;
  modelLabel: string;
  year: number | null;
  battery_capacity_kWh: number;
  efficiency_wh_per_km: number;
  top_speed_kmh: number;
  maxChargingPower_kW: number;
  torque_nm: number;
  connectorType: string;
};

const DEFAULT_FORM: PlannerFormState = {
  origin: '',
  destination: '',
  vehicleMake: '',
  vehicleModel: '',
  batteryPercent: 80,
};

type LatLngTuple = [number, number];

type LeafletMap = {
  fitBounds: (bounds: LeafletBounds, options?: { padding?: [number, number] }) => void;
  remove: () => void;
};

type LeafletBounds = {
  extend: (point: LatLngTuple) => LeafletBounds;
  isValid: () => boolean;
};

type LeafletLayerGroup = {
  addTo: (map: LeafletMap) => LeafletLayerGroup;
  clearLayers: () => void;
};

type LeafletMarker = {
  addTo: (layer: LeafletLayerGroup) => LeafletMarker;
  bindPopup: (content: string) => LeafletMarker;
};

type LeafletIcon = object;

type LeafletGlobal = {
  map: (container: HTMLElement) => LeafletMap;
  tileLayer: (urlTemplate: string, options: Record<string, unknown>) => { addTo: (map: LeafletMap) => void };
  layerGroup: () => LeafletLayerGroup;
  marker: (latlng: LatLngTuple, options?: { icon?: LeafletIcon }) => LeafletMarker;
  divIcon: (options: {
    html: string;
    className?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
  }) => LeafletIcon;
  polyline: (latlngs: LatLngTuple[], options?: Record<string, unknown>) => { addTo: (layer: LeafletLayerGroup) => void };
  latLngBounds: (latlngs?: LatLngTuple[]) => LeafletBounds;
};

declare global {
  interface Window {
    L?: LeafletGlobal;
    __leafletLoadPromise?: Promise<void>;
  }
}

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;

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

function loadLeafletAssets(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.L) {
    return Promise.resolve();
  }

  if (window.__leafletLoadPromise) {
    return window.__leafletLoadPromise;
  }

  window.__leafletLoadPromise = new Promise<void>((resolve, reject) => {
    const existingStylesheet = document.getElementById('leaflet-stylesheet');
    if (!existingStylesheet) {
      const link = document.createElement('link');
      link.id = 'leaflet-stylesheet';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const existingScript = document.getElementById('leaflet-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Leaflet script')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.id = 'leaflet-script';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Leaflet script'));
    document.body.appendChild(script);
  });

  return window.__leafletLoadPromise;
}

function formatDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hrs = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hrs === 0) return `${mins} mins`;
  if (mins === 0) return `${hrs} hrs`;
  return `${hrs} hrs ${mins} mins`;
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

function validatePlannerForm(form: PlannerFormState): string | null {
  if (form.origin.trim().length < 3) return 'Origin must be at least 3 characters.';
  if (form.destination.trim().length < 3) return 'Destination must be at least 3 characters.';
  if (!form.vehicleMake.trim()) return 'EV make is required.';
  if (!form.vehicleModel.trim()) return 'EV model is required.';
  if (form.batteryPercent < 0 || form.batteryPercent > 100) return 'Battery percent must be between 0 and 100.';
  return null;
}

export default function PlannerPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<PlannerFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EVRouteAnalysis | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<LocationSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<LocationSuggestion[]>([]);
  const [originFocused, setOriginFocused] = useState(false);
  const [destinationFocused, setDestinationFocused] = useState(false);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [vehicleOptionsLoading, setVehicleOptionsLoading] = useState(true);
  const [vehicleOptionsLoadError, setVehicleOptionsLoadError] = useState<string | null>(null);
  const [leafletLoadError, setLeafletLoadError] = useState<string | null>(null);
  const startLocationRef = useRef<HTMLInputElement>(null);
  const lastSavedKeyRef = useRef<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const leafletLayerGroupRef = useRef<LeafletLayerGroup | null>(null);
  const makeOptions = useMemo(
    () => Array.from(new Set(vehicleOptions.map((vehicle) => vehicle.make))).sort(),
    [vehicleOptions]
  );
  const modelOptions = useMemo(
    () =>
      vehicleOptions
        .filter((vehicle) => vehicle.make === form.vehicleMake)
        .sort((a, b) => {
          if (a.model !== b.model) return a.model.localeCompare(b.model);
          return (a.year ?? 0) - (b.year ?? 0);
        }),
    [form.vehicleMake, vehicleOptions]
  );
  const selectedVehicleOption = useMemo(
    () =>
      vehicleOptions.find(
        (vehicle) => vehicle.optionId === form.vehicleModel
      ) ?? null,
    [form.vehicleModel, vehicleOptions]
  );
  const selectedRoute = useMemo(() => result?.metrics?.[0] ?? null, [result]);
  const recommendation = result?.evAnalysis.recommendation;
  const hasDirectRange = useMemo(() => {
    if (!result || !selectedRoute) return false;
    return result.evAnalysis.currentRangeKm >= selectedRoute.distanceKm;
  }, [result, selectedRoute]);
  const chargingStops = useMemo(
    () => recommendation?.chargingStops ?? [],
    [recommendation?.chargingStops]
  );

  useEffect(() => {
    let active = true;
    const loadVehicleOptions = async () => {
      setVehicleOptionsLoading(true);
      setVehicleOptionsLoadError(null);
      try {
        const response = await fetch('/api/planner/vehicle-options', {
          method: 'GET',
          cache: 'no-store',
        });
        const data = (await response.json()) as {
          success?: boolean;
          vehicles?: VehicleOption[];
          error?: string;
        };
        if (!response.ok || !data.success || !Array.isArray(data.vehicles)) {
          throw new Error(data.error || 'Failed to load EV list');
        }
        const vehicles = data.vehicles;
        if (!active) return;
        setVehicleOptions(vehicles);
        setForm((prev) => {
          if (prev.vehicleMake && prev.vehicleModel) return prev;
          const first = vehicles[0];
          if (!first) return prev;
          return {
            ...prev,
            vehicleMake: first.make,
            vehicleModel: first.optionId,
          };
        });
      } catch (loadError) {
        if (!active) return;
        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load EV options';
        setVehicleOptionsLoadError(message);
      } finally {
        if (active) setVehicleOptionsLoading(false);
      }
    };
    void loadVehicleOptions();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!result || !selectedRoute || !recommendation || !user?.uid) return;

    const tripKey = [
      form.origin,
      form.destination,
      selectedRoute.durationInTrafficMinutes,
      recommendation.totalChargingDurationMinutes,
      recommendation.numberOfStops,
    ].join('|');

    if (tripKey === lastSavedKeyRef.current) return;

    addTripRecord(user.uid, {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      startLocation: form.origin,
      endLocation: form.destination,
      totalTripDurationMinutes:
        selectedRoute.durationInTrafficMinutes + recommendation.totalChargingDurationMinutes,
      totalChargingTimeMinutes: recommendation.totalChargingDurationMinutes,
      chargingStopsCount: recommendation.numberOfStops,
    });
    lastSavedKeyRef.current = tripKey;
  }, [form.destination, form.origin, recommendation, result, selectedRoute, user?.uid]);

  const handleCurrentLocation = async () => {
    if (!startLocationRef.current) return;

    startLocationRef.current.value = 'Fetching location...';
    setForm((prev) => ({ ...prev, origin: 'Fetching location...' }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!startLocationRef.current) return;
        const location = `${position.coords.latitude}, ${position.coords.longitude}`;
        startLocationRef.current.value = location;
        setForm((prev) => ({ ...prev, origin: location }));
      },
      () => {
        if (!startLocationRef.current) return;
        startLocationRef.current.value = '';
        setForm((prev) => ({ ...prev, origin: '' }));
        alert('Could not get your location. Ensure location services are enabled.');
      }
    );
  };

  const handleChange = <K extends keyof PlannerFormState>(key: K, value: PlannerFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const routePath = useMemo(() => {
    if (!selectedRoute?.polyline) return [];
    try {
      return decodePolyline(selectedRoute.polyline);
    } catch {
      return [];
    }
  }, [selectedRoute]);

  const routeMapUrl = useMemo(() => {
    if (!selectedRoute) return '#';
    const params = new URLSearchParams({
      api: '1',
      origin: `${selectedRoute.origin.lat},${selectedRoute.origin.lng}`,
      destination: `${selectedRoute.destination.lat},${selectedRoute.destination.lng}`,
      travelmode: 'driving',
    });
    if (chargingStops.length > 0) {
      params.set(
        'waypoints',
        chargingStops
          .map((stop) => `${stop.station.location.lat},${stop.station.location.lng}`)
          .join('|')
      );
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }, [chargingStops, selectedRoute]);

  const refreshLeafletMap = useCallback(async () => {
    if (!selectedRoute || !mapContainerRef.current) return;

    try {
      await loadLeafletAssets();
      const L = window.L;
      if (!L) {
        throw new Error('Leaflet did not initialize');
      }

      if (!leafletMapRef.current) {
        const map = L.map(mapContainerRef.current);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        leafletMapRef.current = map;
        leafletLayerGroupRef.current = L.layerGroup().addTo(map);
      }

      const map = leafletMapRef.current;
      const layer = leafletLayerGroupRef.current;
      if (!map || !layer) return;

      layer.clearLayers();

      if (routePath.length > 1) {
        const path: LatLngTuple[] = routePath.map((point) => [point.lat, point.lng]);
        L.polyline(path, {
          color: '#2563eb',
          weight: 5,
          opacity: 0.85,
        }).addTo(layer);
      }

      const origin: LatLngTuple = [selectedRoute.origin.lat, selectedRoute.origin.lng];
      const destination: LatLngTuple = [
        selectedRoute.destination.lat,
        selectedRoute.destination.lng,
      ];

      const createMarkerIcon = (label: string, backgroundColor: string) =>
        L.divIcon({
          className: '',
          html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:${backgroundColor};color:#fff;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);">${label}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          popupAnchor: [0, -12],
        });

      const startIcon = createMarkerIcon('S', '#16a34a');
      const destinationIcon = createMarkerIcon('D', '#dc2626');

      L.marker(origin, { icon: startIcon }).bindPopup('Start').addTo(layer);
      L.marker(destination, { icon: destinationIcon }).bindPopup('Destination').addTo(layer);
      chargingStops.forEach((stop) => {
        const chargingIcon = createMarkerIcon(`C${stop.stopIndex}`, '#f59e0b');
        L.marker([stop.station.location.lat, stop.station.location.lng], {
          icon: chargingIcon,
        })
          .bindPopup(`Stop ${stop.stopIndex}: ${stop.station.name}`)
          .addTo(layer);
      });

      const bounds = L.latLngBounds([origin, destination]);
      chargingStops.forEach((stop) => {
        bounds.extend([stop.station.location.lat, stop.station.location.lng]);
      });
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
      setLeafletLoadError(null);
    } catch (mapError) {
      const message = mapError instanceof Error ? mapError.message : 'Unable to load map';
      setLeafletLoadError(message);
    }
  }, [chargingStops, routePath, selectedRoute]);

  useEffect(() => {
    void refreshLeafletMap();
  }, [refreshLeafletMap]);

  useEffect(() => {
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        leafletLayerGroupRef.current = null;
      }
    };
  }, []);

  const fetchSuggestions = async (query: string): Promise<LocationSuggestion[]> => {
    const response = await fetch(`/api/planner/suggest?q=${encodeURIComponent(query)}`);
    const data = (await response.json()) as {
      success: boolean;
      suggestions?: LocationSuggestion[];
    };
    if (!response.ok || !data.success) {
      return [];
    }
    return data.suggestions || [];
  };

  useEffect(() => {
    const query = form.origin.trim();
    if (query.length < 2) {
      setOriginSuggestions([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      const suggestions = await fetchSuggestions(query);
      if (active) {
        setOriginSuggestions(suggestions);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [form.origin]);

  useEffect(() => {
    const query = form.destination.trim();
    if (query.length < 2) {
      setDestinationSuggestions([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      const suggestions = await fetchSuggestions(query);
      if (active) {
        setDestinationSuggestions(suggestions);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [form.destination]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validatePlannerForm(form);
    if (validationError) {
      setError(validationError);
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!selectedVehicleOption) {
        throw new Error('Please select a valid EV make and model.');
      }
      const response = await analyzePlannerRoute({
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        batteryPercent: form.batteryPercent,
        vehicle: {
          evModel: selectedVehicleOption.model,
          battery_capacity_kWh: selectedVehicleOption.battery_capacity_kWh,
          efficiency_wh_per_km: selectedVehicleOption.efficiency_wh_per_km,
          torque_nm: selectedVehicleOption.torque_nm,
          top_speed_kmh: selectedVehicleOption.top_speed_kmh,
          connectorType: selectedVehicleOption.connectorType,
          maxChargingPower_kW: selectedVehicleOption.maxChargingPower_kW,
        },
        alternatives: true,
      });
      if (!response.metrics || response.metrics.length === 0) {
        throw new Error('No routes were returned for the selected trip.');
      }
      setResult(response);
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'Failed to analyze route';
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-8 md:grid-cols-12">
      <div className="md:col-span-4 lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Smart Route Planner</CardTitle>
            <CardDescription>
              ML-driven range prediction with EV make/model selection and automatic charging stops.
            </CardDescription>
          </CardHeader>
          <form onSubmit={submit}>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="origin">From</Label>
                <div className="flex gap-2">
                  <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="origin"
                      ref={startLocationRef}
                      value={form.origin}
                      onChange={(event) => handleChange('origin', event.target.value)}
                      placeholder="e.g., Mumbai"
                      className="pl-10"
                      minLength={3}
                      onFocus={() => setOriginFocused(true)}
                      onBlur={() => {
                        window.setTimeout(() => setOriginFocused(false), 150);
                      }}
                      required
                    />
                    {originFocused && originSuggestions.length > 0 && (
                      <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-background shadow-md">
                        {originSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left hover:bg-muted"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleChange('origin', suggestion.label);
                              setOriginSuggestions([]);
                              setOriginFocused(false);
                            }}
                          >
                            <p className="text-sm font-medium">{suggestion.label}</p>
                            {suggestion.subtitle && (
                              <p className="text-xs text-muted-foreground">{suggestion.subtitle}</p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCurrentLocation}
                    aria-label="Use current location"
                  >
                    <LocateFixed className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">To</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="destination"
                    value={form.destination}
                    onChange={(event) => handleChange('destination', event.target.value)}
                    placeholder="e.g., Bangalore"
                    className="pl-10"
                    minLength={3}
                    onFocus={() => setDestinationFocused(true)}
                    onBlur={() => {
                      window.setTimeout(() => setDestinationFocused(false), 150);
                    }}
                    required
                  />
                  {destinationFocused && destinationSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-background shadow-md">
                      {destinationSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left hover:bg-muted"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleChange('destination', suggestion.label);
                            setDestinationSuggestions([]);
                            setDestinationFocused(false);
                          }}
                        >
                          <p className="text-sm font-medium">{suggestion.label}</p>
                          {suggestion.subtitle && (
                            <p className="text-xs text-muted-foreground">{suggestion.subtitle}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ev-make">EV Make</Label>
                <Select
                  value={form.vehicleMake}
                  onValueChange={(value) => {
                    const nextModel =
                      vehicleOptions.find((vehicle) => vehicle.make === value)?.optionId ?? '';
                    setForm((prev) => ({
                      ...prev,
                      vehicleMake: value,
                      vehicleModel: nextModel,
                    }));
                  }}
                  disabled={vehicleOptionsLoading || makeOptions.length === 0}
                >
                  <SelectTrigger id="ev-make">
                    <SelectValue placeholder="Select EV make" />
                  </SelectTrigger>
                  <SelectContent>
                    {makeOptions.map((make) => (
                      <SelectItem key={make} value={make}>
                        {make}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ev-model">EV Model</Label>
                <Select
                  value={form.vehicleModel}
                  onValueChange={(value) => handleChange('vehicleModel', value)}
                  disabled={!form.vehicleMake || modelOptions.length === 0}
                >
                  <SelectTrigger id="ev-model">
                    <SelectValue placeholder="Select EV model" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((vehicle) => (
                      <SelectItem key={vehicle.optionId} value={vehicle.optionId}>
                        {vehicle.modelLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vehicleOptionsLoadError && (
                  <p className="text-xs text-destructive">{vehicleOptionsLoadError}</p>
                )}
                {!vehicleOptionsLoadError && selectedVehicleOption && (
                  <p className="text-xs text-muted-foreground">
                    Specs auto-filled: {selectedVehicleOption.battery_capacity_kWh} kWh,{' '}
                    {selectedVehicleOption.efficiency_wh_per_km} Wh/km
                  </p>
                )}
                {!vehicleOptionsLoadError && vehicleOptions.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Loaded {makeOptions.length} makes and {vehicleOptions.length} model variants
                    from dataset
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex justify-between">
                  <Label htmlFor="batteryPercent">Current Battery</Label>
                  <span className="text-sm font-medium">{form.batteryPercent}%</span>
                </div>
                <Slider
                  id="batteryPercent"
                  value={[form.batteryPercent]}
                  onValueChange={(values) => handleChange('batteryPercent', values[0])}
                  max={100}
                  min={0}
                  step={1}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                disabled={loading || vehicleOptionsLoading || !selectedVehicleOption}
                className="w-full"
              >
                {loading ? 'Analyzing route...' : 'Analyze Route'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <div className="space-y-6 md:col-span-8 lg:col-span-9">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!result ? (
          <Card className="flex h-full flex-col items-center justify-center border-dashed p-8 text-center">
            <div className="mb-4 rounded-full bg-secondary p-4">
              <Map className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="font-headline text-xl font-bold">Traffic-Aware Plan Awaits</h3>
            <p className="mt-2 max-w-sm text-muted-foreground">
              Enter route plus EV make/model to compute ML-based range, traffic impact, and charging
              feasibility.
            </p>
          </Card>
        ) : !selectedRoute ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No Route Found</AlertTitle>
            <AlertDescription>The analysis returned no route metrics for this trip.</AlertDescription>
          </Alert>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="font-headline">Best Route Summary</CardTitle>
                <CardDescription>{selectedRoute.summary}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-secondary p-4">
                    <p className="text-xs text-muted-foreground">Distance</p>
                    <p className="text-2xl font-bold">{selectedRoute.distanceKm} km</p>
                  </div>
                  <div className="rounded-lg bg-secondary p-4">
                    <p className="text-xs text-muted-foreground">Travel Time (Traffic)</p>
                    <p className="text-2xl font-bold">{formatDuration(selectedRoute.durationInTrafficMinutes)}</p>
                  </div>
                  <div className="rounded-lg bg-secondary p-4">
                    <p className="text-xs text-muted-foreground">Average Speed</p>
                    <p className="text-2xl font-bold">{selectedRoute.avgSpeedKmh} km/h</p>
                  </div>
                  <div className="rounded-lg bg-secondary p-4">
                    <p className="text-xs text-muted-foreground">Congestion Ratio</p>
                    <p className="text-2xl font-bold">{selectedRoute.congestionRatio}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-lg bg-white p-6 shadow-md">
              <h3 className="mb-4 text-xl font-bold">EV Range & Charging Analysis</h3>

              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div
                  className={`rounded-lg p-4 ${
                    hasDirectRange
                      ? 'border border-green-200 bg-green-50'
                      : 'border border-red-200 bg-red-50'
                  }`}
                >
                  <p className="text-sm text-gray-600">Range Status</p>
                  <p
                    className={`text-2xl font-bold ${
                      hasDirectRange
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {result.evAnalysis.currentRangeKm.toFixed(2)} km / {selectedRoute.distanceKm} km
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {hasDirectRange
                      ? 'Sufficient range without charging'
                      : 'Range below trip distance'}
                  </p>
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm text-gray-600">Consumption</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {result.evAnalysis.consumptionPerKm.toFixed(3)} kWh/km
                  </p>
                  <p className="mt-1 text-sm text-gray-500">Average energy usage</p>
                </div>
              </div>

              {result.evAnalysis.recommendation.needed && (
                <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 text-orange-600" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-orange-800">Charging Required</h4>
                      <p className="mt-1 text-sm text-orange-700">
                        {result.evAnalysis.recommendation.reason}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {result.evAnalysis.recommendation.numberOfStops > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-semibold">
                      {result.evAnalysis.recommendation.numberOfStops} Charging Stop
                      {result.evAnalysis.recommendation.numberOfStops > 1 ? 's' : ''} Required
                    </h4>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Total Charging Time</p>
                      <p className="text-xl font-bold text-green-600">
                        {formatDuration(result.evAnalysis.recommendation.totalChargingDurationMinutes)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {result.evAnalysis.recommendation.chargingStops.map((stop) => (
                      <div
                        key={stop.stopIndex}
                        className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                              <span className="font-bold text-green-600">{stop.stopIndex}</span>
                            </div>
                            <div>
                              <h5 className="font-semibold text-gray-800">{stop.station.name}</h5>
                              <p className="text-sm text-gray-500">
                                {formatDistance(stop.station.distanceFromRouteMeters)} from route
                              </p>
                              <p className="text-sm text-gray-500">
                                {stop.distanceFromPreviousStopKm.toFixed(1)} km from previous stop
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-green-600">
                              {stop.chargingDurationMinutes} min
                            </p>
                            <p className="text-sm text-gray-500">+{stop.energyAdded_kWh} kWh</p>
                          </div>
                        </div>

                        <div className="mt-3 border-t border-gray-100 pt-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">
                              Arrival:{' '}
                              <span className="font-semibold text-orange-600">
                                {stop.arrivalBatteryPercent.toFixed(1)}%
                              </span>
                            </span>
                            <div className="mx-4 flex-1">
                              <div className="h-2 w-full rounded-full bg-gray-200">
                                <div
                                  className="h-2 rounded-full bg-green-500 transition-all"
                                  style={{
                                    width: `${stop.departureBatteryPercent}%`,
                                    background: `linear-gradient(to right, #f97316 ${stop.arrivalBatteryPercent}%, #22c55e ${stop.arrivalBatteryPercent}%)`,
                                  }}
                                />
                              </div>
                            </div>
                            <span className="text-gray-600">
                              Departure:{' '}
                              <span className="font-semibold text-green-600">
                                {stop.departureBatteryPercent.toFixed(1)}%
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg bg-gray-50 p-4">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div>
                        <p className="text-xs text-gray-600">Total Stops</p>
                        <p className="text-lg font-bold">
                          {result.evAnalysis.recommendation.numberOfStops}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Total Charging Time</p>
                        <p className="text-lg font-bold text-green-600">
                          {formatDuration(result.evAnalysis.recommendation.totalChargingDurationMinutes)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Total Energy</p>
                        <p className="text-lg font-bold">
                          {result.evAnalysis.recommendation.totalEnergyToCharge_kWh} kWh
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Final Battery</p>
                        <p
                          className={`text-lg font-bold ${
                            result.evAnalysis.recommendation.arrivalBatteryPercent > 20
                              ? 'text-green-600'
                              : 'text-orange-600'
                          }`}
                        >
                          {result.evAnalysis.recommendation.arrivalBatteryPercent.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!result.evAnalysis.recommendation.needed && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <h4 className="font-semibold text-green-800">No Charging Required</h4>
                      <p className="text-sm text-green-700">
                        You have sufficient range to complete this journey.
                      </p>
                      <p className="mt-1 text-sm text-green-700">
                        Estimated arrival battery:{' '}
                        {result.evAnalysis.recommendation.arrivalBatteryPercent.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="font-headline">Route Map</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-video w-full">
                  <div ref={mapContainerRef} className="h-full w-full rounded-md border" />
                </div>
                {leafletLoadError && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Map preview error: {leafletLoadError}
                  </p>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    Total Trip Time:{' '}
                    {formatDuration(
                      selectedRoute.durationInTrafficMinutes +
                        result.evAnalysis.recommendation.totalChargingDurationMinutes
                    )}
                  </span>
                </div>
                <Button asChild>
                  <a href={routeMapUrl} target="_blank" rel="noreferrer">
                    <Navigation className="mr-2 h-4 w-4" />
                    Open in Maps
                  </a>
                </Button>
              </CardFooter>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
