'use server';

/**
 * @fileOverview Suggests optimal charging stops for a long trip, considering vehicle range, battery level, and charging speed.
 *
 * - suggestChargingStops - A function that suggests charging stops.
 * - SuggestChargingStopsInput - The input type for the suggestChargingStops function.
 * - SuggestChargingStopsOutput - The return type for the suggestChargingStops function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestChargingStopsInputSchema = z.object({
  vehicleRangeKm: z.number().describe('The vehicle\u2019s total range in kilometers when fully charged.'),
  currentBatteryPercentage: z
    .number()
    .describe('The current battery percentage, as a number between 0 and 100.'),
  chargingSpeedKw: z.number().describe('The vehicle\u2019s maximum charging speed in kW.'),
  startLocation: z.string().describe('The starting location for the trip. Can be a city name or "latitude,longitude".'),
  endLocation: z.string().describe('The destination location for the trip.'),
});
export type SuggestChargingStopsInput = z.infer<typeof SuggestChargingStopsInputSchema>;

const SuggestChargingStopsOutputSchema = z.object({
  chargingStops: z
    .array(
      z.object({
        location: z.string().describe('The name of the charging stop location.'),
        latitude: z.number().describe('The latitude of the charging stop location.'),
        longitude: z.number().describe('The longitude of the charging stop location.'),
        estimatedArrivalTime: z.string().describe('The estimated arrival time at the charging stop.'),
        chargingDurationMinutes: z
          .number()
          .describe('The estimated charging duration in minutes at the charging stop.'),
      })
    )
    .describe('An array of suggested charging stops along the route.'),
  totalTripDurationMinutes: z
    .number()
    .describe('The total trip duration in minutes, including charging stops.'),
  totalChargingTimeMinutes: z
    .number()
    .describe('The total charging time in minutes across all charging stops.'),
});
export type SuggestChargingStopsOutput = z.infer<typeof SuggestChargingStopsOutputSchema>;

export async function suggestChargingStops(input: SuggestChargingStopsInput): Promise<SuggestChargingStopsOutput> {
  return suggestChargingStopsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestChargingStopsPrompt',
  input: {schema: SuggestChargingStopsInputSchema},
  output: {schema: SuggestChargingStopsOutputSchema},
  prompt: `You are an AI-powered trip planner for electric vehicles in India. You will suggest optimal charging stops along the route, taking into account the vehicle's range, current battery level, charging speed, and real-time traffic conditions.

Vehicle Range: {{vehicleRangeKm}} km
Current Battery: {{currentBatteryPercentage}}%
Charging Speed: {{chargingSpeedKw}} kW
Start Location: {{startLocation}}
End Location: {{endLocation}}

Consider the following:
- The vehicle's remaining range based on the current battery percentage.
- The distance between the start and end locations.
- **Real-time traffic conditions**: Analyze current traffic patterns between the start and end locations. If there is heavy traffic, account for increased travel time and its impact on battery consumption. Adjust the route and charging stops to ensure the driver does not run out of battery.
- The availability of charging stations along the optimized route in India.
- The charging speed of the vehicle.
- Minimize the total trip duration, including driving and charging time.

Output the suggested charging stops as an array of objects, including the location, latitude, longitude, estimated arrival time, and charging duration in minutes. Also output the total trip duration and total charging time in minutes.
`,
});

const suggestChargingStopsFlow = ai.defineFlow(
  {
    name: 'suggestChargingStopsFlow',
    inputSchema: SuggestChargingStopsInputSchema,
    outputSchema: SuggestChargingStopsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
