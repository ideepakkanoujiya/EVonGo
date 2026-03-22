import 'server-only';

import {
  FieldValue,
  Timestamp,
  type DocumentData,
} from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase-admin';
import type { CommunityPost, CommunityReply } from '@/lib/types';

type CreateCommunityPostInput = {
  title: string;
  content: string;
  userId: string;
  author: string;
  avatarUrl?: string;
};

type CreateCommunityReplyInput = {
  postId: string;
  content: string;
  userId: string;
  author: string;
  avatarUrl?: string;
};

function normalizeTimestamp(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === 'function') {
      return maybeTimestamp.toDate().toISOString();
    }
  }

  return null;
}

function mapPost(id: string, data: DocumentData): CommunityPost {
  return {
    id,
    author: typeof data.author === 'string' ? data.author : 'Anonymous',
    avatarUrl: typeof data.avatarUrl === 'string' && data.avatarUrl.length > 0 ? data.avatarUrl : undefined,
    title: typeof data.title === 'string' ? data.title : '',
    content: typeof data.content === 'string' ? data.content : '',
    timestamp: normalizeTimestamp(data.timestamp),
    userId: typeof data.userId === 'string' ? data.userId : '',
    replies: typeof data.replies === 'number' ? data.replies : 0,
    likes: typeof data.likes === 'number' ? data.likes : 0,
    likedByUserIds: Array.isArray(data.likedByUserIds)
      ? data.likedByUserIds.filter((value: unknown): value is string => typeof value === 'string')
      : [],
  };
}

function mapReply(postId: string, id: string, data: DocumentData): CommunityReply {
  return {
    id,
    postId,
    author: typeof data.author === 'string' ? data.author : 'Anonymous',
    avatarUrl: typeof data.avatarUrl === 'string' && data.avatarUrl.length > 0 ? data.avatarUrl : undefined,
    content: typeof data.content === 'string' ? data.content : '',
    timestamp: normalizeTimestamp(data.timestamp),
    userId: typeof data.userId === 'string' ? data.userId : '',
  };
}

export async function getCommunityPosts(): Promise<CommunityPost[]> {
  const db = getFirebaseAdminDb();
  const snapshot = await db.collection('communityPosts').orderBy('timestamp', 'desc').get();

  return snapshot.docs.map((postDoc) => mapPost(postDoc.id, postDoc.data()));
}

export async function getCommunityPostById(postId: string): Promise<CommunityPost | null> {
  const db = getFirebaseAdminDb();
  const snapshot = await db.collection('communityPosts').doc(postId).get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data();

  if (!data) {
    return null;
  }

  return mapPost(snapshot.id, data);
}

export async function getCommunityReplies(postId: string): Promise<CommunityReply[]> {
  const db = getFirebaseAdminDb();
  const snapshot = await db
    .collection('communityPosts')
    .doc(postId)
    .collection('replies')
    .orderBy('timestamp', 'asc')
    .get();

  return snapshot.docs.map((replyDoc) => mapReply(postId, replyDoc.id, replyDoc.data()));
}

export async function createCommunityPost(input: CreateCommunityPostInput): Promise<string> {
  const db = getFirebaseAdminDb();
  const postRef = await db.collection('communityPosts').add({
    title: input.title,
    content: input.content,
    userId: input.userId,
    author: input.author,
    avatarUrl: input.avatarUrl ?? '',
    timestamp: FieldValue.serverTimestamp(),
    replies: 0,
    likes: 0,
    likedByUserIds: [],
  });

  return postRef.id;
}

export async function createCommunityReply(input: CreateCommunityReplyInput): Promise<string> {
  const db = getFirebaseAdminDb();
  const postRef = db.collection('communityPosts').doc(input.postId);
  const replyRef = postRef.collection('replies').doc();
  const batch = db.batch();

  batch.set(replyRef, {
    content: input.content,
    userId: input.userId,
    author: input.author,
    avatarUrl: input.avatarUrl ?? '',
    timestamp: FieldValue.serverTimestamp(),
  });
  batch.update(postRef, {
    replies: FieldValue.increment(1),
  });

  await batch.commit();

  return replyRef.id;
}

export async function toggleCommunityPostLike(postId: string, userId: string) {
  const db = getFirebaseAdminDb();
  const postRef = db.collection('communityPosts').doc(postId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(postRef);

    if (!snapshot.exists) {
      throw new Error('Post not found.');
    }

    const data = snapshot.data();
    const likedByUserIds = Array.isArray(data?.likedByUserIds)
      ? data.likedByUserIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    const hasLiked = likedByUserIds.includes(userId);
    const currentLikes = typeof data?.likes === 'number' ? data.likes : 0;

    transaction.update(postRef, {
      likedByUserIds: hasLiked ? FieldValue.arrayRemove(userId) : FieldValue.arrayUnion(userId),
      likes: FieldValue.increment(hasLiked ? -1 : 1),
    });

    return {
      liked: !hasLiked,
      likes: Math.max(0, currentLikes + (hasLiked ? -1 : 1)),
    };
  });
}
