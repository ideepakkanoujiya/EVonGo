'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Leaf, BarChart2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { buildMonthlyMetrics, getTotals, type MonthlyMetric } from '@/lib/user-data';

export default function DashboardPage() {
  const { user } = useAuth();
  const [monthlyData, setMonthlyData] = useState<MonthlyMetric[]>([]);
  const [totalSavings, setTotalSavings] = useState(0);
  const [totalCO2Avoided, setTotalCO2Avoided] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;
    const metrics = buildMonthlyMetrics(user.uid);
    const totals = getTotals(user.uid);
    setMonthlyData(metrics);
    setTotalSavings(totals.totalSavings);
    setTotalCO2Avoided(totals.totalCO2Avoided);
  }, [user?.uid]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Your Savings Dashboard</h1>
        <p className="text-muted-foreground">Visualizing your positive impact on your wallet and the planet.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Financial Savings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">Rs {totalSavings.toLocaleString('en-IN')}</div>
            <p className="text-xs text-muted-foreground">Estimated from your planned trips and service history</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total CO2 Emissions Avoided</CardTitle>
            <Leaf className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalCO2Avoided} kg</div>
            <p className="text-xs text-muted-foreground">Compared to gasoline driving</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Monthly Savings (vs. Gasoline)</CardTitle>
            <CardDescription>Your estimated savings appear as you plan trips.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              {monthlyData.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                  <BarChart2 className="mb-4 h-12 w-12" />
                  <p className="font-semibold">No savings data yet.</p>
                  <p className="text-sm">Plan trips to start tracking savings.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `Rs ${Math.round(value / 1000)}k`} />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 'var(--radius)',
                      }}
                      cursor={{ fill: 'hsl(var(--muted))' }}
                    />
                    <Bar dataKey="savings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline">CO2 Avoided (kg)</CardTitle>
            <CardDescription>Your environmental contribution is tracked monthly.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              {monthlyData.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                  <BarChart2 className="mb-4 h-12 w-12" />
                  <p className="font-semibold">No environmental data yet.</p>
                  <p className="text-sm">Your CO2 savings will be calculated as you use the app.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}kg`} />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 'var(--radius)',
                      }}
                      cursor={{ fill: 'hsl(var(--muted))' }}
                    />
                    <Bar dataKey="avoided" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
