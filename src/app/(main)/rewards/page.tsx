
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Award, Zap, ShieldCheck } from 'lucide-react';

export default function RewardsPage() {
  const points = 0;
  const nextTierPoints = 20000;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Rewards Program</h1>
        <p className="text-muted-foreground">Earn points for driving green and engaging with the community.</p>
      </div>

      <Card className="bg-gradient-to-r from-primary to-blue-500 text-primary-foreground">
        <CardHeader>
          <CardTitle>Your Loyalty Points</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-5xl font-bold">{points.toLocaleString('en-IN')}</p>
          <p className="mt-2 text-primary-foreground/80">You are a <span className="font-semibold">Bronze Member</span></p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold font-headline">Next Reward Tier: Silver</h2>
        <Card>
            <CardContent className="p-6">
                <div className="flex justify-between items-center mb-2">
                    <p className="text-muted-foreground">Progress</p>
                    <p className="font-semibold">{points.toLocaleString('en-IN')} / {nextTierPoints.toLocaleString('en-IN')} Points</p>
                </div>
                <Progress value={(points / nextTierPoints) * 100} />
                <p className="text-sm text-muted-foreground mt-2">You are <span className="font-bold text-foreground">{(nextTierPoints - points).toLocaleString('en-IN')}</span> points away from reaching Silver!</p>
            </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-2xl font-bold font-headline">Available Rewards</h2>
        <div className="grid gap-6 mt-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <Award className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Free Charging Credit</CardTitle>
              <CardDescription>Redeem 5,000 points for ₹500 in charging credit at partner stations.</CardDescription>
            </CardHeader>
            <CardContent>
                <button className="w-full bg-accent text-accent-foreground text-sm font-semibold py-2 rounded-md hover:bg-accent/90 transition-colors disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed" disabled={points < 5000}>Redeem</button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Zap className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Exclusive Merchandise</CardTitle>
              <CardDescription>Get exclusive EVgoMap t-shirts, caps, and more. Starts at 2,500 points.</CardDescription>
            </CardHeader>
            <CardContent>
                <button className="w-full bg-accent text-accent-foreground text-sm font-semibold py-2 rounded-md hover:bg-accent/90 transition-colors disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed" disabled={points < 2500}>Browse Store</button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Service Discount</CardTitle>
              <CardDescription>Use 10,000 points for a 15% discount at partner service centers.</CardDescription>
            </CardHeader>
            <CardContent>
                <button className="w-full bg-accent text-accent-foreground text-sm font-semibold py-2 rounded-md hover:bg-accent/90 transition-colors disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed" disabled={points < 10000}>Claim Offer</button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
