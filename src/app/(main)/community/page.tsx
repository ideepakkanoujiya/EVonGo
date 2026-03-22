import { CommunityFeed } from '@/components/community/community-feed';
import { getCommunityPosts } from '@/lib/community';

export const dynamic = 'force-dynamic';

export default async function CommunityPage() {
  const posts = await getCommunityPosts();

  return <CommunityFeed posts={posts} />;
}
