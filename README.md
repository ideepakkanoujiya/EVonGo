# MoveOnEV - Your Smart EV Companion

MoveOnEV is a comprehensive web application designed to be the ultimate companion for electric vehicle owners in India. It tackles the most common challenges faced by EV drivers—such as range anxiety, finding charging stations, and accessing reliable vehicle support—by consolidating all necessary tools and information into a single, user-friendly platform.

## Market Need

The electric vehicle (EV) market in India is expanding at an unprecedented rate. While this shift to sustainable transport is positive, it introduces a unique set of challenges for consumers:

*   **Range Anxiety:** The fear of a battery running out before reaching a destination or a charging station is the most significant barrier to EV adoption.
*   **Fragmented Charging Network:** Information about charging stations is scattered, often unreliable, and lacks real-time availability data.
*   **Maintenance & Support Gaps:** Finding trusted and qualified service centers that specialize in EVs can be difficult.
*   **Lack of Community:** EV owners often lack a dedicated platform to connect with peers, share experiences, and seek advice on a new and evolving technology.

MoveOnEV is designed to directly address these pain points by providing a single, reliable platform that consolidates all the necessary tools and information an EV owner needs.

## Key Features

*   **Smart Route Planner:** Intelligently plans long-distance trips with optimized charging stops based on the vehicle's range, current battery level, and charging speed.
*   **Charging Station Locator:** A comprehensive, searchable map of charging stations with details on connector types, charging speeds, and real-time availability.
*   **AI Vehicle Assistant:** A powerful diagnostic tool that allows users to describe a problem (or even record it with their voice in English or Hindi) and receive an AI-powered diagnosis and a link to a relevant repair video.
*   **Service Center Finder:** Helps users locate authorized and trusted EV service centers nearby.
*   **Community Hub:** A forum for EV owners to connect, ask questions, and share their knowledge and experiences with fellow enthusiasts.
*   **Vehicle Service Log:** A digital logbook to keep track of all maintenance and service records for the vehicle.
*   **Savings Dashboard:** Visualizes the financial savings and environmental impact (CO₂ emissions avoided) of driving an EV compared to a gasoline car.
*   **Rewards Program:** Gamifies the EV experience by allowing users to earn points for driving green and engaging with the community, which can be redeemed for rewards.
*   **EV Analytics Suite:** Advanced analytics platform featuring:
    *   **Range Predictor:** ML-powered tool to estimate vehicle range based on battery capacity, efficiency, torque, and top speed.
    *   **Real-World Range Predictor:** Accounts for battery health, temperature, driving speed, and vehicle mileage for accurate predictions.
    *   **Efficiency Rankings:** View the most efficient EVs with comprehensive efficiency scores and comparisons.
    *   **Vehicle Comparison:** Compare multiple electric vehicles side-by-side across range, efficiency, and charging capabilities.
    *   **Vehicle Search:** Search and filter electric vehicles by brand, model, and range specifications.

## Tech Stack

### Frontend
*   **Next.js 15** - React framework for production apps
*   **React 18** - UI library
*   **TypeScript** - Type-safe JavaScript
*   **Tailwind CSS** - Utility-first CSS framework
*   **ShadCN UI** - High-quality React components
*   **Lucide React** - Icon library
*   **React Hook Form** - Efficient form handling
*   **Recharts** - Chart and graph library

### Backend & AI
*   **Firebase** - Authentication, Firestore database, Hosting
*   **Google Genkit** - AI-powered flows and routing
*   **Google AI** - Language and vision models

### ML Service
*   **Python 3** - ML service implementation
*   **Flask** - Web framework for ML API
*   **Scikit-learn** - Machine learning algorithms
*   **Pandas** - Data manipulation and analysis
*   **NumPy** - Numerical computing

## Project Structure

