
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { searchServiceCenters, type ServiceCenterState } from '@/lib/actions';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Star, Phone, Search, MapPin, LocateFixed, Sparkles, Navigation } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useRef } from 'react';

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

export default function ServiceCentersPage() {
  const initialState: ServiceCenterState = {};
  const [state, dispatch] = useActionState(searchServiceCenters, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);

  const centers = state.result?.serviceCenters ?? [];

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
        <h1 className="text-3xl font-bold font-headline">Find a Service Center</h1>
        <p className="text-muted-foreground">Locate trusted and verified EV service centers near you.</p>
      </div>

      <Card>
        <form action={customDispatch} ref={formRef}>
            <input type="hidden" name="latitude" ref={latitudeRef} />
            <input type="hidden" name="longitude" ref={longitudeRef} />
            <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input name="query" ref={inputRef} placeholder="Enter your city or area..." className="pl-10" />
            </div>
            <Button type="button" variant="outline" onClick={handleCurrentLocation}>
                <LocateFixed className="mr-2 h-4 w-4" />
                Use Current Location
                </Button>
             <SubmitButton/>
            </CardContent>
        </form>
      </Card>

      {state.message && !state.result?.serviceCenters?.length && (
        <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.errors?.query && <p className="text-sm text-destructive">{state.errors.query[0]}</p>}
      
      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {centers.map((center) => (
          <Card key={center.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <CardTitle>{center.name}</CardTitle>
                <div className="flex items-center gap-1 text-sm font-bold text-amber-500 bg-amber-100 px-2 py-1 rounded-full">
                  <Star className="h-4 w-4 fill-current" />
                  <span>{center.rating}</span>
                </div>
              </div>
              <CardDescription className="flex items-center gap-2 pt-2">
                <MapPin className="h-4 w-4" />
                {center.address}
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex justify-between">
              <Button variant="outline" asChild>
                <Link href={`tel:${center.phone}`}>
                  <Phone className="mr-2 h-4 w-4" />
                  Call Now
                </Link>
              </Button>
              <Button asChild>
                <Link href={center.mapsUrl} target="_blank">
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
