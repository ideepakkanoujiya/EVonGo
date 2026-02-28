import { NextResponse } from 'next/server';
import { fetchRouteTrafficMetrics } from '@/lib/planner/route-service';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      origin?: string;
      destination?: string;
      alternatives?: boolean;
    };

    if (!body.origin || !body.destination) {
      return NextResponse.json(
        { success: false, error: 'origin and destination are required' },
        { status: 400 }
      );
    }

    const routes = await fetchRouteTrafficMetrics({
      origin: body.origin,
      destination: body.destination,
      alternatives: body.alternatives ?? true,
      batteryPercent: 50,
      vehicle: {
        evModel: 'placeholder',
        battery_capacity_kWh: 75,
        efficiency_wh_per_km: 150,
        torque_nm: 350,
        top_speed_kmh: 180,
      },
    });

    return NextResponse.json({
      success: true,
      routes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