```
MoveOnEV-main/
├── src/
│   ├── app/                          # Next.js app router
│   │   ├── (main)/                   # Main authenticated routes
│   │   │   ├── assistant/            # AI vehicle assistant
│   │   │   ├── community/            # Community forum
│   │   │   ├── dashboard/            # User dashboard
│   │   │   ├── ev-analytics/         # EV analytics page
│   │   │   ├── planner/              # Route planner
│   │   │   ├── profile/              # User profile
│   │   │   ├── rewards/              # Rewards program
│   │   │   ├── service-centers/      # Service center locator
│   │   │   ├── stations/             # Charging station finder
│   │   │   └── vehicle-log/          # Vehicle service log
│   │   ├── login/                    # Authentication
│   │   └── layout.tsx                # Root layout
│   ├── components/                   # Reusable React components
│   │   ├── ev-analytics/             # Analytics components
│   │   ├── layout/                   # Layout components
│   │   └── ui/                       # UI component library
│   ├── lib/
│   │   ├── ev-analytics/             # Analytics API client
│   │   ├── firebase.ts               # Firebase configuration
│   │   ├── types.ts                  # Global types
│   │   └── user-data.ts              # User data management
│   ├── ai/                           # Genkit AI flows
│   │   ├── flows/                    # AI workflow definitions
│   │   └── genkit.ts                 # Genkit configuration
│   └── hooks/                        # Custom React hooks
├── backend/
│   └── ml-service/                   # Machine Learning API
│       ├── app.py                    # Flask application
│       ├── requirements.txt          # Python dependencies
│       └── data/                     # EV datasets
├── public/                           # Static assets
│── package.json                      # Node.js dependencies
└── tsconfig.json                     # TypeScript configuration
```

## Installation & Setup

### Prerequisites
*   Node.js 18+ and npm
*   Python 3.8+
*   Firebase project with credentials

### Frontend Setup

1. Clone the repository
```bash
git clone https://github.com/ideepakkanoujiya/EVonGo.git
cd MoveOnEV-main
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
```bash
cp .env.local.example .env.local
```

Add the following to `.env.local`:
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_ML_SERVICE_URL=http://localhost:5000
NEXT_PUBLIC_GOOGLE_GENKIT_API_KEY=your_genkit_key
```

4. Run the development server
```bash
npm run dev
```

Visit `http://localhost:9002` in your browser.

### ML Service Setup

1. Navigate to the ML service directory
```bash
cd backend/ml-service
```

2. Create a virtual environment
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies
```bash
pip install -r requirements.txt
```

4. Run the Flask server
```bash
python app.py
```

The API will be available at `http://localhost:5000`

## API Endpoints

### ML Service API

#### Range Prediction
```
POST /predict-range
Body: {
  "battery_capacity_kWh": number,
  "efficiency_wh_per_km": number,
  "torque_nm": number,
  "top_speed_kmh": number
}
Response: { "predicted_range_km": number }
```

#### Real-World Range Prediction
```
POST /predict-real-world-range
Body: {
  "Battery_Capacity_kWh": number,
  "Battery_Health_Percent": number,
  "Energy_Consumption_kWh_per_100km": number,
  "Avg_Speed_kmh": number,
  "Temperature_C": number,
  "Mileage_km": number
}
Response: { "predicted_range_km": number }
```

#### Efficiency Rankings
```
GET /efficiency-rankings
Response: { "rankings": [...] }
```

#### Compare Vehicles
```
POST /compare-vehicles
Body: { "vehicleNames": [...] }
Response: { "comparison": [...] }
```

#### Search Vehicles
```
GET /search-vehicles?brand=&model=&minRange=&maxRange=
Response: { "vehicles": [...], "total": number }
```

## Available Scripts

### Frontend
*   `npm run dev` - Start development server
*   `npm run build` - Build for production
*   `npm run start` - Start production server
*   `npm run lint` - Run ESLint
*   `npm run typecheck` - Type check with TypeScript
*   `npm run genkit:dev` - Start Genkit development server
*   `npm run genkit:watch` - Watch mode for Genkit

### ML Service
*   `python app.py` - Start Flask server

## Development Guidelines

*   Use TypeScript for type safety
*   Follow the component structure in `src/components`
*   Keep API calls in `src/lib/ev-analytics/api.ts`
*   Store reusable types in `src/lib/types.ts`
*   Use ShadCN UI components from `src/components/ui`

## Contributing

We welcome contributions! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

## Support

For support, please open an issue on GitHub or contact the development team.
