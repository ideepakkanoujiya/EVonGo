
import { config } from 'dotenv';
config();

import '@/ai/flows/suggest-charging-stops.ts';
import '@/ai/flows/find-charging-stations.ts';
import '@/ai/flows/find-service-centers.ts';
import '@/ai/flows/addCommunityPost.ts';
import '@/ai/flows/getCommunityPosts.ts';
import '@/ai/flows/diagnose-problem.ts';
import '@/ai/flows/transcribe-audio.ts';
import '@/ai/flows/text-to-speech.ts';
