import { NextResponse } from 'next/server';

type LocationSuggestion = {
  id: string;
  label: string;
  subtitle?: string;
  value: string;
};

type TomTomSearchResponse = {
  results?: Array<{
    id?: string;
    address?: {
      freeformAddress?: string;
      municipality?: string;
      countrySubdivision?: string;
      countryCodeISO3?: string;
    };
    position?: {
      lat?: number;
      lon?: number;
    };
  }>;
};

type OpenRouteAutocompleteResponse = {
  features?: Array<{
    properties?: {
      id?: string;
      label?: string;
      locality?: string;
      region?: string;
      country_a?: string;
    };
    geometry?: {
      coordinates?: [number, number];
    };
  }>;
};

function getRoutingProvider(): 'tomtom' | 'openrouteservice' {
  const provider = (process.env.ROUTING_PROVIDER || 'tomtom').toLowerCase();
  if (provider === 'tomtom' || provider === 'openrouteservice') {
    return provider;
  }
  return 'tomtom';
}

async function fetchTomTomSuggestions(query: string): Promise<LocationSuggestion[]> {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    throw new Error('Missing TOMTOM_API_KEY');
  }

  const countrySet = process.env.PLANNER_SUGGEST_COUNTRY || 'IN';
  const params = new URLSearchParams({
    key: apiKey,
    limit: '8',
    language: 'en-US',
    countrySet,
    typeahead: 'true',
  });

  const response = await fetch(
    `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?${params.toString()}`,
    { method: 'GET', cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error(`TomTom suggest failed with status ${response.status}`);
  }

  const data = (await response.json()) as TomTomSearchResponse;
  return (data.results || []).reduce<LocationSuggestion[]>((acc, item, index) => {
      const lat = item.position?.lat;
      const lon = item.position?.lon;
      const label = item.address?.freeformAddress || '';
      if (!label || typeof lat !== 'number' || typeof lon !== 'number') {
        return acc;
      }
      const subtitle = [item.address?.municipality, item.address?.countrySubdivision]
        .filter(Boolean)
        .join(', ');
      acc.push({
        id: item.id || `tt-${index}-${lat}-${lon}`,
        label,
        subtitle,
        value: `${lat}, ${lon}`,
      });
      return acc;
    }, []);
}

async function fetchOpenRouteSuggestions(query: string): Promise<LocationSuggestion[]> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENROUTESERVICE_API_KEY');
  }

  const country = process.env.PLANNER_SUGGEST_COUNTRY || 'IN';
  const params = new URLSearchParams({
    api_key: apiKey,
    text: query,
    size: '8',
    'boundary.country': country,
  });

  const response = await fetch(
    `https://api.openrouteservice.org/geocode/autocomplete?${params.toString()}`,
    { method: 'GET', cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error(`OpenRouteService suggest failed with status ${response.status}`);
  }

  const data = (await response.json()) as OpenRouteAutocompleteResponse;
  return (data.features || []).reduce<LocationSuggestion[]>((acc, item, index) => {
      const coords = item.geometry?.coordinates;
      const label = item.properties?.label || '';
      if (!label || !coords || coords.length !== 2) {
        return acc;
      }
      const subtitle = [item.properties?.locality, item.properties?.region]
        .filter(Boolean)
        .join(', ');
      acc.push({
        id: item.properties?.id || `ors-${index}-${coords[1]}-${coords[0]}`,
        label,
        subtitle,
        value: `${coords[1]}, ${coords[0]}`,
      });
      return acc;
    }, []);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim();
    if (query.length < 2) {
      return NextResponse.json({ success: true, suggestions: [] });
    }

    const provider = getRoutingProvider();
    let suggestions: LocationSuggestion[] = [];

    try {
      suggestions =
        provider === 'tomtom'
          ? await fetchTomTomSuggestions(query)
          : await fetchOpenRouteSuggestions(query);
    } catch {
      suggestions =
        provider === 'tomtom'
          ? await fetchOpenRouteSuggestions(query)
          : await fetchTomTomSuggestions(query);
    }

    return NextResponse.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
