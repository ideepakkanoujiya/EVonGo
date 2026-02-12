
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProfilePage() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
        <div className="space-y-8">
            <Skeleton className="h-12 w-1/4" />
            <Skeleton className="h-4 w-1/2" />
            
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-1/3" />
                    <Skeleton className="h-4 w-2/3" />
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-20 w-20 rounded-full" />
                        <Skeleton className="h-10 w-24" />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                         <Skeleton className="h-12 w-full" />
                         <Skeleton className="h-12 w-full" />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Your Profile</h1>
        <p className="text-muted-foreground">Manage your account settings and vehicle details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>Update your personal information and password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.photoURL || ''} alt="User Avatar" data-ai-hint="person avatar"/>
              <AvatarFallback>{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
            <Button variant="outline">Change Photo</Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" defaultValue={user.displayName || ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" defaultValue={user.email || ''} disabled />
            </div>
          </div>
           <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input id="password" type="password" placeholder="Enter a new password" />
            </div>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Default Vehicle</CardTitle>
          <CardDescription>Set your default vehicle for quicker route planning.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="v-make">Vehicle Make</Label>
                    <Input id="v-make" placeholder="e.g., Tata" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="v-model">Vehicle Model</Label>
                    <Input id="v-model" placeholder="e.g., Nexon EV" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="v-range">Max Range (km)</Label>
                    <Input id="v-range" type="number" placeholder="e.g., 300" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="v-speed">Max Charging Speed (kW)</Label>
                    <Input id="v-speed" type="number" placeholder="e.g., 50" />
                </div>
            </div>
        </CardContent>
      </Card>
      
      <div className="flex justify-end">
          <Button>Save Changes</Button>
      </div>

    </div>
  );
}
