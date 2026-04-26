'use client';

import { useState, useEffect } from 'react';
import { Button } from './button';
import { Download } from 'lucide-react';

export function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI to notify the user they can install the PWA
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // If the app is already installed, hide the button
    window.addEventListener('appinstalled', () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
  };

  if (!isInstallable) {
    return null;
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleInstallClick}
      className="flex gap-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary border-primary/20"
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Install App</span>
      <span className="inline sm:hidden">Install</span>
    </Button>
  );
}
