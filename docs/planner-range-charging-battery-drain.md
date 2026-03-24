# Planner Range, Charging Suggestions, and Battery Drain

Generated on: 2026-03-23

## 1. Purpose

This document explains how the live planner calculates:

- EV range
- battery drain
- charging-station suggestions and charging stops

It is based on the code path currently used by the planner UI:

- `src/app/(main)/planner/page.tsx`
- `src/app/api/planner/analyze/route.ts`
- `src/lib/planner/route-service.ts`
- `src/lib/planner/range-service.ts`

It also calls out planner-related files that exist in the repo but are not part of the active planner path.

## 2. End-to-end planner flow

When the user submits the planner form, the app sends this payload to `POST /api/planner/analyze`:

- `origin`
- `destination`
- `batteryPercent`
- `vehicle`
  - `evModel`
  - `battery_capacity_kWh`
  - `efficiency_wh_per_km`
  - `torque_nm`
  - `top_speed_kmh`
  - `connectorType`
  - `maxChargingPower_kW`

In the current planner UI, the user manually enters these EV spec values before analysis:

- `battery_capacity_kWh`
- `efficiency_wh_per_km`
- `torque_nm`
- `top_speed_kmh`
- `maxChargingPower_kW`

The EV make/model selection still comes from the vehicle options dataset, and the selected model can be used as a reference, but those five spec inputs are no longer auto-filled into the live planner request.

The API route validates the request with Zod, then calls `analyzeEVRoute()`.

`analyzeEVRoute()` does the following:

1. Fetches one or more routes and traffic metrics.
2. Resolves any missing vehicle specs.
3. Predicts current-battery range.
4. Predicts full-battery range.
5. Decides whether the destination is reachable with a safety buffer.
6. If not reachable, builds a charging-station pool along the route.
7. Tries to construct a full charging path from start to destination.
8. Returns route metrics, current range, max range, consumption, and charging recommendations.

## 3. Where routing and traffic data come from

`fetchRouteTrafficMetrics()` in `src/lib/planner/route-service.ts` uses a provider fallback chain:

- primary: `ROUTING_PROVIDER` (`tomtom` by default)
- fallback: the other provider (`openrouteservice` or `tomtom`)
- final fallback: OSRM

For TomTom routes, the planner uses:

- `lengthInMeters`
- `travelTimeInSeconds`
- `noTrafficTravelTimeInSeconds`
- `trafficDelayInSeconds`
- route geometry points

From that, it computes:

- `distanceKm = distanceMeters / 1000`
- `avgSpeedKmh = distanceKm / durationInTrafficHours`
- `congestionRatio = (durationInTrafficSeconds - durationSeconds) / durationSeconds`

`congestionRatio` is capped to `3` in route metrics and later capped to `5` inside the range model.

## 4. Vehicle specs used for range

The planner requires the user to enter:

- battery capacity
- efficiency
- torque
- top speed
- max charging power

The planner also uses the selected EV make/model from `/api/planner/vehicle-options` for model identity, display, and connector metadata.

If battery capacity or efficiency is missing in a direct API call, `resolveVehicleSpecs()` can still call the ML backend `GET /search-vehicles?model=...` and fill missing values from the first matched vehicle. In normal planner UI usage, those fields are expected to be entered by the user before submission.

## 5. Range calculation in the live planner

### 5.1 Inputs passed into the range model

The planner builds a `TrafficRangeRequest` with:

- `battery_capacity_kWh`
- `efficiency_wh_per_km`
- `torque_nm`
- `top_speed_kmh`
- `battery_percent`
- `avg_speed`
- `congestion_factor`
- `trip_distance_km`

Environment inputs are no longer part of the live planner range payload. The active planner model now uses only vehicle specs, current battery, route speed, congestion, and trip distance.

### 5.2 ML baseline prediction

`predictTrafficAdjustedRange()` first tries the ML backend `POST /predict-range`.

The payload sent to the ML service is:

- `battery_capacity_kWh`
- `efficiency_wh_per_km`
- `torque_nm`
- `top_speed_kmh`
- `model_type: "best"`

The backend normalizes inputs and converts:

