# MoveOnEV Current Feature Report

Generated on: 2026-03-01

## 1. Project Snapshot

This project is a Next.js web app with:

- Frontend pages under `src/app/(main)` and `src/app`.
- Server actions in `src/lib/actions.ts`.
- Planner API routes in `src/app/api/planner/*`.
- AI flows (Genkit + Firebase/Google AI) in `src/ai/flows/*`.
- Python ML backend in `backend/ml-service/app.py`.

## 2. Features Present (Implemented)

### 2.1 Authentication and App Shell

- Firebase auth state management and redirect gate are implemented (`src/hooks/use-auth.tsx:16`, `src/hooks/use-auth.tsx:40`).
- Root layout wraps app in `AuthProvider` + `AuthGate` (`src/app/layout.tsx:35`).
- Home page redirects to `/planner` or `/login` based on auth (`src/app/page.tsx:15`).
- Login page supports sign-in and sign-up with Firebase email/password (`src/app/login/page.tsx:32`).

### 2.2 Smart Route Planner (Main Feature)

- Planner form supports:
  - `From` and `To` inputs with suggestion API (`src/app/(main)/planner/page.tsx:593`, `src/app/(main)/planner/page.tsx:645`).
  - Current-location autofill for origin (`src/app/(main)/planner/page.tsx:327`).
  - EV make and EV model dropdowns (`src/app/(main)/planner/page.tsx:681`, `src/app/(main)/planner/page.tsx:709`).
  - Battery percentage slider (`src/app/(main)/planner/page.tsx:744`).
- EV make/model options are fetched from dataset-backed API (`src/app/(main)/planner/page.tsx:261`, `src/app/api/planner/vehicle-options/route.ts:306`).
- Planner runs route analysis through `/api/planner/analyze` (`src/app/(main)/planner/page.tsx:541`, `src/app/api/planner/analyze/route.ts:4`).
- Route output includes distance, traffic time, speed, congestion (`src/app/(main)/planner/page.tsx:808` onward).
- EV range and charging feasibility section is implemented (`src/app/(main)/planner/page.tsx:830` onward).
- Multi-stop charging plan rendering is implemented (`src/app/(main)/planner/page.tsx:893`).
- Route map preview with Leaflet is implemented (`src/app/(main)/planner/page.tsx:1010`).
- Map markers use different icon/color by type:
  - Start `S` green (`src/app/(main)/planner/page.tsx:431`, `src/app/(main)/planner/page.tsx:434`)
  - Destination `D` red (`src/app/(main)/planner/page.tsx:432`, `src/app/(main)/planner/page.tsx:435`)
  - Charging stops `C#` orange (`src/app/(main)/planner/page.tsx:437`)
- "Open in Maps" deep link is implemented (`src/app/(main)/planner/page.tsx:1033`).
- Trip summaries are persisted for dashboard/rewards using local storage (`src/app/(main)/planner/page.tsx:314`, `src/lib/user-data.ts:80`).

### 2.3 Charging Station Locator

- Station search page exists with AI-backed server action (`src/app/(main)/stations/page.tsx:39`, `src/lib/actions.ts:77`).
- Geolocation-assisted search exists (auto-submits form) (`src/app/(main)/stations/page.tsx:56`, `src/app/(main)/stations/page.tsx:69`).
- Result cards show station details, connector blocks, and map link (`src/app/(main)/stations/page.tsx:146` onward).

### 2.4 Service Center Finder

- Service center search page exists with AI-backed server action (`src/app/(main)/service-centers/page.tsx:36`, `src/lib/actions.ts:110`).
- Geolocation-assisted lookup exists (`src/app/(main)/service-centers/page.tsx:53`).
- Result cards include rating, call action, and map link (`src/app/(main)/service-centers/page.tsx:118` onward).

### 2.5 AI Vehicle Assistant

- Diagnosis form supports text description + optional image upload (`src/app/(main)/assistant/page.tsx:154`, `src/app/(main)/assistant/page.tsx:177`).
- Voice capture and transcription are implemented (`src/app/(main)/assistant/page.tsx:70`, `src/lib/actions.ts:235`).
- AI diagnosis and YouTube search suggestion are implemented (`src/lib/actions.ts:201`, `src/ai/flows/diagnose-problem.ts:41`).
- Diagnosis text-to-speech playback is implemented (`src/lib/actions.ts:246`, `src/app/(main)/assistant/page.tsx:236`).

### 2.6 Community Hub

