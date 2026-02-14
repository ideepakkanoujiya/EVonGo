'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getEfficiencyRankings } from '@/lib/ev-analytics/api';
import { type EfficiencyRanking } from '@/lib/ev-analytics/types';
import { Award, Battery } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function EfficiencyRankings() {
  const [rankings, setRankings] = useState<EfficiencyRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRankings();
  }, []);

  const loadRankings = async () => {
    setLoading(true);
    setError(null);
    const result = await getEfficiencyRankings();
    
    if (result.success && result.data) {
      setRankings(result.data.rankings);
    } else {
      setError(result.error || 'Failed to load rankings');
    }
    
    setLoading(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-[200px]" />
          <Skeleton className="h-4 w-[300px]" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-10 w-[80%]" />
                <Skeleton className="h-10 w-[100px]" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-6 w-6 text-yellow-500" />
          Most Efficient Electric Vehicles
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rankings.map((vehicle, index) => (
            <div
              key={index}
              className={`flex items-center justify-between p-4 rounded-lg border ${
                index === 0
                  ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200'
                  : index < 3
                  ? 'bg-muted/30'
                  : ''
              }`}
            >
              <div className="flex items-center gap-4">
                <Badge
                  variant={index === 0 ? 'default' : index < 3 ? 'secondary' : 'outline'}
                  className={`text-sm font-bold ${
                    index === 0 ? 'bg-yellow-500 hover:bg-yellow-500' : ''
                  }`}
                >
                  #{vehicle.rank}
                </Badge>
                <div>
                  <p className="font-semibold">{vehicle.brand}</p>
                  <p className="text-sm text-muted-foreground">{vehicle.model}</p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Efficiency</p>
                  <p className="font-bold flex items-center gap-1">
                    <Battery className="h-4 w-4 text-blue-600" />
                    {vehicle.efficiency_wh_per_km} Wh/km
                  </p>
                </div>

                <div className="w-32">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all"
                        style={{ width: `${vehicle.efficiency_score}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-10">
                      {vehicle.efficiency_score.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-muted-foreground text-center">
          💡 Lower Wh/km = better efficiency (uses less energy per kilometer)
        </p>
      </CardContent>
    </Card>
  );
}
