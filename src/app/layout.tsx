
import type { Metadata } from 'next';
import { cn } from '@/lib/utils';
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider, AuthGate } from '@/hooks/use-auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'EVgoMap - Your Smart EV Companion',
  description: 'A comprehensive web application for electric vehicle owners, featuring a smart route planner, charging station locator, and community hub.',
  manifest: '/manifest.json',
  icons: {
    icon: 'https://i.ibb.co/WWWkDvDt/Gemini-Generated-Image-tww1nrtww1nrtww1.png',
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#2563EB" />
      </head>
      <body className={cn('font-body antialiased', 'min-h-screen bg-background')}>
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
