import type { EVRouteAnalysis, PlannerAnalyzeRequest } from '@/lib/planner/types';

export async function analyzePlannerRoute(
  payload: PlannerAnalyzeRequest
): Promise<EVRouteAnalysis> {
  const response = await fetch('/api/planner/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as EVRouteAnalysis & {
    error?: string;
    success?: boolean;
  };
  if (!response.ok || data.success === false) {
    throw new Error(data.error || 'Failed to analyze route');
  }
  return data;
}
