import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

type VehicleOption = {
  optionId: string;
  make: string;
  model: string;
  modelLabel: string;
  year: number | null;
  battery_capacity_kWh: number;
  efficiency_wh_per_km: number;
  top_speed_kmh: number;
  maxChargingPower_kW: number;
  torque_nm: number;
  connectorType: string;
};

type VehicleAccumulator = {
  optionId: string;
  make: string;
  model: string;
  modelLabel: string;
  year: number | null;
  batteryCapacity: number[];
  consumptionKwhPer100: number[];
  maxSpeed: number[];
  chargingPower: number[];
  torque: number[];
  connectorVotes: Map<string, number>;
  sources: Set<string>;
};

const PREFERRED_CSVS = [
  'electric_vehicle_analytics.csv',
  'open-ev-data-v1.24.0.csv',
  'electric_vehicles_spec_2025.csv.csv',
  'electric_vehicles_spec_2025.csv',
];

function vehicleDataDirCandidates(): string[] {
  const candidates = [
    process.env.VEHICLE_DATA_DIR,
    path.join(process.cwd(), 'backend', 'ml-service', 'data'),
    path.join(process.cwd(), '.next', 'standalone', 'backend', 'ml-service', 'data'),
    path.join(process.cwd(), '..', 'backend', 'ml-service', 'data'),
  ].filter((value): value is string => Boolean(value && value.trim()));

  return Array.from(new Set(candidates));
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function parsePositiveNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1990 || parsed > 2100) return null;
  return parsed;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function getField(
  cells: string[],
  indexByName: Map<string, number>,
  names: string[]
): string | undefined {
  for (const name of names) {
    const idx = indexByName.get(name.toLowerCase());
    if (idx == null) continue;
    const value = cells[idx]?.trim();
    if (value) return value;
  }
  return undefined;
}

function addConnectorVotes(acc: VehicleAccumulator, rawValue: string | undefined) {
  if (!rawValue) return;
  const tokens = rawValue
    .split(/[;,/|]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  for (const token of tokens) {
    const count = acc.connectorVotes.get(token) ?? 0;
    acc.connectorVotes.set(token, count + 1);
  }
}

function pickConnector(acc: VehicleAccumulator): string {
  if (acc.connectorVotes.size === 0) return 'CCS2';
  let bestLabel = 'CCS2';
  let bestVotes = -1;

  for (const [label, votes] of acc.connectorVotes.entries()) {
    if (votes > bestVotes) {
      bestVotes = votes;
      bestLabel = label;
    }
  }
  return bestLabel;
}

async function resolveVehicleDataDir(): Promise<string> {
  const candidates = vehicleDataDirCandidates();

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // Keep trying fallback locations.
    }
  }

  throw new Error(
    `Vehicle data directory not found. Checked: ${candidates.join(', ')}`
  );
}

async function listCsvDataFiles(dataDir: string): Promise<string[]> {
  const preferred = PREFERRED_CSVS.map((name) => path.join(dataDir, name));
  const existingPreferred: string[] = [];
  for (const filePath of preferred) {
    try {
      await fs.access(filePath);
      existingPreferred.push(filePath);
    } catch {
      // Ignore missing preferred files.
    }
  }

  const allEntries = await fs.readdir(dataDir, { withFileTypes: true });
  const extraCsvs = allEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'))
    .map((entry) => path.join(dataDir, entry.name))
    .filter((filePath) => !existingPreferred.includes(filePath))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

  return [...existingPreferred, ...extraCsvs];
}

