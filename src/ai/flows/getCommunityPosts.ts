
'use server';

/**
 * @fileOverview Fetches community posts from Firestore.
 */

import { ai } from '@/ai/genkit';
import { getFirebaseDb } from '@/lib/firebase';
import type { CommunityPost } from '@/lib/types';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { z } from 'genkit';

export const getCommunityPosts = ai.defineFlow(
  {
    name: 'getCommunityPosts',
    inputSchema: z.void(),
    outputSchema: z.array(z.any()), // Using z.any() to accommodate Firestore Timestamps
  },
  async () => {
    const db = getFirebaseDb();
    const postsCollection = collection(db, 'communityPosts');
    const postsQuery = query(postsCollection, orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(postsQuery);
    
    const posts: CommunityPost[] = [];
    querySnapshot.forEach((doc) => {
      posts.push({ id: doc.id, ...doc.data() } as CommunityPost);
    });
    
    return posts;
  }
);
