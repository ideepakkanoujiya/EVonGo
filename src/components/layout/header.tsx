
'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Logo } from '../icons/logo';
import { cn } from '@/lib/utils';
import { InstallButton } from '@/components/ui/install-button';

const featureNavItems = [
  { href: '/planner', label: 'Planner' },
  { href: '/stations', label: 'Stations' },
  { href: '/service-centers', label: 'Service' },
  { href: '/assistant', label: 'Assistant' },
  { href: '/community', label: 'Community' },
  // { href: '/dashboard', label: 'Dashboard' },
  // { href: '/rewards', label: 'Rewards' },
  // { href: '/vehicle-log', label: 'Vehicle Log' },
  // { href: '/ev-analytics', label: 'EV Analytics' },
];

export function Header() {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  const handleLogout = async () => {
    await getFirebaseAuth().signOut();
  };

  return (
    <header className="sticky top-0 z-10 w-full bg-card/80 backdrop-blur-md border-b">
      <div className="container flex h-16 items-center gap-4">
         <Link href="/" className="flex items-center gap-2">
          <Logo className="h-10 w-auto" />
        </Link>
        <nav className="hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
          {featureNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                  isActive && 'bg-secondary text-foreground'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center justify-end space-x-2 md:space-x-4">
          <InstallButton />
          {loading ? (
            <Skeleton className="h-8 w-8 rounded-full" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} data-ai-hint="person avatar" />
                    <AvatarFallback>{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.displayName}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild>
                <Link href="/login">Log In</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
