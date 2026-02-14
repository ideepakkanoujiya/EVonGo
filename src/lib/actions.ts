
'use server';

import { suggestChargingStops, type SuggestChargingStopsOutput } from '@/ai/flows/suggest-charging-stops';
import { findChargingStations, type FindChargingStationsOutput } from '@/ai/flows/find-charging-stations';
import { findServiceCenters, type FindServiceCentersOutput } from '@/ai/flows/find-service-centers';
import { addCommunityPost } from '@/ai/flows/addCommunityPost';
import { diagnoseProblem, type DiagnoseProblemOutput } from '@/ai/flows/diagnose-problem';
import { transcribeAudio } from '@/ai/flows/transcribe-audio';
import { textToSpeech } from '@/ai/flows/text-to-speech';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const RouteSchema = z.object({
  startLocation: z.string().min(3, { message: "Start location must be at least 3 characters." }),
  endLocation: z.string().min(3, { message: "End location must be at least 3 characters." }),
  vehicleRangeKm: z.coerce.number().min(80, { message: "Vehicle range must be at least 80 km." }),
  currentBatteryPercentage: z.coerce.number().min(0).max(100),
  chargingSpeedKw: z.coerce.number().min(1, { message: "Charging speed must be at least 1 kW." }),
});

export type RoutePlanState = {
  message?: string | null;
  errors?: {
    startLocation?: string[];
    endLocation?: string[];
    vehicleRangeKm?: string[];
    currentBatteryPercentage?: string[];
    chargingSpeedKw?: string[];
  };
  result?: SuggestChargingStopsOutput;
};

export async function planRoute(prevState: RoutePlanState, formData: FormData): Promise<RoutePlanState> {
  const validatedFields = RouteSchema.safeParse({
      startLocation: formData.get('startLocation'),
      endLocation: formData.get('endLocation'),
      vehicleRangeKm: formData.get('vehicleRangeKm'),
      currentBatteryPercentage: formData.get('currentBatteryPercentage'),
      chargingSpeedKw: formData.get('chargingSpeedKw'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input. Please check the fields.',
    };
  }

  try {
    const result = await suggestChargingStops(validatedFields.data);
    revalidatePath('/planner');
    return { result: result, message: 'Route plan generated successfully.' };
  } catch (error) {
    console.error('Error planning route:', error);
    return {
      message: 'Failed to generate route plan. Please try again.',
    };
  }
}


const LocationSearchSchema = z.object({
  query: z.string().min(1, { message: "Search query must be at least 1 character." }),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});


export type StationState = {
    message?: string | null;
    errors?: { query?: string[] };
    result?: FindChargingStationsOutput;
};

export async function searchStations(prevState: StationState, formData: FormData): Promise<StationState> {
    const validatedFields = LocationSearchSchema.safeParse({
        query: formData.get('query'),
        latitude: formData.get('latitude'),
        longitude: formData.get('longitude'),
    });
    
    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Invalid input.',
        };
    }

    try {
        const result = await findChargingStations(validatedFields.data);
        if (!result) {
            return { result: { stations: [] } };
        }
        revalidatePath('/stations');
        return { result };
    } catch (error) {
        console.error('Error searching stations:', error);
        return { message: 'Failed to find stations.' };
    }
}

export type ServiceCenterState = {
    message?: string | null;
    errors?: { query?: string[] };
    result?: FindServiceCentersOutput;
};

export async function searchServiceCenters(prevState: ServiceCenterState, formData: FormData): Promise<ServiceCenterState> {
    const validatedFields = LocationSearchSchema.safeParse({
        query: formData.get('query'),
        latitude: formData.get('latitude'),
        longitude: formData.get('longitude'),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Invalid input.',
        };
    }

    try {
        const result = await findServiceCenters(validatedFields.data);
        if (!result || !result.serviceCenters) {
          return { result: { serviceCenters: [] } };
        }
        revalidatePath('/service-centers');
        return { result };
    } catch (error) {
        console.error('Error searching service centers:', error);
        return { message: 'Failed to find service centers.' };
    }
}

const PostSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  userId: z.string(),
  author: z.string(),
  avatarUrl: z.string().url().optional(),
});

export type PostState = {
  message?: string | null;
  errors?: {
    title?: string[];
    content?: string[];
  };
}

export async function createPost(prevState: PostState, formData: FormData) {
  const validatedFields = PostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
    userId: formData.get('userId'),
    author: formData.get('author'),
    avatarUrl: formData.get('avatarUrl'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input. Please check the fields.',
    };
  }

  try {
    await addCommunityPost(validatedFields.data);
    revalidatePath('/community');
    return { message: 'Post created successfully.' };
  } catch (error) {
    console.error('Error creating post:', error);
    return {
      message: 'Failed to create post. Please try again.',
    };
  }
}

const fileToDataURI = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return `data:${file.type};base64,${buffer.toString('base64')}`;
}

const DiagnoseSchema = z.object({
    description: z.string().min(10, { message: "Please provide a more detailed description (at least 10 characters)." }),
    photo: z.instanceof(File).optional(),
});

export type DiagnoseState = {
    message?: string | null;
    errors?: {
        description?: string[];
        photo?: string[];
    };
    result?: DiagnoseProblemOutput;
}

export async function diagnoseProblemAction(prevState: DiagnoseState, formData: FormData): Promise<DiagnoseState> {
    const photo = formData.get('photo') as File;
    const validatedFields = DiagnoseSchema.safeParse({
        description: formData.get('description'),
        photo: photo && photo.size > 0 ? photo : undefined,
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Invalid input. Please check the fields.',
        };
    }

    try {
        let photoDataUri: string | undefined = undefined;
        if (validatedFields.data.photo) {
          photoDataUri = await fileToDataURI(validatedFields.data.photo);
        }
        
        const result = await diagnoseProblem({
            description: validatedFields.data.description,
            photoDataUri: photoDataUri,
        });
        revalidatePath('/assistant');
        return { result, message: 'Diagnosis complete.' };
    } catch (error) {
        console.error('Error diagnosing problem:', error);
        return {
            message: 'Failed to get diagnosis. The AI model may be unavailable. Please try again later.',
        };
    }
}

export async function transcribeAudioAction(audioDataUri: string): Promise<string> {
    try {
        const { text } = await transcribeAudio({ audioDataUri });
        return text;
    } catch (error) {
        console.error('Error transcribing audio:', error);
        return "Sorry, I couldn't understand the audio. Please try again.";
    }
}


export async function textToSpeechAction(text: string): Promise<string | null> {
    try {
        const { audioDataUri } = await textToSpeech({ text });
        return audioDataUri;
    } catch (error) {
        console.error('Error converting text to speech:', error);
        return null;
    }
}
