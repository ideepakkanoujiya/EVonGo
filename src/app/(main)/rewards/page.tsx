'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Award, Zap, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { getRewardsSummary, type RewardsSummary } from '@/lib/user-data';

const defaultSummary: RewardsSummary = {
  points: 0,
  tier: 'Bronze',
  nextTier: 'Silver',
  nextTierPoints: 20000,
  pointsToNextTier: 20000,
};

export default function RewardsPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<RewardsSummary>(defaultSummary);

  useEffect(() => {
    if (!user?.uid) return;
    setSummary(getRewardsSummary(user.uid));
  }, [user?.uid]);

  const progress = summary.nextTierPoints
    ? (summary.points / summary.nextTierPoints) * 100
    : 100;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Rewards Program</h1>
        <p className="text-muted-foreground">Earn points from distance driven and charging-stop optimized trips.</p>
      </div>

      <Card className="bg-gradient-to-r from-primary to-blue-500 text-primary-foreground">
        <CardHeader>
          <CardTitle>Your Loyalty Points</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-5xl font-bold">{summary.points.toLocaleString('en-IN')}</p>
          <p className="mt-2 text-primary-foreground/80">
            You are a <span className="font-semibold">{summary.tier} Member</span>
          </p>
        </CardContent>
      </Card>

      {summary.nextTier ? (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-headline">Next Reward Tier: {summary.nextTier}</h2>
          <Card>
            <CardContent className="p-6">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-muted-foreground">Progress</p>
                <p className="font-semibold">
                  {summary.points.toLocaleString('en-IN')} / {summary.nextTierPoints?.toLocaleString('en-IN')} Points
                </p>
              </div>
              <Progress value={Math.min(100, progress)} />
              <p className="mt-2 text-sm text-muted-foreground">
                You are <span className="font-bold text-foreground">{summary.pointsToNextTier.toLocaleString('en-IN')}</span> points away from reaching {summary.nextTier}.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-6">
            <p className="font-semibold">You have reached the highest tier: Platinum.</p>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-2xl font-bold font-headline">Available Rewards</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <Award className="mb-2 h-8 w-8 text-primary" />
              <CardTitle>Free Charging Credit</CardTitle>
              <CardDescription>Redeem 5,000 points for Rs 500 in charging credit at partner stations.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled={summary.points < 5000}>Redeem</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Zap className="mb-2 h-8 w-8 text-primary" />
              <CardTitle>Exclusive Merchandise</CardTitle>
              <CardDescription>Get exclusive EVonGo t-shirts, caps, and more. Starts at 2,500 points.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled={summary.points < 2500}>Browse Store</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck className="mb-2 h-8 w-8 text-primary" />
              <CardTitle>Service Discount</CardTitle>
              <CardDescription>Use 10,000 points for a 15% discount at partner service centers.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled={summary.points < 10000}>Claim Offer</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
