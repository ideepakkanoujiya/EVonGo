'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  createCommunityPost,
  createCommunityReply,
  toggleCommunityPostLike,
} from '@/lib/community';

const PostSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters.'),
  content: z.string().trim().min(10, 'Content must be at least 10 characters.'),
  userId: z.string().trim().min(1, 'Please sign in to post.'),
  author: z.string().trim().min(1, 'Author is required.'),
  avatarUrl: z
    .union([z.string().trim().url(), z.literal('')])
    .optional()
    .transform((value) => value || undefined),
});

export type PostState = {
  message?: string | null;
  success?: boolean;
  postId?: string;
  errors?: {
    title?: string[];
    content?: string[];
    userId?: string[];
    author?: string[];
  };
};

export async function createPost(prevState: PostState, formData: FormData): Promise<PostState> {
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
      success: false,
    };
  }

  try {
    const postId = await createCommunityPost(validatedFields.data);
    revalidatePath('/community');
    revalidatePath(`/community/${postId}`);
    return { message: 'Post created successfully.', success: true, postId };
  } catch (error) {
    console.error('Error creating post:', error);
    return {
      message: 'Failed to create post. Please try again.',
      success: false,
    };
  }
}

const ReplySchema = z.object({
  postId: z.string().trim().min(1, 'Post is required.'),
  content: z.string().trim().min(2, 'Reply must be at least 2 characters.'),
  userId: z.string().trim().min(1, 'Please sign in to reply.'),
  author: z.string().trim().min(1, 'Author is required.'),
  avatarUrl: z
    .union([z.string().trim().url(), z.literal('')])
    .optional()
    .transform((value) => value || undefined),
});

export type ReplyState = {
  message?: string | null;
  success?: boolean;
  errors?: {
    postId?: string[];
    content?: string[];
    userId?: string[];
    author?: string[];
  };
};

export async function addReply(prevState: ReplyState, formData: FormData): Promise<ReplyState> {
  const validatedFields = ReplySchema.safeParse({
    postId: formData.get('postId'),
    content: formData.get('content'),
    userId: formData.get('userId'),
    author: formData.get('author'),
    avatarUrl: formData.get('avatarUrl'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input. Please check the fields.',
      success: false,
    };
  }

  try {
    await createCommunityReply(validatedFields.data);
    revalidatePath('/community');
    revalidatePath(`/community/${validatedFields.data.postId}`);
    return {
      message: 'Reply added successfully.',
      success: true,
    };
  } catch (error) {
    console.error('Error creating reply:', error);
    return {
      message: 'Failed to add reply. Please try again.',
      success: false,
    };
  }
}

const ToggleCommunityLikeSchema = z.object({
  postId: z.string().trim().min(1, 'Post is required.'),
  userId: z.string().trim().min(1, 'Please sign in to like posts.'),
});

export async function togglePostLikeAction(input: { postId: string; userId: string }) {
  const validatedFields = ToggleCommunityLikeSchema.safeParse(input);

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Invalid request.',
    };
  }

  try {
    const result = await toggleCommunityPostLike(validatedFields.data.postId, validatedFields.data.userId);
    revalidatePath('/community');
    revalidatePath(`/community/${validatedFields.data.postId}`);
    return {
      success: true,
      message: result.liked ? 'Post liked.' : 'Like removed.',
      ...result,
    };
  } catch (error) {
    console.error('Error toggling post like:', error);
    return {
      success: false,
      message: 'Failed to update like. Please try again.',
    };
  }
}
