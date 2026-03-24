# MoveOnEV Tech Stack Report

## Overview

MoveOnEV uses a hybrid architecture built for an EV companion product that needs modern web UX, fast iteration, AI-assisted features, and data-driven range prediction.

At a high level, the stack is split into three layers:

1. A Next.js web application for the user interface, API routes, and server actions.
2. Firebase services for authentication, Firestore-backed community features, and App Hosting deployment.
3. A separate Python + Flask machine learning service for EV range prediction and analytics.

This split is a practical choice: JavaScript and TypeScript are used where product UI and app integration matter most, while Python is used where the machine learning ecosystem is much stronger.

---

## 1. Frontend Stack

### Next.js 15

MoveOnEV is built on **Next.js 15** with the **App Router**.

It is used for:

- Page routing and layouts
- Server components and client components
- API routes for planner-related backend logic
- Server actions for form submission flows
- Metadata and manifest integration

Why we used it:

- It gives us a full-stack React framework in one codebase instead of maintaining separate frontend and Node backend projects.
- It supports modern patterns like server actions and route handlers, which reduce boilerplate for forms and internal APIs.
- It is well suited for production-ready web apps and gives a clean folder-based structure for features such as planner, analytics, community, and assistant.
- It works well with Firebase App Hosting.

### React 18

The UI is built with **React 18**.

It is used for:

- Interactive forms
- State-driven UI
- Planner route analysis screens
- Community and assistant interactions
- Dashboard visualizations

Why we used it:

- React is a mature ecosystem for building rich interfaces.
- The app has many interactive workflows, and React’s component model helps us keep those interfaces modular and reusable.

### TypeScript

The frontend uses **TypeScript 5** with strict mode enabled.

It is used for:

- Strong typing across pages, hooks, utility modules, planner logic, and API contracts
- Safer data handling between frontend, Next.js route handlers, and the ML service
- Better maintainability as the project grows

Why we used it:

- This project passes complex data structures around, especially for route planning, charging recommendations, and analytics.
- TypeScript reduces runtime bugs by catching shape mismatches earlier in development.
- It makes the codebase easier to document and collaborate on.

### Tailwind CSS

The UI styling is based on **Tailwind CSS**.

It is used for:

- Rapid page styling
- Responsive layouts
- Consistent spacing, colors, and typography
- Reusable utility-driven design across the app

Why we used it:

- Tailwind speeds up UI development without requiring large custom CSS files.
- It works especially well in a component-heavy React project.
- It helps keep the visual system consistent across planner, dashboard, analytics, and community screens.

### shadcn/ui + Radix UI

The component layer is built using **shadcn/ui** patterns on top of **Radix UI** primitives.

It is used for:

- Buttons, cards, dialogs, tabs, forms, select menus, sheets, toasts, alerts, and other reusable UI elements

Why we used it:

- It provides accessible, production-quality primitives without locking the project into a rigid design system.
- It gives us a polished UI foundation while still allowing customization.
- It reduces the time needed to build common interface elements from scratch.

### Lucide React

**Lucide React** is used for icons throughout the product.

Why we used it:

- It provides a clean, modern icon set.
- It integrates well with React and Tailwind.
- It keeps the UI visually consistent.

### Recharts

**Recharts** is used for analytics and dashboard visualizations.

It is used for:

- Monthly savings charts
- Environmental impact charts

Why we used it:

- It is simple to integrate into React components.
- It is sufficient for the current charting needs without introducing the weight or complexity of a larger BI/charting framework.

### Zod

**Zod** is used for validation and schema definition.

It is used for:

- Validating planner requests
- Validating server action form input
- Defining AI flow inputs and outputs

Why we used it:

- It gives a clear, type-safe validation layer.
- It is especially useful in a codebase where data moves between forms, APIs, AI flows, and ML services.

### PWA Support

The project includes a **web app manifest**, which makes the app behave more like an installable web application.

Why we used it:

- EV users often rely on utility apps while travelling.
- A PWA-style setup improves mobile usability and makes the app feel more app-like without requiring a separate native application.

---

## 2. Application Backend Stack

### Next.js Route Handlers

The project uses **Next.js route handlers** under `src/app/api`.

They are used for:

- Planner route analysis
- Traffic route lookup
- Vehicle option lookup
- Location autocomplete suggestions

Why we used them:

- They let us keep lightweight backend logic inside the same Next.js project.
- This is simpler than introducing a separate Node/Express backend for app orchestration.
- It keeps the product easier to deploy and maintain.

### Next.js Server Actions

The project uses **server actions** for several workflows.

They are used for:

- AI assistant actions
- Station and service-center search flows
- Community post and reply submission

Why we used them:

- They reduce the need for extra REST endpoints for internal form submissions.
- They fit well with App Router patterns and simplify data mutation flows.

---

## 3. Authentication, Database, and Hosting

### Firebase Authentication

**Firebase Authentication** is used for sign-in state management on the client.

Why we used it:

- Authentication is a solved problem in Firebase, which helps us move faster.
- It gives a reliable sign-in flow without building a custom auth system.
- It integrates naturally with the rest of the Firebase stack.

### Firestore

