
'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, ThumbsUp, PlusCircle, Sparkles } from 'lucide-react';
import type { CommunityPost } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { createPost, type PostState } from '@/lib/actions';
import { getCommunityPosts } from '@/ai/flows/getCommunityPosts';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <><Sparkles className="mr-2 h-4 w-4 animate-spin" />Submitting...</> : "Submit Post"}
        </Button>
    )
}

export default function CommunityPage() {
    const { user, loading: authLoading } = useAuth();
    const [posts, setPosts] = useState<CommunityPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setDialogOpen] = useState(false);

    const initialState: PostState = {};
    const [state, dispatch] = useActionState(createPost, initialState);

    useEffect(() => {
        async function fetchPosts() {
            try {
                const fetchedPosts = await getCommunityPosts();
                setPosts(fetchedPosts as CommunityPost[]);
            } catch (error) {
                console.error("Failed to fetch posts:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchPosts();
    }, []);

    useEffect(() => {
        if(state?.message?.includes('success')) {
            setDialogOpen(false);
            // Re-fetch posts to show the new one
            getCommunityPosts().then(fetchedPosts => setPosts(fetchedPosts as CommunityPost[]));
        }
    }, [state]);

    const renderTimestamp = (timestamp: unknown) => {
        if (!timestamp) return 'Just now';
        try {
            const ts = timestamp as { toDate?: () => Date };
            let date: Date;
            if (typeof ts.toDate === 'function') {
              date = ts.toDate();
            } else if (timestamp instanceof Date) {
              date = timestamp;
            } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
              date = new Date(timestamp);
            } else {
              date = new Date();
            }
            return formatDistanceToNow(date, { addSuffix: true });
        } catch {
            return 'Invalid date';
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Community Hub</h1>
                    <p className="text-muted-foreground">Connect with fellow EV owners, ask questions, and share your experiences.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button disabled={authLoading || !user}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Start a Discussion
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Start a New Discussion</DialogTitle>
                            <DialogDescription>Share your thoughts with the community. Keep it respectful.</DialogDescription>
                        </DialogHeader>
                        <form action={dispatch}>
                             <div className="space-y-4 py-4">
                                <input type="hidden" name="userId" value={user?.uid} />
                                <input type="hidden" name="author" value={user?.displayName || 'Anonymous'} />
                                <input type="hidden" name="avatarUrl" value={user?.photoURL || ''} />
                                <div className="space-y-2">
                                    <Label htmlFor="title">Title</Label>
                                    <Input id="title" name="title" placeholder="What's on your mind?" required />
                                    {state?.errors?.title && <p className="text-sm text-destructive">{state.errors.title[0]}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="content">Content</Label>
                                    <Textarea id="content" name="content" placeholder="Elaborate on your topic..." required rows={5}/>
                                     {state?.errors?.content && <p className="text-sm text-destructive">{state.errors.content[0]}</p>}
                                </div>
                            </div>
                            <DialogFooter>
                                <SubmitButton />
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="space-y-6">
                {loading ? (
                   Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i}>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Skeleton className="h-10 w-10 rounded-full" />
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-[150px]" />
                                    <Skeleton className="h-3 w-[100px]" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Skeleton className="h-6 w-3/4" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                        </CardContent>
                        <CardFooter className="flex gap-4">
                           <Skeleton className="h-8 w-20" />
                           <Skeleton className="h-8 w-24" />
                        </CardFooter>
                    </Card>
                   ))
                ) : posts.length === 0 ? (
                    <Card className="text-center py-12">
                        <CardContent>
                            <h3 className="text-xl font-semibold">No discussions yet.</h3>
                            <p className="text-muted-foreground mt-2">Be the first to start a conversation!</p>
                        </CardContent>
                    </Card>
                ): (
                    posts.map((post) => (
                        <Card key={post.id}>
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <Avatar>
                                        <AvatarImage src={post.avatarUrl} alt={post.author} data-ai-hint="person avatar" />
                                        <AvatarFallback>{post.author.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-semibold">{post.author}</p>
                                        <p className="text-xs text-muted-foreground">{renderTimestamp(post.timestamp)}</p>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <CardTitle className="text-xl mb-2 hover:text-primary transition-colors">
                                    <Link href="#">{post.title}</Link>
                                </CardTitle>
                                <p className="text-muted-foreground whitespace-pre-wrap">{post.content}</p>
                            </CardContent>
                            <CardFooter className="flex gap-4">
                                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                                    <ThumbsUp className="h-4 w-4" />
                                    <span>Like</span>
                                </Button>
                                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4" />
                                    <span>{post.replies} Replies</span>
                                </Button>
                            </CardFooter>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
