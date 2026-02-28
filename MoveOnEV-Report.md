# MoveOnEV Project Report

## Abstract

MoveOnEV is a comprehensive Progressive Web App (PWA) designed to serve as an all-in-one digital assistant for Electric Vehicle (EV) owners. The application integrates AI-powered features, advanced route planning, community engagement, and detailed vehicle analytics into a single, user-friendly platform. By centralizing these functionalities, MoveOnEV aims to simplify the EV ownership experience, address common pain points like range anxiety, and foster a connected community of EV enthusiasts.

## Introduction

The transition to electric vehicles presents new challenges for drivers, who must navigate a fragmented ecosystem of applications for routing, charging, and vehicle management. MoveOnEV was conceived to address this gap by providing a unified and intelligent solution. The project's goal is to enhance the convenience, efficiency, and enjoyment of EV ownership through a suite of powerful, integrated tools. From AI-driven diagnostics to real-world range predictions and community forums, MoveOnEV strives to be the indispensable companion for every EV driver.

## Problem Statement

The current landscape of EV-related applications is disjointed, forcing users to switch between multiple apps for fundamental tasks. A driver might use one app for navigation, another to locate charging stations, a third for vehicle-specific analytics, and various online forums for community support. This fragmentation leads to a clunky and inefficient user experience, creating friction and contributing to issues like range anxiety and difficulties in trip planning. This lack of a centralized, intelligent platform is a significant barrier to the mainstream adoption and seamless enjoyment of electric vehicles.

## Proposed Solution

MoveOnEV offers a single, cohesive PWA that consolidates all the essential tools for an EV owner. The core of the platform is a multifaceted system that includes:

1.  **AI-Powered Assistant:** A Genkit-based conversational AI that assists with vehicle diagnostics, finding charging stations or service centers, and answering user queries.
2.  **Intelligent Route Planner:** A sophisticated planner that not only maps routes but also suggests optimal charging stops based on the vehicle's state of charge, traffic conditions, and station availability.
3.  **Advanced EV Analytics:** A suite of tools, powered by a Python-based machine learning backend, that offers:
    *   **Real-World Range Prediction:** Predicts vehicle range based on technical specifications and environmental factors.
    *   **Vehicle Comparison:** Allows users to compare the specifications and performance of different EV models.
    *   **Efficiency Rankings:** Provides a leaderboard of vehicles ranked by energy efficiency.
4.  **Community Hub:** An integrated forum where users can share experiences, ask questions, and connect with other EV owners, with content managed via AI flows.
5.  **Centralized Dashboard:** A personalized dashboard that provides at-a-glance information about the user's vehicle, recent activity, and quick access to all features.

By integrating these features into one application, MoveOnEV provides a seamless and context-aware experience, making EV ownership simpler and more predictable.

## Tech Stack

-   **Frontend:**
    -   **Framework:** Next.js 15 / React 18
    -   **Language:** TypeScript
    -   **Styling:** Tailwind CSS with `shadcn/ui` components and `lucide-react` for icons.
    -   **Mapping:** `@react-google-maps/api` for Google Maps integration.
    -   **Charting:** `recharts` for data visualization.
    -   **Form Management:** `react-hook-form` with `zod` for validation.

-   **Backend & AI:**
    -   **AI Orchestration:** Google's Genkit (`genkit`, `@genkit-ai/next`, `@genkit-ai/googleai`) to define and manage AI flows.
    -   **Machine Learning Service:**
        -   **Framework:** Flask (Python)
        -   **ML Libraries:** Scikit-learn, XGBoost, LightGBM, Pandas, NumPy for model training and prediction.
        -   **API:** Serves RESTful endpoints for range prediction, vehicle comparison, and other analytics.

-   **Database & Authentication:**
    -   **Services:** Firebase (Firestore for database, Firebase Authentication for user management).

-   **Deployment:**
    -   **Frontend/PWA:** Deployed on Vercel.
    -   **ML Service:** Deployed as a containerized service on Google Cloud (implied by `apphosting.yaml`).

## Workflow

1.  **Authentication:** Users sign up or log in using Firebase Authentication.
2.  **Dashboard:** Upon login, the user is greeted with a personalized dashboard displaying key vehicle information and navigation to the app's main features.
3.  **AI Interaction:** The user can interact with the AI assistant via text or voice (using transcription and text-to-speech flows) to ask questions or issue commands.
4.  **Route Planning:**
    -   The user enters a destination in the **Planner**.
    -   The Next.js frontend calls the `suggest-charging-stops` Genkit flow.
    -   This flow may call the ML backend for traffic-aware range predictions and external APIs (like Google Maps) to get route and charging station data.
    -   The optimized route with charging stops is displayed on the map.
5.  **EV Analytics:**
    -   The user navigates to the **EV Analytics** section.
    -   React components make API calls to the Python/Flask backend service.
    -   The backend service uses its trained models (e.g., XGBoost, LightGBM) to return predictions for range, vehicle comparisons, or efficiency rankings.
    -   The results are visualized in the frontend using `recharts`.
6.  **Community Engagement:**
    -   In the **Community** section, users can view posts fetched via the `getCommunityPosts` flow.
    -   When creating a new post, the `addCommunityPost` flow is triggered to save the data to Firebase Firestore.

## Architecture Diagram (Mermaid)

```mermaid
graph TD
    subgraph User Interface (Next.js PWA on Vercel)
        A[User] --> B{MoveOnEV App};
        B --> C[Dashboard];
        B --> D[AI Assistant];
        B --> E[Route Planner];
        B --> F[EV Analytics];
        B --> G[Community Forum];
        B --> H[Stations & Service Centers];
    end

    subgraph Backend Services
        subgraph Genkit AI Flows (on Next.js Server)
            D -- "diagnose, find stations, etc." --> I{Genkit Flows};
            E -- "suggest-charging-stops" --> I;
            G -- "get/add posts" --> I;
        end

        subgraph ML Service (Python/Flask on Google Cloud)
            J[API Endpoints];
            J -- "/predict-range" --> K[Range Prediction Models];
            J -- "/compare-vehicles" --> L[Vehicle Data & Comparison];
            J -- "/efficiency-rankings" --> M[Efficiency Models];
            K[XGBoost, LightGBM, Ensemble];
            M[Scikit-learn];
        end
    end

    subgraph External Services & Data
        N[Firebase];
        O[Google Maps API];
        P[Google AI - Gemini];
    end

    %% Connections
    I --> N[Firestore for Community Posts];
    I --> O[Google Maps for Routes/Places];
    I --> P[Gemini for Generative AI];
    F -- "API Call" --> J;
    E -- "API Call for traffic-aware range" --> J;

    B -- "Login/Auth" --> N[Firebase Auth];
    G -- "Data" --> N[Firestore];

    classDef user fill:#f9f,stroke:#333,stroke-width:2px;
    classDef pwa fill:#bbf,stroke:#333,stroke-width:2px;
    classDef genkit fill:#fb9,stroke:#333,stroke-width:2px;
    classDef ml fill:#9f9,stroke:#333,stroke-width:2px;
    classDef services fill:#9ff,stroke:#333,stroke-width:2px;

    class A user;
    class B,C,D,E,F,G,H pwa;
    class I genkit;
    class J,K,L,M ml;
    class N,O,P services;
```
