
'use server';

/**
 * @fileOverview Diagnoses a vehicle problem based on a description and an optional photo, then finds a relevant YouTube video.
 *
 * - diagnoseProblem - A function that handles the vehicle diagnosis process.
 * - DiagnoseProblemInput - The input type for the diagnoseProblem function.
 * - DiagnoseProblemOutput - The return type for the diagnoseProblem function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DiagnoseProblemInputSchema = z.object({
  photoDataUri: z
    .string()
    .optional()
    .describe(
      "An optional photo of the vehicle problem, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  description: z.string().describe('The user\'s description of the vehicle problem.'),
});
export type DiagnoseProblemInput = z.infer<typeof DiagnoseProblemInputSchema>;

const DiagnoseProblemOutputSchema = z.object({
  diagnosis: z.string().describe("A brief diagnosis of the potential vehicle problem."),
  youtubeSearchQuery: z.string().describe("A concise search query for YouTube that would find a relevant video to help solve the problem."),
});
export type DiagnoseProblemOutput = z.infer<typeof DiagnoseProblemOutputSchema>;


export async function diagnoseProblem(input: DiagnoseProblemInput): Promise<DiagnoseProblemOutput> {
  return diagnoseProblemFlow(input);
}

const prompt = ai.definePrompt({
  name: 'diagnoseProblemPrompt',
  input: {schema: DiagnoseProblemInputSchema},
  output: {schema: DiagnoseProblemOutputSchema},
  prompt: `You are an expert EV mechanic. A user is providing a description and possibly a photo of a problem with their electric vehicle. The user's description may be in English, Hindi, or a mix (Hinglish).

Your task is to:
1.  Analyze the description and the photo (if provided) to diagnose the most likely issue.
2.  Provide a brief, clear diagnosis of the problem in the same language as the user's description.
3.  Generate a concise, effective search query for YouTube to find a video explaining how to fix the issue. The query should be specific to EV repair and should be in a language appropriate for the search (usually English for broader results, but use Hindi script if the original query was primarily in Hindi).
4.  Return the diagnosis and the YouTube search query.

Problem Description: {{{description}}}
{{#if photoDataUri}}
Photo of the problem: {{media url=photoDataUri}}
{{/if}}

Provide your response in the requested JSON format.
`,
});

const diagnoseProblemFlow = ai.defineFlow(
  {
    name: 'diagnoseProblemFlow',
    inputSchema: DiagnoseProblemInputSchema,
    outputSchema: DiagnoseProblemOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
