'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, MessageSquare, PlusCircle, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { createPost, type PostState } from '@/lib/community-actions';
import type { CommunityPost } from '@/lib/types';
import { CommunityLikeButton } from '@/components/community/community-like-button';

type CommunityFeedProps = {
  posts: CommunityPost[];
};

function formatTimestamp(timestamp: CommunityPost['timestamp']) {
  if (!timestamp) {
    return 'Just now';
  }

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return formatDistanceToNow(date, { addSuffix: true });
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Sparkles className="h-4 w-4 animate-spin" />
          Submitting...
        </>
      ) : (
        'Submit Post'
      )}
    </Button>
  );
}

export function CommunityFeed({ posts }: CommunityFeedProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setDialogOpen] = useState(false);

  const initialState: PostState = {};
  const [state, dispatch] = useActionState(createPost, initialState);

  useEffect(() => {
    if (!state.message) {
      return;
    }

    if (state.success) {
      formRef.current?.reset();
      setDialogOpen(false);
      toast({
        title: 'Discussion posted',
        description: 'Your discussion is now live for the community.',
      });
      router.refresh();
      return;
    }

    toast({
      title: 'Could not create post',
      description: state.message,
      variant: 'destructive',
    });
  }, [router, state, toast]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold font-headline">Community Hub</h1>
          <p className="max-w-2xl text-muted-foreground">
            Connect with fellow EV owners, ask practical questions, and swap real-world charging,
            maintenance, and route-planning tips.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={authLoading || !user}>
              <PlusCircle className="h-4 w-4" />
              Start a Discussion
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start a New Discussion</DialogTitle>
              <DialogDescription>
                Share a question, tip, or experience with the EV community.
              </DialogDescription>
            </DialogHeader>
            <form ref={formRef} action={dispatch} className="space-y-4">
              <input type="hidden" name="userId" value={user?.uid ?? ''} />
              <input type="hidden" name="author" value={user?.displayName ?? user?.email ?? 'Anonymous'} />
              <input type="hidden" name="avatarUrl" value={user?.photoURL ?? ''} />
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" placeholder="What would you like to discuss?" required />
                {state.errors?.title ? (
                  <p className="text-sm text-destructive">{state.errors.title[0]}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  name="content"
                  placeholder="Add some details so others can help."
                  rows={6}
                  required
                />
                {state.errors?.content ? (
                  <p className="text-sm text-destructive">{state.errors.content[0]}</p>
                ) : null}
              </div>
              <DialogFooter>
                <SubmitButton />
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {posts.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent className="space-y-2">
            <h2 className="text-xl font-semibold">No discussions yet.</h2>
            <p className="text-muted-foreground">
              Start the first thread and help kick off the community.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {posts.map((post) => (
            <Card key={post.id}>
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
                <div className="space-y-2">
                  <CardTitle className="text-xl">
                    <Link
                      href={`/community/${post.id}`}
                      className="transition-colors hover:text-primary"
                    >
                      {post.title}
                    </Link>
                  </CardTitle>
                  <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{post.content}</p>
                </div>
              </CardHeader>
              <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <CommunityLikeButton
                    postId={post.id}
                    likes={post.likes}
                    likedByUserIds={post.likedByUserIds}
                  />
                  <Button asChild variant="ghost" size="sm" className="flex items-center gap-2">
                    <Link href={`/community/${post.id}`}>
                      <MessageSquare className="h-4 w-4" />
                      <span>{post.replies} Replies</span>
                    </Link>
                  </Button>
                </div>
                <Button asChild variant="link" className="px-0">
                  <Link href={`/community/${post.id}`}>
                    Join discussion
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