- `efficiency_wh_per_km` into `energy_consumption_kWh_per_100km` by dividing by `10`

The ML endpoint predicts a nominal full-pack range and returns:

- `predicted_range_km`
- `confidence_score`
- `model_used`

The planner then converts that predicted full-pack range into a baseline consumption:

`baseConsumptionWhPerKm = fullBatteryEnergyWh / mlRange`

Where:

- `fullBatteryEnergyWh = battery_capacity_kWh * 1000`
- `mlRange = predicted_range_km`

This matters because the planner does not use the ML range directly as the final answer. It uses the ML result to infer a baseline consumption, then applies planner-side adjustments for traffic, speed, and vehicle performance.

### 5.3 Fallback baseline if ML fails

If `POST /predict-range` fails or returns an invalid prediction, the planner falls back to:

`baseConsumptionWhPerKm = payload.efficiency_wh_per_km`

In other words, the user-entered efficiency becomes the baseline consumption directly.

### 5.4 Planner-side adjustment multipliers

The planner then calculates multipliers in `calculateAdjustmentFactors()`.

#### Traffic condition factor

The planner now maps live congestion into three traffic conditions:

- `no_traffic` when `congestion_factor < 0.05`
- `low_traffic` when `congestion_factor < 0.20`
- `high_traffic` otherwise

Range factors applied by condition:

- `no_traffic`: `1.15`
- `low_traffic`: `1.10`
- `high_traffic`: `0.70`

The planner internally converts that range factor into a consumption multiplier:

`trafficMultiplier = 1 / trafficRangeFactor`

So:

- no traffic improves effective range
- low traffic slightly improves effective range
- high traffic reduces effective range

#### Speed multiplier

Reference speed is `60 km/h`.

`speedRatio = avg_speed / 60`

`speedMultiplier = 0.8 + 0.2 * speedRatio^2`

This is a drag-style penalty. Higher speed increases energy per km roughly with the square of speed.

#### Performance multiplier

`performanceMultiplier = 1 + max(0, speed / topSpeed - 0.6) * 0.15 + max(0, torque / 1000 - 0.3) * 0.05`

This slightly penalizes faster driving relative to the car's top speed and higher-torque vehicles.

#### Final total multiplier

`totalMultiplier = clamp(trafficMultiplier * speedMultiplier * performanceMultiplier, 0.7, 2.5)`

Adjusted consumption:

`adjustedConsumptionWhPerKm = baseConsumptionWhPerKm * totalMultiplier`

### 5.5 Range outputs returned by the planner

The planner computes:

- `availableEnergyWh = battery_capacity_kWh * 1000 * (battery_percent / 100)`
- `adjustedRangeKm = availableEnergyWh / adjustedConsumptionWhPerKm`

Then it applies a safety buffer:

- fallback model: `0.90`
- ML model: `0.9 + 0.1 * confidenceScore`

So the effective reachability check is:

`effectiveRangeKm = adjustedRangeKm * safetyBuffer`

The planner returns:

- `baseRangeKm`
- `trafficAdjustedRangeKm`
- `consumptionWhPerKm`
- `estimatedBatteryLeftPercent`
- `canReachDestination`

Important nuance:

- the UI displays `currentRangeKm = trafficAdjustedRangeKm`
- but the go/no-go decision uses the safety-buffered `effectiveRangeKm`

So a trip can still be marked as needing charging even if the displayed current range looks very close to the trip distance.

## 6. How max range and current range are derived

Inside `analyzeEVRoute()` the planner runs the range model twice:

1. once with the user's current battery percentage
2. once with `batteryPercent: 100`

Then it stores:

- `currentRangeKm = currentBatteryRange.trafficAdjustedRangeKm`
- `maxRangeKm = fullBatteryRange.trafficAdjustedRangeKm`

These values are used differently:

- `currentRangeKm` drives the initial feasibility message shown to the user
- `maxRangeKm` is used later to estimate per-leg battery drain during stop planning

## 7. How battery drain is calculated

There are two related battery-drain calculations in the planner.

### 7.1 Trip-level battery drain

Inside `predictTrafficAdjustedRange()`:

`energyRequiredWh = trip_distance_km * adjustedConsumptionWhPerKm`

