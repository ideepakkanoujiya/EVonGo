
'use client';

import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/icons/logo';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

type AuthMode = 'signin' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      if (mode === 'signup') {
        if (!displayName) {
            setError("Full name is required to sign up.");
            setLoading(false);
            return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });
        // Manually update the user object in the auth state
        await auth.updateCurrentUser(userCredential.user);

      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.push('/planner');
    } catch (error: unknown) {
        let friendlyMessage = 'An error occurred. Please try again.';
        const errorCode =
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code: unknown }).code)
            : '';

        switch (errorCode) {
            case 'auth/email-already-in-use':
                friendlyMessage = 'This email is already in use. Please sign in or use a different email.';
                break;
            case 'auth/operation-not-allowed':
                friendlyMessage =
                  'This sign-in method is not enabled in Firebase. Enable Email/Password (or the provider you want) in Firebase Console → Authentication → Sign-in method.';
                break;
            case 'auth/weak-password':
                friendlyMessage = 'The password is too weak. Please use at least 6 characters.';
                break;
            case 'auth/invalid-email':
                friendlyMessage = 'The email address is not valid.';
                break;
            case 'auth/network-request-failed':
                friendlyMessage =
                  'Network error. If you enabled the Firebase Auth emulator, make sure it is running; otherwise disable it and try again.';
                break;
            case 'auth/invalid-api-key':
                friendlyMessage =
                  'Invalid API key. Double-check your `.env.local` Firebase values and restart the dev server.';
                break;
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                 friendlyMessage = 'Invalid email or password. Please try again.';
                 break;
            default:
                console.error('Authentication error:', error);
        }
        setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
    setEmail('');
    setPassword('');
    setDisplayName('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Logo className="h-12 w-auto" />
          </div>
          <CardTitle>{mode === 'signin' ? 'Welcome Back' : 'Create an Account'}</CardTitle>
          <CardDescription>
            {mode === 'signin'
              ? 'Sign in to access your EV dashboard and plans.'
              : 'Join to start planning your EV journeys.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Authentication Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleAuthAction} className="space-y-4">
            {mode === 'signup' && (
               <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Processing...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
            </Button>
          </form>

        </CardContent>
        <CardFooter className="flex-col gap-4 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
            <Button variant="link" onClick={toggleMode} className="p-1">
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </Button>
          </p>
          <div className="text-xs text-muted-foreground text-center">
            By continuing, you agree to our{' '}
            <Link href="/terms" className="underline hover:text-primary">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline hover:text-primary">
              Privacy Policy
            </Link>
            .
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
