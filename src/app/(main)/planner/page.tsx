'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { planRoute, type RoutePlanState } from '@/lib/actions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Map, BatteryCharging, Clock, AlertCircle, Sparkles, Navigation, Search, LocateFixed } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { addTripRecord } from '@/lib/user-data';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Sparkles className="mr-2 h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <Navigation className="mr-2 h-4 w-4" />
          Plan My Route
        </>
      )}
    </Button>
  );
}

export default function PlannerPage() {
  const { user } = useAuth();
  const initialState: RoutePlanState = { message: null, errors: {} };
  const [state, dispatch] = useActionState(planRoute, initialState);
  const [battery, setBattery] = useState(80);
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const startLocationRef = useRef<HTMLInputElement>(null);
  const lastSavedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state.result || !user?.uid) return;

    const tripKey = [
      startLocation,
      endLocation,
      state.result.totalTripDurationMinutes,
      state.result.totalChargingTimeMinutes,
      state.result.chargingStops.length,
    ].join('|');

    if (tripKey === lastSavedKeyRef.current) return;

    addTripRecord(user.uid, {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      startLocation,
      endLocation,
      totalTripDurationMinutes: state.result.totalTripDurationMinutes,
      totalChargingTimeMinutes: state.result.totalChargingTimeMinutes,
      chargingStopsCount: state.result.chargingStops.length,
    });
    lastSavedKeyRef.current = tripKey;
  }, [endLocation, startLocation, state.result, user?.uid]);

  const handleCurrentLocation = async () => {
    if (startLocationRef.current) {
        startLocationRef.current.value = 'Fetching location...';
        setStartLocation('Fetching location...');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                if (startLocationRef.current) {
                    const location = `${position.coords.latitude}, ${position.coords.longitude}`;
                    startLocationRef.current.value = location;
                    setStartLocation(location);
                }
            },
            (error) => {
                console.error("Error getting location", error);
                if (startLocationRef.current) {
                    startLocationRef.current.value = '';
                    setStartLocation('');
                }
                alert("Could not get your location. Please ensure location services are enabled.");
            }
        );
    }
  };

  return (
    <div className="grid gap-8 md:grid-cols-12">
      <div className="md:col-span-4 lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Smart Route Planner</CardTitle>
            <CardDescription>Let AI find the best charging stops for your trip.</CardDescription>
          </CardHeader>
          <form action={dispatch}>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="startLocation">Start Location</Label>
                <div className="flex gap-2">
                  <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="startLocation"
                      name="startLocation"
                      ref={startLocationRef}
                      placeholder="e.g., Mumbai"
                      required
                      className="pl-10"
                      onChange={(e) => setStartLocation(e.target.value)}
                    />
                  </div>
                  <Button type="button" variant="outline" size="icon" onClick={handleCurrentLocation} aria-label="Use current location">
                    <LocateFixed className="h-4 w-4"/>
                  </Button>
                </div>
                {state.errors?.startLocation && <p className="text-sm text-destructive">{state.errors.startLocation}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="endLocation">End Location</Label>
                 <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="endLocation"
                    name="endLocation"
                    placeholder="e.g., Bangalore"
                    required
                    className="pl-10"
                    onChange={(e) => setEndLocation(e.target.value)}
                  />
                </div>
                {state.errors?.endLocation && <p className="text-sm text-destructive">{state.errors.endLocation}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="vehicleRangeKm">Vehicle Range (km)</Label>
                <Input id="vehicleRangeKm" name="vehicleRangeKm" type="number" defaultValue="400" required />
                {state.errors?.vehicleRangeKm && <p className="text-sm text-destructive">{state.errors.vehicleRangeKm}</p>}
              </div>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <Label htmlFor="currentBatteryPercentage">Current Battery</Label>
                  <span className="text-sm font-medium">{battery}%</span>
                </div>
                <Slider
                  id="currentBatteryPercentage"
                  name="currentBatteryPercentage"
                  defaultValue={[battery]}
                  onValueChange={(value) => setBattery(value[0])}
                  max={100}
                  step={1}
                />
                 {state.errors?.currentBatteryPercentage && <p className="text-sm text-destructive">{state.errors.currentBatteryPercentage}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="chargingSpeedKw">Charging Speed (kW)</Label>
                <Input id="chargingSpeedKw" name="chargingSpeedKw" type="number" defaultValue="150" required />
                {state.errors?.chargingSpeedKw && <p className="text-sm text-destructive">{state.errors.chargingSpeedKw}</p>}
              </div>
            </CardContent>
            <CardFooter>
              <SubmitButton />
            </CardFooter>
          </form>
        </Card>
      </div>
      <div className="md:col-span-8 lg:col-span-9">
        {state.message && !state.result && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        
        {!state.result ? (
           <Card className="h-full flex flex-col items-center justify-center text-center p-8 border-dashed">
            <div className="bg-secondary p-4 rounded-full mb-4">
             <Map className="h-12 w-12 text-muted-foreground" />
            </div>
             <h3 className="text-xl font-bold font-headline">Your Trip Plan Awaits</h3>
             <p className="text-muted-foreground mt-2 max-w-sm">Fill in your trip details on the left, and our AI will generate an optimized route with charging stops.</p>
           </Card>
        ) : (
          <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Your Optimized Route</CardTitle>
                    <CardDescription>Total Trip Duration: {Math.floor(state.result.totalTripDurationMinutes / 60)}h {state.result.totalTripDurationMinutes % 60}m</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="relative aspect-video w-full">
                      <iframe
                        title="Route map"
                        className="h-full w-full rounded-md border"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://www.google.com/maps?q=${encodeURIComponent(
                          `${startLocation || 'Start'} to ${endLocation || 'Destination'} via ${state.result.chargingStops
                            .map((stop) => stop.location)
                            .join(', ')}`
                        )}&output=embed`}
                      />
                    </div>
                </CardContent>
            </Card>

            <h3 className="text-2xl font-bold font-headline">Charging Stops</h3>
            <div className="space-y-4">
              {state.result.chargingStops.map((stop, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>{stop.location}</CardTitle>
                        <CardDescription>Stop {index + 1}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm font-medium">
                        <BatteryCharging className="h-4 w-4 text-primary"/>
                        <span>Charge for {stop.chargingDurationMinutes} mins</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                     <div className="flex items-center text-muted-foreground">
                        <Clock className="h-4 w-4 mr-2" />
                        <span>Estimated Arrival: {stop.estimatedArrivalTime}</span>
                     </div>
                  </CardContent>
                </Card>
              ))}
            </div>
             <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Trip Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="p-4 bg-secondary rounded-lg">
                        <p className="text-sm text-muted-foreground">Total Driving Time</p>
                        <p className="text-2xl font-bold">{Math.floor((state.result!.totalTripDurationMinutes - state.result!.totalChargingTimeMinutes) / 60)}h {(state.result!.totalTripDurationMinutes - state.result!.totalChargingTimeMinutes) % 60}m</p>
                    </div>
                     <div className="p-4 bg-secondary rounded-lg">
                        <p className="text-sm text-muted-foreground">Total Charging Time</p>
                        <p className="text-2xl font-bold">{Math.floor(state.result!.totalChargingTimeMinutes / 60)}h {state.result!.totalChargingTimeMinutes % 60}m</p>
                    </div>
                </CardContent>
             </Card>
          </div>
        )}
      </div>
    </div>
  );
}
