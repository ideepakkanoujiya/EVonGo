import { RangePredictor } from '@/components/ev-analytics/range-predictor';
import { RealWorldRangePredictor } from '@/components/ev-analytics/real-world-range-predictor';
import { EfficiencyRankings } from '@/components/ev-analytics/efficiency-rankings';
import { VehicleComparison } from '@/components/ev-analytics/vehicle-comparison';
import { VehicleSearch } from '@/components/ev-analytics/vehicle-search';

export default function EVAnalyticsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-emerald-600 bg-clip-text text-transparent">
          Electric Vehicle Analytics
        </h1>
        <p className="mt-2 text-muted-foreground">
          Compare, predict, and analyze electric vehicles with AI-powered insights
        </p>
      </div>

      <div className="grid gap-6">
        {/* Row 1: Range Predictor */}
        <div>
          <RangePredictor />
        </div>

        {/* Row 2: Efficiency Rankings */}
        <div>
          <EfficiencyRankings />
        </div>

        {/* Row 3: Real-World Range Predictor */}
        <div>
          <RealWorldRangePredictor />
        </div>

        {/* Row 4: Vehicle Search */}
        <div>
          <VehicleSearch />
        </div>

        {/* Row 5: Vehicle Comparison */}
        <div>
          <VehicleComparison />
        </div>
      </div>
    </div>
  );
}
