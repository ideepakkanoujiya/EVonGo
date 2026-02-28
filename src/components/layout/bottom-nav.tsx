
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Map } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/planner', label: 'Planner', icon: Map },
  // { href: '/stations', label: 'Stations', icon: Fuel },
  // { href: '/service-centers', label: 'Service', icon: Wrench },
  // { href: '/community', label: 'Community', icon: Users },
  // { href: '/assistant', label: 'Assistant', icon: Bot },
  // { href: '/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-card border-t md:hidden">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 text-xs text-muted-foreground transition-colors w-full py-2',
                isActive && 'text-primary'
              )}
            >
              <Icon className="h-6 w-6" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
