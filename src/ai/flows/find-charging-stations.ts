
'use server';

/**
 * @fileOverview Finds charging stations based on a location query.
 *
 * - findEVChargingStations - A function that finds charging stations.
 * - FindEVChargingStationsInput - The input type for the findEVChargingStations function.
 * - FindEVChargingStationsOutput - The return type for the findEVChargingStations function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const FindEVChargingStationsInputSchema = z.object({
    query: z.string().describe('The location to search for charging stations, e.g., "Mumbai" or "near me".'),
    latitude: z.number().optional().describe("The user's current latitude."),
    longitude: z.number().optional().describe("The user's current longitude."),
});
export type FindEVChargingStationsInput = z.infer<typeof FindEVChargingStationsInputSchema>;

const FindEVChargingStationsOutputSchema = z.object({
    stations: z.array(z.object({
        id: z.string().describe("A unique identifier for the station."),
        name: z.string().describe("The name of the charging station."),
        address: z.string().describe("The full address of the station."),
        distance: z.string().describe("The distance to the station from the user's current location, e.g., '2.5 km'."),
        mapsUrl: z.string().url().describe("A URL to the station on a map service like Google Maps."),
        connectors: z.array(z.object({
            type: z.string().describe("The type of connector, e.g., 'CCS', 'CHAdeMO'."),
            speed: z.string().describe("The charging speed, eg., '150kW'."),
            available: z.number().describe("The number of available connectors of this type."),
            total: z.number().describe("The total number of connectors of this type.")
        })),
        isAvailable: z.boolean().describe("Whether any connectors are currently available at the station.")
    }))
});
export type FindEVChargingStationsOutput = z.infer<typeof FindEVChargingStationsOutputSchema>;

export async function findEVChargingStations(input: FindEVChargingStationsInput): Promise<FindEVChargingStationsOutput> {
  return findEVChargingStationsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'findEVChargingStationsPrompt',
  input: {schema: FindEVChargingStationsInputSchema},
  output: {schema: FindEVChargingStationsOutputSchema},
  prompt: `You are an EV charging station locator for India. Find charging stations in India based on the user's query.

{{#if latitude}}
Search near latitude: {{latitude}}, longitude: {{longitude}} in India.
{{else}}
Location: {{query}} in India.
{{/if}}

Return a list of charging stations with their details. Include a variety of connector types and speeds. Ensure the availability status and map URLs are realistic and valid. If you cannot find stations, return an empty array. All results must be within India.
`,
});

const findEVChargingStationsFlow = ai.defineFlow(
  {
    name: 'findEVChargingStationsFlow',
    inputSchema: FindEVChargingStationsInputSchema,
    outputSchema: FindEVChargingStationsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    
    // Add defensive check to ensure output is not null and stations is an array.
    if (!output || !Array.isArray(output.stations)) {
        return { stations: [] };
    }
    
    return output;
  }
);
