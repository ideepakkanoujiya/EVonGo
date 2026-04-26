
import type { Metadata } from 'next';
import { PT_Sans } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider, AuthGate } from '@/hooks/use-auth';
import './globals.css';

const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EVonGo - Your Smart EV Companion',
  description: 'A comprehensive web application for electric vehicle owners, featuring a smart route planner, charging station locator, and community hub.',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#2563EB" />
      </head>
      <body suppressHydrationWarning className={cn(ptSans.className, 'font-body antialiased', 'min-h-screen bg-background')}>
        <AuthProvider>
            <AuthGate>
                {children}
            </AuthGate>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
