
'use server';

/**
 * @fileOverview Fetches community posts from Firestore.
 */

import { ai } from '@/ai/genkit';
import { getFirebaseAdminDb } from '@/lib/firebase-admin';
import type { CommunityPost } from '@/lib/types';
import { z } from 'genkit';

export const getCommunityPosts = ai.defineFlow(
  {
    name: 'getCommunityPosts',
    inputSchema: z.void(),
    outputSchema: z.array(z.any()), // Using z.any() to accommodate Firestore Timestamps
  },
  async () => {
    const db = getFirebaseAdminDb();
    const querySnapshot = await db.collection('communityPosts').orderBy('timestamp', 'desc').get();
    
    const posts: CommunityPost[] = [];
    querySnapshot.forEach((doc) => {
      posts.push({ id: doc.id, ...doc.data() } as CommunityPost);
    });
    
    return posts;
  }
);