- Community post fetch and display are implemented (`src/app/(main)/community/page.tsx:43`, `src/ai/flows/getCommunityPosts.ts:22`).
- Create-post dialog and submission are implemented (`src/app/(main)/community/page.tsx:38`, `src/lib/actions.ts:153`).
- Firestore persistence for posts is implemented (`src/ai/flows/addCommunityPost.ts:31`).

### 2.7 Vehicle Service Log

- Service records can be created via dialog and persisted per user in local storage (`src/app/(main)/vehicle-log/page.tsx:82`, `src/lib/user-data.ts:67`).
- Table rendering of historical service records is implemented (`src/app/(main)/vehicle-log/page.tsx:130`).

### 2.8 Savings Dashboard

- Dashboard totals and monthly charts are implemented (`src/app/(main)/dashboard/page.tsx:12`).
- Metrics are computed from stored trip/service data (`src/lib/user-data.ts:106`, `src/lib/user-data.ts:133`).

### 2.9 Rewards Program

- Rewards summary, tier progression, and reward cards are implemented (`src/app/(main)/rewards/page.tsx:19`).
- Points computation logic is implemented (`src/lib/user-data.ts:154`).

### 2.10 EV Analytics Suite

- EV analytics page composes 5 modules (`src/app/(main)/ev-analytics/page.tsx:22`, `src/app/(main)/ev-analytics/page.tsx:42`):
  - Range predictor (`src/components/ev-analytics/range-predictor.tsx`)
  - Efficiency rankings (`src/components/ev-analytics/efficiency-rankings.tsx`)
  - Real-world range predictor (`src/components/ev-analytics/real-world-range-predictor.tsx`)
  - Vehicle search (`src/components/ev-analytics/vehicle-search.tsx`)
  - Vehicle comparison (`src/components/ev-analytics/vehicle-comparison.tsx`)
- Client API integration to ML backend exists (`src/lib/ev-analytics/api.ts`).

### 2.11 Planner API Features (Next.js)

- `/api/planner/analyze` validates request and calls route analysis (`src/app/api/planner/analyze/route.ts:4`).
- `/api/planner/suggest` supports TomTom and OpenRouteService with provider fallback (`src/app/api/planner/suggest/route.ts:145`, `src/app/api/planner/suggest/route.ts:153`).
- `/api/planner/vehicle-options` ingests CSV datasets and normalizes make/model/year/specs (`src/app/api/planner/vehicle-options/route.ts:157`, `src/app/api/planner/vehicle-options/route.ts:271`).

### 2.12 Planner Core Service Features

- Input validation with Zod (`src/lib/planner/route-service.ts:116`).
- Route provider selection and fallback chain TomTom/OpenRouteService/OSRM (`src/lib/planner/route-service.ts:620`, `src/lib/planner/route-service.ts:658`).
- Multi-provider charging-station aggregation (OpenChargeMap, TomTom POI, Google Places) (`src/lib/planner/route-service.ts:715`, `src/lib/planner/route-service.ts:776`, `src/lib/planner/route-service.ts:830`).
- Graph-style charging path planning across route-wide station pool (`src/lib/planner/route-service.ts:1106` onward).
- ML + physics hybrid traffic range logic with fallback safety buffer (`src/lib/planner/range-service.ts:264`, `src/lib/planner/range-service.ts:315`).

### 2.13 Python ML Service Features

Flask endpoints currently present:

- `GET /health` (`backend/ml-service/app.py:729`)
- `POST /predict-range` (`backend/ml-service/app.py:738`)
- `POST /predict-with-conditions` (`backend/ml-service/app.py:774`)
- `GET /model-info` (`backend/ml-service/app.py:789`)
- `GET /feature-importance` (`backend/ml-service/app.py:798`)
- `GET /compare-models` (`backend/ml-service/app.py:813`)
- `POST /batch-predict` (`backend/ml-service/app.py:837`)
- `POST /retrain` (`backend/ml-service/app.py:865`)
- `GET /dataset-stats` (`backend/ml-service/app.py:882`)
- `POST /predict-real-world-range` (`backend/ml-service/app.py:911`)
- `GET /efficiency-rankings` (`backend/ml-service/app.py:944`)
- `POST /compare-vehicles` (`backend/ml-service/app.py:981`)
- `GET /search-vehicles` (`backend/ml-service/app.py:1029`)
- `POST /predict-traffic-range` (`backend/ml-service/app.py:1067`)

Model training stack in code includes XGBoost, LightGBM, Gradient Boosting, Random Forest, and ensemble voting (`backend/ml-service/app.py:284` onward).

## 3. Dataset and EV Option Coverage

