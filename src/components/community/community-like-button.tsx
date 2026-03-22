'use client';

import { useTransition } from 'react';
import { ThumbsUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { togglePostLikeAction } from '@/lib/community-actions';
import { cn } from '@/lib/utils';

type CommunityLikeButtonProps = {
  postId: string;
  likes: number;
  likedByUserIds?: string[];
};

export function CommunityLikeButton({
  postId,
  likes,
  likedByUserIds = [],
}: CommunityLikeButtonProps) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const hasLiked = !!user && likedByUserIds.includes(user.uid);

  const handleClick = () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to like community posts.',
        variant: 'destructive',
      });
      return;
    }

    startTransition(async () => {
      const result = await togglePostLikeAction({ postId, userId: user.uid });

      if (!result.success) {
        toast({
          title: 'Could not update like',
          description: result.message,
          variant: 'destructive',
        });
        return;
      }

      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      variant={hasLiked ? 'secondary' : 'ghost'}
      size="sm"
      className="flex items-center gap-2"
      disabled={loading || isPending}
      onClick={handleClick}
    >
      <ThumbsUp className={cn('h-4 w-4', hasLiked && 'text-primary')} />
      <span>{likes} Likes</span>
    </Button>
  );
}
