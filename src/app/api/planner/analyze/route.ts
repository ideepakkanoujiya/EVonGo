import { NextResponse } from 'next/server';
import { analyzeEVRoute, validatePlannerAnalyzeInput } from '@/lib/planner/route-service';

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = validatePlannerAnalyzeInput(rawBody);
    const result = await analyzeEVRoute({
      ...body,
      alternatives: body.alternatives ?? true,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
