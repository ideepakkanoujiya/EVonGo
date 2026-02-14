'use client';

import type { ServiceRecord } from '@/lib/types';

export type TripRecord = {
  id: string;
  createdAt: string;
  startLocation: string;
  endLocation: string;
  totalTripDurationMinutes: number;
  totalChargingTimeMinutes: number;
  chargingStopsCount: number;
};

export type MonthlyMetric = {
  month: string;
  savings: number;
  avoided: number;
};

export type RewardsSummary = {
  points: number;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  nextTier: 'Silver' | 'Gold' | 'Platinum' | null;
  nextTierPoints: number | null;
  pointsToNextTier: number;
};

const AVERAGE_DRIVING_SPEED_KMH = 55;
const EV_COST_PER_KM_INR = 1.35;
const ICE_COST_PER_KM_INR = 7.35;
const CO2_AVOIDED_PER_KM_KG = 0.192;
const POINTS_PER_KM = 10;
const POINTS_PER_CHARGING_STOP = 20;

function storageKey(userId: string, key: string): string {
  return `moveonev:${userId}:${key}`;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  return safeParse<T>(window.localStorage.getItem(key), fallback);
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getServiceRecords(userId: string): ServiceRecord[] {
  return readStorage<ServiceRecord[]>(storageKey(userId, 'service-records'), []);
}

export function saveServiceRecords(userId: string, records: ServiceRecord[]): void {
  writeStorage(storageKey(userId, 'service-records'), records);
}

export function addServiceRecord(userId: string, record: ServiceRecord): ServiceRecord[] {
  const current = getServiceRecords(userId);
  const next = [record, ...current].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  saveServiceRecords(userId, next);
  return next;
}

export function getTripRecords(userId: string): TripRecord[] {
  return readStorage<TripRecord[]>(storageKey(userId, 'trip-records'), []);
}

export function addTripRecord(userId: string, trip: TripRecord): TripRecord[] {
  const current = getTripRecords(userId);
  const next = [trip, ...current].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  writeStorage(storageKey(userId, 'trip-records'), next);
  return next;
}

function estimateDistanceKm(trip: TripRecord): number {
  const drivingMinutes = Math.max(0, trip.totalTripDurationMinutes - trip.totalChargingTimeMinutes);
  return (drivingMinutes / 60) * AVERAGE_DRIVING_SPEED_KMH;
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

function toMonthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
}

export function buildMonthlyMetrics(userId: string): MonthlyMetric[] {
  const trips = getTripRecords(userId);
  const grouped = new Map<string, { savings: number; avoided: number }>();

  for (const trip of trips) {
    const date = new Date(trip.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const month = toMonthKey(date);
    const distance = estimateDistanceKm(trip);
    const savings = Math.max(0, distance * (ICE_COST_PER_KM_INR - EV_COST_PER_KM_INR));
    const avoided = Math.max(0, distance * CO2_AVOIDED_PER_KM_KG);
    const current = grouped.get(month) || { savings: 0, avoided: 0 };
    grouped.set(month, {
      savings: current.savings + savings,
      avoided: current.avoided + avoided,
    });
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({
      month: toMonthLabel(month),
      savings: Number(values.savings.toFixed(0)),
      avoided: Number(values.avoided.toFixed(1)),
    }));
}

export function getTotals(userId: string): { totalSavings: number; totalCO2Avoided: number; totalDistanceKm: number } {
  const trips = getTripRecords(userId);
  const serviceRecords = getServiceRecords(userId);

  let totalDistanceKm = 0;
  for (const trip of trips) {
    totalDistanceKm += estimateDistanceKm(trip);
  }

  const grossSavings = totalDistanceKm * (ICE_COST_PER_KM_INR - EV_COST_PER_KM_INR);
  const maintenanceSpend = serviceRecords.reduce((sum, r) => sum + (Number.isFinite(r.cost) ? r.cost : 0), 0);
  const totalSavings = Math.max(0, grossSavings - maintenanceSpend);
  const totalCO2Avoided = totalDistanceKm * CO2_AVOIDED_PER_KM_KG;

  return {
    totalSavings: Number(totalSavings.toFixed(0)),
    totalCO2Avoided: Number(totalCO2Avoided.toFixed(1)),
    totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
  };
}

export function getRewardsSummary(userId: string): RewardsSummary {
  const trips = getTripRecords(userId);
  let points = 0;

  for (const trip of trips) {
    const distancePoints = Math.floor(estimateDistanceKm(trip) * POINTS_PER_KM);
    const chargingPoints = trip.chargingStopsCount * POINTS_PER_CHARGING_STOP;
    points += distancePoints + chargingPoints;
  }

  let tier: RewardsSummary['tier'] = 'Bronze';
  let nextTier: RewardsSummary['nextTier'] = 'Silver';
  let nextTierPoints: number | null = 20000;

  if (points >= 100000) {
    tier = 'Platinum';
    nextTier = null;
    nextTierPoints = null;
  } else if (points >= 50000) {
    tier = 'Gold';
    nextTier = 'Platinum';
    nextTierPoints = 100000;
  } else if (points >= 20000) {
    tier = 'Silver';
    nextTier = 'Gold';
    nextTierPoints = 50000;
  }

  return {
    points,
    tier,
    nextTier,
    nextTierPoints,
    pointsToNextTier: nextTierPoints ? Math.max(0, nextTierPoints - points) : 0,
  };
}