`consumedPercent = (energyRequiredWh / (battery_capacity_kWh * 1000)) * 100`

`batteryLeftPercent = clamp(battery_percent - consumedPercent, 0, 100)`

This is the detailed trip-level drain calculation. It uses the adjusted consumption that already includes traffic, speed, and vehicle-performance penalties.

### 7.2 Charging-leg battery drain

When the planner constructs charging stops, it uses a simpler leg formula:

`batteryUsedPercent = (legKm / maxRangeKm) * 100`

`arrivalBatteryPercent = max(0, departureBatteryPercent - batteryUsedPercent)`

This uses `maxRangeKm`, which is the planner's full-battery traffic-adjusted range for the route, and converts distance directly into percent consumed.

That means the charging planner does not recompute full per-leg physics for every segment. It approximates each leg using:

- route distance plus detours
- a fixed `maxRangeKm`
- a fixed reserve buffer

### 7.3 Reserve buffer used for reachability

The stop planner also keeps a hard battery buffer:

`BATTERY_BUFFER = 5`

Max reachable leg from a departure battery level:

`maxLegReachKm = ((max(0, departureBatteryPercent - 5)) / 100) * maxRangeKm`

This is why a leg is considered unreachable before the battery would mathematically hit `0%`.

## 8. When charging is considered necessary

Charging is required when:

- `currentBatteryRange.canReachDestination` is false, or
- `currentRangeKm < distanceKm`

In that case:

- `recommendation.needed = true`
- the reason begins with:
  - `Current range (X km) is less than trip distance (Y km).`

If charging is not needed:

- the recommendation says the destination is reachable
- `arrivalBatteryPercent` comes from the trip-level range model

## 9. How charging stations are suggested in the live planner

### 9.1 Important distinction from the AI charging flow

`src/ai/flows/find-charging-stations.ts` is not used by the planner route analysis.

That Genkit flow is for the separate charging-stations experience and returns AI-generated station cards.

The planner uses an algorithmic, provider-backed station search inside `src/lib/planner/route-service.ts`.

### 9.2 Providers used by the planner

For each search point, `searchChargingStationsNear()` queries these providers in parallel:

- OpenChargeMap
- TomTom POI search
- Google Places Nearby Search

The planner merges provider results by:

- station name
- lat/lng rounded to 4 decimals

During merge it keeps:

- combined connector types
- the highest seen `power_kW`
- the smallest seen `distanceFromRouteMeters`

### 9.3 How search points are chosen

The planner decodes the route polyline and builds a cumulative route-distance profile.

It then estimates how far the car can go:

- from the current battery
- from a full charge with a 5% reserve

From those values it derives:

- route sampling spacing
- number of sample points
- search radii

Primary search uses radii based on:

- `currentLegReachKm * 0.28`, clamped to `70..140 km`
- `fullChargeLegReachKm * 0.55`, clamped to `120..240 km`

Fallback search uses larger radii based on:

- `fullChargeLegReachKm * 0.45`, clamped to `100..200 km`
- `fullChargeLegReachKm * 0.9`, clamped to `180..360 km`

It searches in two passes:

1. route-wide samples across the entire route
2. targeted samples near expected charging horizons

The second pass tries points around where the planner expects the next charge would probably be needed.

### 9.4 Station pool metadata

For each discovered station, the planner computes:

- nearest route point
- progress distance along the route (`stationDistanceKm`)
- detour from route (`detourKm`)

This lets the planner treat stations as route nodes rather than simple nearby POIs.

## 10. How the planner chooses full charging stops

### 10.1 Graph model

The planner creates nodes for:

- start
- all candidate stations
- destination

Each station node includes:

- distance along route
- detour distance
- optional charging power

The effective leg distance between two nodes is:

`legDistanceKm = (to.distanceKm - from.distanceKm) + from.detourKm + to.detourKm`

So the planner does not ignore detours. Detours increase the energy needed for the leg.

### 10.2 Reachability rule

A transition from one node to another is allowed only if:

`requiredKm <= maxLegReachKm(departureBatteryPercent)`

Where:

- start node uses the user's current battery
- every charging stop assumes departure at `100%`

This is a major behavior detail:

