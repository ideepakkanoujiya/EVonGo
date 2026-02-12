
'use server';

/**
 * @fileOverview Adds a new community post to Firestore.
 */

import { ai } from '@/ai/genkit';
import { getFirebaseDb } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { z } from 'genkit';

const AddCommunityPostSchema = z.object({
  title: z.string(),
  content: z.string(),
  userId: z.string(),
  author: z.string(),
  avatarUrl: z.string().url().optional(),
});

export type AddCommunityPostInput = z.infer<typeof AddCommunityPostSchema>;

export const addCommunityPost = ai.defineFlow(
  {
    name: 'addCommunityPost',
    inputSchema: AddCommunityPostSchema,
    outputSchema: z.void(),
  },
  async (post) => {
    const db = getFirebaseDb();
    await addDoc(collection(db, 'communityPosts'), {
      ...post,
      timestamp: serverTimestamp(),
      replies: 0,
    });
  }
);