**Cloud Firestore** is used for community features through the Firebase Admin SDK on the server side.

It is used for:

- Community posts
- Replies
- Likes and transactional updates

Why we used it:

- Firestore is a good fit for document-oriented, user-generated content.
- It avoids the setup and operational overhead of managing a relational database for this stage of the product.
- It works well with Firebase auth and server-side admin access.

### Firebase Admin SDK

The **Firebase Admin SDK** is used for secure server-side Firestore access.

Why we used it:

- It keeps privileged operations off the client.
- It allows the server to handle community reads and writes safely.

### Firebase App Hosting

The repository includes **Firebase App Hosting** configuration.

Why we used it:

- It aligns well with a Next.js application.
- It simplifies deployment for a product that already relies on Firebase services.
- It reduces infrastructure management work.

### Local Storage for Personal User Metrics

Not every user-specific feature is stored in Firestore. Some personal usage data is stored in **browser localStorage**.

It is used for:

- Service logs
- Trip history
- Savings and rewards calculations

Why we used it:

- These features can work without requiring backend persistence immediately.
- It keeps implementation simple for user-private, lightweight tracking features.
- It reduces backend reads and writes for non-critical personal data.

---

## 4. AI Stack

### Genkit

MoveOnEV uses **Google Genkit** to define and run AI flows.

It is used for:

- Vehicle issue diagnosis
- Audio transcription
- Text-to-speech
- Charging station and service center discovery flows

Why we used it:

- Genkit gives structure to AI features instead of scattering prompt logic across components.
- It provides typed flow definitions and a cleaner integration layer for AI capabilities.
- It fits well in a Next.js TypeScript codebase.

### Google AI / Gemini Models

The AI features are powered through **Google AI models** via the Genkit Google AI plugin.

The codebase currently uses Gemini-family models for:

- Multimodal diagnosis from text and optional images
- Audio transcription
- Text-to-speech

Why we used them:

- The assistant needs multimodal capabilities, not just text generation.
- Gemini models work well for mixed-input flows such as photo + text diagnosis and speech-based interaction.
- This supports the goal of making the app more accessible for EV users who may prefer voice or image input.

---

## 5. Machine Learning Stack

### Python

The predictive analytics service is written in **Python**.

Why we used it:

- Python is the strongest ecosystem for data science and machine learning.
- It is a better fit than JavaScript for model training, preprocessing, and experiment-friendly analytics work.

### Flask

The ML service uses **Flask** as a lightweight API framework.

It is used for:

- Exposing prediction endpoints
- Serving analytics APIs
- Returning model metadata, rankings, comparisons, and dataset stats

Why we used it:

- Flask is lightweight and ideal for a focused microservice.
- The ML layer does not need the overhead of a larger Python web framework.
- It is easy to connect with the Next.js app over HTTP.

### Flask-CORS and Flask-Caching

These are used to:

- Allow the frontend and Next.js app to call the ML service safely
- Cache repeated responses where useful

Why we used them:

- Cross-service communication is part of the architecture.
- A small caching layer improves responsiveness for repeated ML or analytics access patterns.

### Pandas and NumPy

These libraries are used for:

- Reading and merging EV datasets
- Feature engineering
- Numerical preprocessing

Why we used them:

- They are the standard foundation for tabular data and numeric workflows in Python.
- The app’s EV analytics features rely on dataset manipulation and feature generation before prediction.

### Scikit-learn

**Scikit-learn** is used for:

- Pipelines
- Preprocessing
- Imputation
- Scaling
- Model evaluation
- Ensemble modeling

Why we used it:

- It provides robust tools for structured-data ML pipelines.
- It is a strong fit for EV range prediction based on tabular features like battery size, speed, temperature, and mileage.

### XGBoost and LightGBM

The ML service uses **XGBoost** and **LightGBM** alongside scikit-learn models.

Why we used them:

- Tree-based boosting models perform very well on structured/tabular datasets.
- EV range prediction depends on nonlinear relationships, and boosting models usually capture these better than simple linear baselines.
- Using multiple models allows comparison and ensemble selection.

### Joblib

**Joblib** is used for model persistence.

Why we used it:

- It provides a simple way to save and reload trained models for inference.
- This avoids retraining the models every time the service starts.

### Current ML Modeling Approach

The service currently trains and compares multiple regressors, including:

- XGBoost
- LightGBM
- Gradient Boosting Regressor
- Random Forest Regressor
- A Voting Regressor ensemble

Why this approach was used:

- No single regressor is guaranteed to be best for all EV data patterns.
- Comparing several models allows the system to pick the strongest performer.
- Ensembles increase robustness by combining strengths from multiple models.

---

## 6. Mapping, Routing, and EV Data Integrations

### TomTom

**TomTom APIs** are used as the primary routing and geocoding provider for planner features.

It is used for:

- Traffic-aware route calculation
- Geocoding
- Search suggestions

Why we used it:

- The route planner needs traffic-aware travel time and route intelligence.
- Traffic data matters a lot for EV planning because congestion changes energy consumption and ETA.

### OpenRouteService

**OpenRouteService** is used as an alternative routing and geocoding provider.

