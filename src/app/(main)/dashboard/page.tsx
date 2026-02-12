
'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Leaf, BarChart2 } from 'lucide-react';

const monthlySavingsData: { month: string, savings: number }[] = [];
const co2Data: { month: string, avoided: number }[] = [];


export default function DashboardPage() {
  const totalSavings = monthlySavingsData.reduce((acc, item) => acc + item.savings, 0);
  const totalCO2Avoided = co2Data.reduce((acc, item) => acc + item.avoided, 0);

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
            <div className="text-3xl font-bold">₹{totalSavings.toLocaleString('en-IN')}</div>
            <p className="text-xs text-muted-foreground">
              Based on your logged activity
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total CO₂ Emissions Avoided</CardTitle>
            <Leaf className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalCO2Avoided} kg</div>
            <p className="text-xs text-muted-foreground">
              Equivalent to planting trees
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Monthly Savings (vs. Gasoline)</CardTitle>
            <CardDescription>Your estimated savings will appear here as you log your activity.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              {monthlySavingsData.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                    <BarChart2 className="h-12 w-12 mb-4" />
                    <p className="font-semibold">No savings data yet.</p>
                    <p className="text-sm">Plan trips and log your vehicle usage to see your savings.</p>
                 </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySavingsData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value / 1000}k`} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
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
            <CardTitle className="font-headline">CO₂ Avoided (kg)</CardTitle>
            <CardDescription>Your environmental contribution will be tracked here.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
             {co2Data.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                    <BarChart2 className="h-12 w-12 mb-4" />
                    <p className="font-semibold">No environmental data yet.</p>
                    <p className="text-sm">Your CO₂ savings will be calculated as you use the app.</p>
                 </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={co2Data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}kg`} />
                  <Tooltip
                     contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
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
