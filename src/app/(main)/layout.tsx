
'use client';

import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { BottomNav } from '@/components/layout/bottom-nav';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  
  // AuthGate in root layout handles redirection now

  if (loading || !user) {
    return (
       <div className="flex min-h-screen">
         <div className="flex flex-1 flex-col">
            <header className="sticky top-0 z-10 w-full bg-card/80 backdrop-blur-md border-b">
                 <div className="container flex h-16 items-center justify-end">
                    <Skeleton className="h-8 w-8 rounded-full" />
                 </div>
            </header>
            <main className="flex-1 p-4 sm:p-6 lg:p-8">
                <div className="space-y-4">
                    <Skeleton className="h-12 w-1/2" />
                    <Skeleton className="h-24 w-full" />
                     <Skeleton className="h-64 w-full" />
                </div>
            </main>
         </div>
       </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24">{children}</main>
      <BottomNav />
    </div>
  );
}
