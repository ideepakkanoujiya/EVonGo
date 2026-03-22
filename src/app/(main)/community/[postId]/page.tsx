import { notFound } from 'next/navigation';
import { CommunityPostView } from '@/components/community/community-post-view';
import { getCommunityPostById, getCommunityReplies } from '@/lib/community';

export const dynamic = 'force-dynamic';

type CommunityPostPageProps = {
  params: Promise<{
    postId: string;
  }>;
};

export default async function CommunityPostPage({ params }: CommunityPostPageProps) {
  const { postId } = await params;
  const [post, replies] = await Promise.all([
    getCommunityPostById(postId),
    getCommunityReplies(postId),
  ]);

  if (!post) {
    notFound();
  }

  return <CommunityPostView post={post} replies={replies} />;
}
