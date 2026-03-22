'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { addReply, type ReplyState } from '@/lib/community-actions';
import type { CommunityPost, CommunityReply } from '@/lib/types';
import { CommunityLikeButton } from '@/components/community/community-like-button';

type CommunityPostViewProps = {
  post: CommunityPost;
  replies: CommunityReply[];
};

function formatTimestamp(timestamp: string | Date | null) {
  if (!timestamp) {
    return 'Just now';
  }

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return formatDistanceToNow(date, { addSuffix: true });
}

function ReplySubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Sparkles className="h-4 w-4 animate-spin" />
          Posting...
        </>
      ) : (
        'Post Reply'
      )}
    </Button>
  );
}

export function CommunityPostView({ post, replies }: CommunityPostViewProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { user, loading } = useAuth();
  const { toast } = useToast();

  const initialState: ReplyState = {};
  const [state, dispatch] = useActionState(addReply, initialState);

  useEffect(() => {
    if (!state.message) {
      return;
    }

    if (state.success) {
      formRef.current?.reset();
      toast({
        title: 'Reply added',
        description: 'Your reply has been added to the discussion.',
      });
      router.refresh();
      return;
    }

    toast({
      title: 'Could not add reply',
      description: state.message,
      variant: 'destructive',
    });
  }, [router, state, toast]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" className="w-fit px-0">
        <Link href="/community">
          <ArrowLeft className="h-4 w-4" />
          Back to community
        </Link>
      </Button>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={post.avatarUrl} alt={post.author} data-ai-hint="person avatar" />
              <AvatarFallback>{post.author.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{post.author}</p>
              <p className="text-xs text-muted-foreground">{formatTimestamp(post.timestamp)}</p>
            </div>
          </div>
          <div className="space-y-3">
            <CardTitle className="text-3xl leading-tight">{post.title}</CardTitle>
            <p className="whitespace-pre-wrap text-muted-foreground">{post.content}</p>
          </div>
        </CardHeader>
        <CardFooter className="flex flex-wrap items-center gap-2">
          <CommunityLikeButton postId={post.id} likes={post.likes} likedByUserIds={post.likedByUserIds} />
          <Button type="button" variant="ghost" size="sm" className="flex items-center gap-2" disabled>
            <MessageSquare className="h-4 w-4" />
            <span>{post.replies} Replies</span>
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Add your reply</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={dispatch} className="space-y-4">
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="userId" value={user?.uid ?? ''} />
            <input type="hidden" name="author" value={user?.displayName ?? user?.email ?? 'Anonymous'} />
            <input type="hidden" name="avatarUrl" value={user?.photoURL ?? ''} />
            <div className="space-y-2">
              <Label htmlFor="content">Reply</Label>
              <Textarea
                id="content"
                name="content"
                rows={5}
                placeholder={user ? 'Share your perspective with the community.' : 'Sign in to join this discussion.'}
                required
                disabled={loading || !user}
              />
              {state.errors?.content ? (
                <p className="text-sm text-destructive">{state.errors.content[0]}</p>
              ) : null}
            </div>
            <ReplySubmitButton />
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Replies</h2>
        {replies.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No replies yet. Be the first to jump in.
            </CardContent>
          </Card>
        ) : (
          replies.map((reply) => (
            <Card key={reply.id}>
              <CardHeader className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={reply.avatarUrl} alt={reply.author} data-ai-hint="person avatar" />
                    <AvatarFallback>{reply.author.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{reply.author}</p>
                    <p className="text-xs text-muted-foreground">{formatTimestamp(reply.timestamp)}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-muted-foreground">{reply.content}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
