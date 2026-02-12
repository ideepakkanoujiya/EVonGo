
'use server';

/**
 * @fileOverview Finds EV service centers based on a location query.
 *
 * - findServiceCenters - A function that finds service centers.
 * - FindServiceCentersInput - The input type for the findServiceCenters function- FindServiceCentersOutput - The return type for the findServiceCenters function.
 */

import {ai} from '@/ai/genkit';
import {z}from 'genkit';

const FindServiceCentersInputSchema = z.object({
    query: z.string().describe('The location to search for service centers, e.g., "Bangalore" or "near me".'),
    latitude: z.number().optional().describe("The user's current latitude."),
    longitude: z.number().optional().describe("The user's current longitude."),
});
export type FindServiceCentersInput = z.infer<typeof FindServiceCentersInputSchema>;

const FindServiceCentersOutputSchema = z.object({
    serviceCenters: z.array(z.object({
        id: z.string().describe("A unique identifier for the service center."),
        name: z.string().describe("The name of the service center."),
        address: z.string().describe("The full address of the service center."),
        rating: z.number().describe("The user rating of the service center, out of 5."),
        phone: z.string().describe("The phone number of the service center."),
        mapsUrl: z.string().url().describe("A URL to the service center on a map service.")
    }))
});
export type FindServiceCentersOutput = z.infer<typeof FindServiceCentersOutputSchema>;

export async function findServiceCenters(input: FindServiceCentersInput): Promise<FindServiceCentersOutput> {
  return findServiceCentersFlow(input);
}

const prompt = ai.definePrompt({
  name: 'findServiceCentersPrompt',
  input: {schema: FindServiceCentersInputSchema},
  output: {schema: FindServiceCentersOutputSchema},
  prompt: `You are an EV service center locator for India. Find authorized and trusted service centers in India based on the user's query.

{{#if latitude}}
Search near latitude: {{latitude}}, longitude: {{longitude}} in India.
{{else}}
Location: {{query}} in India.
{{/if}}

Return a list of service centers with their details. Ensure the ratings, contact information, and Google Maps URLs are realistic and valid. If you cannot find any, return an empty array. All results must be within India.
`,
});

const findServiceCentersFlow = ai.defineFlow(
  {
    name: 'findServiceCentersFlow',
    inputSchema: FindServiceCentersInputSchema,
    outputSchema: FindServiceCentersOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    
    // Add defensive check to ensure output is not null and serviceCenters is an array.
    if (!output || !Array.isArray(output.serviceCenters)) {
        return { serviceCenters: [] };
    }

    return output;
  }
);