async function ingestDataset(
  filePath: string,
  grouped: Map<string, VehicleAccumulator>
): Promise<void> {
  const csv = await fs.readFile(filePath, 'utf-8');
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return;

  const headers = splitCsvLine(lines[0]);
  const indexByName = new Map<string, number>(
    headers.map((name, index) => [name.trim().toLowerCase(), index])
  );

  const sourceName = path.basename(filePath);

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);

    const make =
      getField(cells, indexByName, ['make', 'make_name', 'brand']) ?? '';
    const model =
      getField(cells, indexByName, ['model', 'model_name']) ?? '';
    if (!make || !model) continue;

    const year = parseYear(
      getField(cells, indexByName, ['year', 'model_year'])
    );

    const battery = parsePositiveNumber(
      getField(cells, indexByName, [
        'battery_capacity_kwh',
        'battery_capacity_net_kwh',
        'battery_capacity_gross_kwh',
      ])
    );

    let consumption = parsePositiveNumber(
      getField(cells, indexByName, [
        'energy_consumption_kwh_per_100km',
        'consumption_kwh_per_100km',
      ])
    );

    const rangeKm = parsePositiveNumber(
      getField(cells, indexByName, [
        'range_km',
        'range_wltp_km',
        'range_epa_km',
      ])
    );
    if (consumption == null && battery != null && rangeKm != null && rangeKm > 0) {
      consumption = (battery / rangeKm) * 100;
    }

    const maxSpeed = parsePositiveNumber(
      getField(cells, indexByName, [
        'max_speed_kmh',
        'top_speed_kmh',
      ])
    );
    const chargingPower = parsePositiveNumber(
      getField(cells, indexByName, [
        'charging_power_kw',
        'dc_max_power_kw',
      ])
    );
    const torque = parsePositiveNumber(
      getField(cells, indexByName, [
        'torque_nm',
        'system_torque_nm',
      ])
    );
    const connectors = getField(cells, indexByName, [
      'charge_connectors',
      'connector',
      'connector_type',
      'connectortype',
    ]);

    const optionId = `${make}|||${model}|||${year ?? 'na'}`;
    const modelLabel = year ? `${model} (${year})` : model;
    let acc = grouped.get(optionId);
    if (!acc) {
      acc = {
        optionId,
        make,
        model,
        modelLabel,
        year,
        batteryCapacity: [],
        consumptionKwhPer100: [],
        maxSpeed: [],
        chargingPower: [],
        torque: [],
        connectorVotes: new Map<string, number>(),
        sources: new Set<string>(),
      };
      grouped.set(optionId, acc);
    }

    acc.sources.add(sourceName);
    if (battery != null) acc.batteryCapacity.push(battery);
    if (consumption != null) acc.consumptionKwhPer100.push(consumption);
    if (maxSpeed != null) acc.maxSpeed.push(maxSpeed);
    if (chargingPower != null) acc.chargingPower.push(chargingPower);
    if (torque != null) acc.torque.push(torque);
    addConnectorVotes(acc, connectors);
  }
}

function toVehicleOptions(records: VehicleAccumulator[]): VehicleOption[] {
  return records
    .map((record) => {
      const batteryCapacity = median(record.batteryCapacity) ?? 50;
      const consumptionKwhPer100 = median(record.consumptionKwhPer100);
      const efficiencyWhPerKm =
        consumptionKwhPer100 != null && consumptionKwhPer100 > 0
          ? consumptionKwhPer100 * 10
          : 180;
      const topSpeed = median(record.maxSpeed) ?? 160;
      const chargingPower = median(record.chargingPower) ?? 50;
      const torque = median(record.torque) ?? 300;
      const connectorType = pickConnector(record);

      return {
        optionId: record.optionId,
        make: record.make,
        model: record.model,
        modelLabel: record.modelLabel,
        year: record.year,
        battery_capacity_kWh: Number(batteryCapacity.toFixed(2)),
        efficiency_wh_per_km: Number(efficiencyWhPerKm.toFixed(2)),
        top_speed_kmh: Number(topSpeed.toFixed(2)),
        maxChargingPower_kW: Number(chargingPower.toFixed(2)),
        torque_nm: Number(torque.toFixed(2)),
        connectorType,
      };
    })
    .sort((a, b) => {
      if (a.make !== b.make) return a.make.localeCompare(b.make);
      if (a.model !== b.model) return a.model.localeCompare(b.model);
      return (a.year ?? 0) - (b.year ?? 0);
    });
}

export async function GET() {
  try {
    const dataDir = await resolveVehicleDataDir();
    const csvFiles = await listCsvDataFiles(dataDir);
    if (csvFiles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No CSV datasets found in ${dataDir}`,
        },
        { status: 500 }
      );
    }

    const grouped = new Map<string, VehicleAccumulator>();
    for (const filePath of csvFiles) {
      await ingestDataset(filePath, grouped);
    }

    const vehicles = toVehicleOptions(Array.from(grouped.values()));
    const makes = Array.from(new Set(vehicles.map((vehicle) => vehicle.make))).sort(
      (a, b) => a.localeCompare(b)
    );

    return NextResponse.json({
      success: true,
      vehicles,
      makes,
      total: vehicles.length,
      datasetsUsed: csvFiles.map((filePath) => path.basename(filePath)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown dataset error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
