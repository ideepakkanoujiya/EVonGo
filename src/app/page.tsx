
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';

export default function Home() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (user) {
                router.replace('/planner');
            } else {
                router.replace('/login');
            }
        }
    }, [user, loading, router]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <div className="space-y-4 flex flex-col items-center">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2 flex flex-col items-center">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                </div>
            </div>
        </div>
    );
}
