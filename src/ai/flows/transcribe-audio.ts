
'use server';
/**
 * @fileOverview Transcribes audio to text.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const TranscribeAudioInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "Audio data as a data URI. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type TranscribeAudioInput = z.infer<typeof TranscribeAudioInputSchema>;

const TranscribeAudioOutputSchema = z.object({
  text: z.string().describe('The transcribed text.'),
});
export type TranscribeAudioOutput = z.infer<typeof TranscribeAudioOutputSchema>;

export async function transcribeAudio(
  input: TranscribeAudioInput
): Promise<TranscribeAudioOutput> {
  return transcribeAudioFlow(input);
}

const transcribeAudioFlow = ai.defineFlow(
  {
    name: 'transcribeAudioFlow',
    inputSchema: TranscribeAudioInputSchema,
    outputSchema: TranscribeAudioOutputSchema,
  },
  async input => {
    const llmResponse = await ai.generate({
      prompt: [
        {text: 'Transcribe the following audio recording. The user might speak in English, Hindi, or a mix of both (Hinglish). Provide the transcription in the language(s) spoken.'},
        {media: {url: input.audioDataUri}},
      ],
    });

    return {text: llmResponse.text};
  }
);