Datasets currently found under `backend/ml-service/data`:

- `electric_vehicle_analytics.csv`
- `open-ev-data-v1.24.0.csv`
- `electric_vehicles_spec_2025.csv.csv`

Current dataset stats from local files:

- `electric_vehicle_analytics.csv`: 3000 rows, 10 makes, 230 make-model-year variants
- `open-ev-data-v1.24.0.csv`: 1189 rows, 65 makes, 595 make-model-year variants
- `electric_vehicles_spec_2025.csv.csv`: 478 rows, 59 makes, 478 make-model variants

Cross-dataset aggregate potential (matching planner option parsing rules):

- 88 unique makes
- 1280 unique make-model-year options

Note: planner options API merges and normalizes fields across CSV schemas (`src/app/api/planner/vehicle-options/route.ts:180` to `src/app/api/planner/vehicle-options/route.ts:237`).

## 4. Commented-Out Features (Explicitly Commented in Code)

### 4.1 Header Navigation Items Commented Out

The top nav currently only leaves `Planner` active; these are commented out:

- Stations (`src/components/layout/header.tsx:25`)
- Service (`src/components/layout/header.tsx:26`)
- Assistant (`src/components/layout/header.tsx:27`)
- Community (`src/components/layout/header.tsx:28`)
- Dashboard (`src/components/layout/header.tsx:29`)
- Rewards (`src/components/layout/header.tsx:30`)
- Vehicle Log (`src/components/layout/header.tsx:31`)
- EV Analytics (`src/components/layout/header.tsx:32`)

### 4.2 Bottom Nav Items Commented Out

Mobile bottom nav currently only leaves `Planner` active; these are commented out:

- Stations (`src/components/layout/bottom-nav.tsx:11`)
- Service (`src/components/layout/bottom-nav.tsx:12`)
- Community (`src/components/layout/bottom-nav.tsx:13`)
- Assistant (`src/components/layout/bottom-nav.tsx:14`)
- Profile (`src/components/layout/bottom-nav.tsx:15`)

### 4.3 Stations Page Commented Behavior

- Input clear line is commented out:
  - `// inputRef.current.value = '';` (`src/app/(main)/stations/page.tsx:79`)

## 5. Present but Partial / Not Fully Wired

### 5.1 Stations Filters Are UI-Only

- Connector Type and Charging Speed dropdowns are rendered (`src/app/(main)/stations/page.tsx:115`, `src/app/(main)/stations/page.tsx:126`) but not sent as filters in `customDispatch` (`src/app/(main)/stations/page.tsx:84`).

### 5.2 Profile Page Is UI-Only (No Persistence)

- `Change Photo` and `Save Changes` buttons exist (`src/app/(main)/profile/page.tsx:60`, `src/app/(main)/profile/page.tsx:109`) but there is no submit handler, server action, or API call.

### 5.3 Community Like/Reply Buttons Have No Action

- Buttons are rendered (`src/app/(main)/community/page.tsx:178`, `src/app/(main)/community/page.tsx:182`) but no click handlers are attached.

### 5.4 Legacy Planner Action Exists but Not Used

- `planRoute` server action exists (`src/lib/actions.ts:35`) but has no callsites in current UI.

### 5.5 Planner Helper Services Exist but Are Not Wired Into Main Route Flow

- `fetchRouteEnvironment` exists (`src/lib/planner/environment-service.ts:178`) but is not referenced by planner route analysis.
- `fetchStationsNearRoute` and `selectOptimalChargingStops` exist (`src/lib/planner/charging-service.ts:209`, `src/lib/planner/charging-service.ts:291`) but main planner currently uses the integrated logic in `route-service.ts`.

### 5.6 Planner Traffic Test API Uses Placeholder Vehicle Values

- `/api/planner/traffic` uses hardcoded placeholder vehicle specs (`src/app/api/planner/traffic/route.ts:25` to `src/app/api/planner/traffic/route.ts:29`).

## 6. Placeholder Content Pages

- Privacy policy page still contains placeholder legal copy (`src/app/privacy/page.tsx:13`).
- Terms page still contains placeholder legal copy (`src/app/terms/page.tsx:13`).

## 7. Notes on Data Source Behavior

- Stations and service centers pages use LLM prompt flows that request realistic entries rather than direct provider API integration in those specific pages (`src/ai/flows/find-charging-stations.ts:48`, `src/ai/flows/find-service-centers.ts:41`).
- Planner charging-stop computation is provider-backed and algorithmic via `route-service.ts`, separate from the station page AI flow.

