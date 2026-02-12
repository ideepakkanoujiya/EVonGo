
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { searchStations, type StationState } from '@/lib/actions';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Zap, Search, LocateFixed, Sparkles, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useRef } from 'react';
import Link from 'next/link';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Sparkles className="mr-2 h-4 w-4 animate-spin" />
          Searching...
        </>
      ) : (
        <>
          <Search className="mr-2 h-4 w-4" />
          Search
        </>
      )}
    </Button>
  );
}


export default function StationsPage() {
  const initialState: StationState = {};
  const [state, dispatch] = useActionState(searchStations, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);

  const stations = state.result?.stations ?? [];

  const getLocation = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser."));
      }
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });
  }
  
  const handleCurrentLocation = async () => {
    if (inputRef.current) {
        inputRef.current.value = 'Fetching your location...';
        inputRef.current.disabled = true;
    }
    try {
        const position = await getLocation();
        if (inputRef.current) {
            inputRef.current.value = `Using lat: ${position.coords.latitude.toFixed(2)}, long: ${position.coords.longitude.toFixed(2)}`;
        }
        if (latitudeRef.current) latitudeRef.current.value = position.coords.latitude.toString();
        if (longitudeRef.current) longitudeRef.current.value = position.coords.longitude.toString();
        
        // Submit the form
        formRef.current?.requestSubmit();

    } catch (error) {
        console.error("Error getting location", error);
        alert("Unable to retrieve your location. Please check your browser permissions and try again.");
    } finally {
        if (inputRef.current) {
           inputRef.current.disabled = false;
           // Consider not clearing the value so the user sees what was searched for
           // inputRef.current.value = ''; 
        }
    }
  };

  const customDispatch = (formData: FormData) => {
    if (inputRef.current?.value.startsWith('Using lat:')) {
      formData.set('query', inputRef.current.value);
    }
    dispatch(formData);
  }


  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Charging Station Locator</h1>
        <p className="text-muted-foreground">Find the nearest and most convenient charging stations for your EV.</p>
      </div>

      <Card>
        <form action={customDispatch} ref={formRef}>
          <input type="hidden" name="latitude" ref={latitudeRef} />
          <input type="hidden" name="longitude" ref={longitudeRef} />
          <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input name="query" ref={inputRef} placeholder="Search by name, city, or address..." className="pl-10" />
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-4">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={handleCurrentLocation}>
                <LocateFixed className="mr-2 h-4 w-4" />
                Use Current Location
              </Button>
              <Select>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Connector Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ccs">CCS</SelectItem>
                  <SelectItem value="chademo">CHAdeMO</SelectItem>
                  <SelectItem value="type2">Type 2</SelectItem>
                  <SelectItem value="ather">Ather</SelectItem>
                </SelectContent>
              </Select>
              <Select>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Charging Speed" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slow">Slow ({'<'}22kW)</SelectItem>
                  <SelectItem value="fast">Fast (22-100kW)</SelectItem>
                  <SelectItem value="ultra">Ultra-Fast ({'>'}100kW)</SelectItem>
                </SelectContent>
              </Select>
              <SubmitButton />
            </div>
          </CardContent>
        </form>
      </Card>
      
      {state.message && (
        <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.errors?.query && <p className="text-sm text-destructive">{state.errors.query[0]}</p>}

      <div className="grid gap-6">
        {stations.map((station) => (
          <Card key={station.id} className="flex flex-col">
            <CardHeader className="flex-grow">
              <div className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    {station.name}
                  </CardTitle>
                  <CardDescription>{station.address}</CardDescription>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="font-semibold">{station.distance}</p>
                  <Badge variant={station.isAvailable ? 'default' : 'destructive'} className="mt-1 bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700/50 data-[variant=destructive]:bg-red-100 data-[variant=destructive]:text-red-800 data-[variant=destructive]:border-red-300">
                    {station.isAvailable ? 'Available' : 'In Use'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="flex flex-wrap gap-4">
                {station.connectors.map((connector, index) => (
                  <div key={index} className="p-3 rounded-md bg-secondary flex-grow sm:flex-grow-0">
                    <p className="font-semibold">{connector.type}</p>
                    <p className="text-sm text-muted-foreground">{connector.speed}</p>
                    <p className="text-sm mt-1">
                      <span className="font-bold">{connector.available}</span>
                      <span className="text-muted-foreground">/{connector.total} available</span>
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
             <CardFooter>
                <Button asChild className="w-full">
                  <Link href={station.mapsUrl} target="_blank">
                    <Navigation className="mr-2 h-4 w-4" />
                    View on Map
                  </Link>
                </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
