
'use server';

/**
 * @fileOverview Adds a new community post to Firestore.
 */

import { ai } from '@/ai/genkit';
import { getFirebaseAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
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
    const db = getFirebaseAdminDb();
    await db.collection('communityPosts').add({
      ...post,
      timestamp: FieldValue.serverTimestamp(),
      replies: 0,
    });
  }
);