- the live planner always fills planned stops to `100%`
- it does not optimize around partial charging for the main route plan

### 10.3 Path optimization priorities

Among reachable paths, the planner prefers:

1. fewer charging stops
2. lower total detour
3. higher aggregate charging-power score

Charging-power score for a station is:

`clamp((stationPowerKw / 150), 0, 1)`

If no valid path is found under the initial detour filter, the planner:

- collects more stations with larger radii
- removes the detour filter
- tries again

## 11. How stop details are calculated

For each chosen stop:

1. calculate leg distance
2. convert leg distance into battery used percent
3. compute arrival battery
4. fill to `100%`
5. convert the added battery percent into energy
6. estimate charging time from vehicle charging power

Formulas:

`batteryPercentToFill = max(0, 100 - arrivalBatteryPercent)`

`energyToFillKWh = battery_capacity_kWh * batteryPercentToFill / 100`

`chargingDurationMinutes = round((energyToFillKWh / chargingPowerKw) * 60)`

With a floor of `1` minute.

Important nuance:

- the planner uses the vehicle's `maxChargingPower_kW`
- it does not currently model tapering near high state of charge
- so charging times are simplified and likely optimistic, especially near `100%`

## 12. What happens when a full charging path cannot be found

If the planner cannot reach the destination with the available station pool, it still tries to return useful suggestions.

It does this by:

- keeping any partial stops it already found, or
- selecting the farthest reachable stations from the start

Those are returned in:

- `suggestedChargingStops`

And the reason string is expanded with a coverage-gap message that explains:

- where the planner got stuck
- how far the nearest next station is
- what the reachable leg limit was

In this case:

- `chargingStops` is empty
- `numberOfStops = 0`
- `canReachDestination = false`

## 13. What the planner shows in the UI

The planner page displays:

- route distance
- travel time in traffic
- average speed
- congestion ratio
- `currentRangeKm / trip distance`
- `consumptionPerKm` in `kWh/km`
- whether charging is needed
- each stop's arrival percent, departure percent, energy added, and charging time

If a full plan exists, the map shows:

- start marker
- destination marker
- charging stop markers

The Google Maps deep link includes charging stops as waypoints.

## 14. Planner-related modules that exist but are not currently used by the live planner

### 14.1 `src/lib/planner/environment-service.ts`

This module can fetch:

- elevation from Open-Meteo elevation API
- weather from Open-Meteo forecast API

It is not currently called by `analyzeEVRoute()`, and environment factors are no longer part of the live planner range calculation.

### 14.2 `src/lib/planner/charging-service.ts`

This module has an alternate charging-stop selection strategy that:

- fetches stations near the route from OpenChargeMap
- scores stations by detour, power, route progress, and connector compatibility
- supports more explicit recommendation text

It is not currently used by `analyzeEVRoute()`.

The live planner instead uses the integrated station-search and graph planner inside `route-service.ts`.

### 14.3 `src/ai/flows/find-charging-stations.ts`

This is the Genkit AI station-finder flow for the separate station locator experience.

It is not the source of planner charging stops.

## 15. Current limitations and implementation realities

The live planner is stronger than a simple distance/range check, but there are still important constraints:

- charging-stop planning assumes charging to `100%` at every planned stop
- charging time is linear and does not model charging taper
- the live route planner path does not currently filter or rank stops by connector compatibility
- battery drain per stop leg is simplified to `leg distance / max range`, not a fresh per-leg physics prediction
- the planner depends heavily on external provider coverage for station discovery

## 16. Short summary

The live planner uses a hybrid approach:

- route and traffic come from mapping providers
- baseline full-pack range comes from the ML service when available
- planner-side math converts that into traffic-adjusted consumption and current range
- battery drain for the full trip uses adjusted Wh/km
- battery drain for charging-stop legs uses a simpler percent-per-distance approximation
- charging stations are gathered from OpenChargeMap, TomTom, and Google Places
- charging stops are selected by a graph search that favors fewer stops, lower detour, and stronger charger power

The most important practical distinction is this:

- the planner's charging stops are algorithmic and provider-backed
- the AI `find-charging-stations` flow is separate and not used for route planning