Why we used it:

- It gives the planner a fallback provider instead of depending on a single external API.
- This improves resilience and flexibility.

### OSRM and Nominatim

The project also includes fallback use of **OSRM** for routing and **Nominatim** for geocoding.

Why we used them:

- They provide an extra safety layer when primary providers are unavailable.
- This supports a more fault-tolerant planning experience.

### OpenChargeMap

**OpenChargeMap** is used for charging station discovery.

Why we used it:

- It is a practical EV-focused dataset for charging infrastructure lookup.
- It supports the core use case of finding viable charging points along a route.

### Leaflet + OpenStreetMap

The planner’s embedded route map uses **Leaflet** with **OpenStreetMap** tiles.

Why we used them:

- They provide a lightweight, low-cost way to render interactive maps inside the app.
- This is a practical choice for route visualization without tightly coupling the app UI to a commercial map SDK.

### Google Maps Links

The app generates **Google Maps direction links** for external navigation handoff.

Why we used this approach:

- Users can complete planning inside MoveOnEV and then open the trip in a familiar navigation tool.
- This improves real-world usability without forcing users into a custom navigation experience.

### EV Datasets

The ML service uses CSV datasets such as:

- `electric_vehicle_analytics.csv`
- `open-ev-data-v1.24.0.csv`
- `electric_vehicles_spec_2025.csv.csv`

Why we used dataset files:

- The analytics and planner features need structured EV specifications and range-related data.
- CSV-based datasets are easy to preprocess, merge, retrain on, and version with the project.

---

## 7. Developer Tooling

### ESLint

**ESLint** is included for code quality checks.

Why we used it:

- It helps keep the codebase consistent and catch common mistakes early.

### Type Checking with `tsc`

The project includes a dedicated **typecheck** script.

Why we used it:

- Static type checking is important in a project with many cross-module data contracts.

### PostCSS

**PostCSS** is used as part of the Tailwind styling pipeline.

Why we used it:

- It is the standard setup for Tailwind in modern frontend projects.

### Utility Libraries

The project also uses supporting libraries such as:

- `clsx`
- `tailwind-merge`
- `class-variance-authority`
- `tailwindcss-animate`

Why we used them:

- They help build reusable, variant-driven UI components cleanly and consistently.

---

## 8. Why This Overall Tech Stack Fits the Project

This stack was chosen because MoveOnEV is not just a content website. It is a product with several different technical needs at the same time:

- A polished web interface for daily EV users
- Real-time route planning and charging support
- AI-assisted diagnostics and voice features
- Machine learning predictions based on EV datasets
- User accounts and community interactions

Using one technology for everything would have created tradeoffs in the wrong places.

### Why the frontend/backend app layer uses Next.js + TypeScript

This combination gives us:

- Fast UI development
- Strong maintainability
- Built-in full-stack features
- A clean way to combine pages, APIs, and server actions

It is the right choice for the product-facing application layer.

### Why Firebase is part of the stack

Firebase reduces operational complexity for:

- Authentication
- Firestore-backed community features
- Hosting integration

This is valuable because the project’s focus is EV experience and product features, not infrastructure management.

### Why AI uses Genkit + Gemini

The AI features in MoveOnEV are practical product features, not standalone research experiments.

Genkit helps productize those flows cleanly, while Gemini provides multimodal capabilities needed for:

- Voice input
- Photo-assisted diagnosis
- Text generation
- Speech output

### Why ML is separated into a Python service

The machine learning part of the system is materially different from the rest of the app:

- It needs data preprocessing
- It trains structured-data regressors
- It uses Python-native ML libraries

Keeping it as a separate Flask service makes the architecture cleaner and lets the frontend app use the best tool for the job without forcing ML into the JavaScript runtime.

### Why multiple mapping and routing providers are used

EV planning is operationally sensitive. If routing, geocoding, or station lookup fails, the core feature fails.

Using multiple providers improves:

- Reliability
- Fallback behavior
- Coverage flexibility
- Control over traffic-aware planning

---

## 9. Notable Practical Observations

- The project is primarily a **full-stack web app plus ML microservice**, not a traditional monolithic backend.
- The most business-critical technologies are **Next.js**, **Firebase**, **Genkit/Gemini**, and the **Python Flask ML service**.
- The planner is one of the most technically rich modules because it combines routing APIs, charging-station data, map rendering, and ML-assisted range logic.
- Some dependencies are present as supporting utilities or future-ready tooling, but the core runtime stack is the set described above.

---

## 10. Documentation-Ready Summary

MoveOnEV is built with **Next.js, React, TypeScript, Tailwind CSS, and shadcn/ui** for the main web application; **Firebase Authentication, Firestore, and Firebase App Hosting** for identity, community data, and deployment; **Genkit with Google Gemini models** for AI-driven diagnosis, transcription, and speech features; and a separate **Python Flask machine learning service** powered by **Pandas, NumPy, scikit-learn, XGBoost, and LightGBM** for EV range prediction and analytics. This stack was chosen because it balances rapid product development, strong UI quality, low infrastructure overhead, robust AI integration, and access to the best ecosystem for machine learning on tabular EV data.
