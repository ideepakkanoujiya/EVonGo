# MoveOnEV - Step-by-Step Deployment Guide

This guide outlines the optimal deployment strategy for the MoveOnEV project. Because the application utilizes a microservices architecture, you will deploy the **Machine Learning (ML) Service** first, followed by the **Next.js PWA Frontend**, and finally configure **Firebase**.

## Architecture Overview
*   **Frontend (Next.js 15 PWA):** Best deployed on **Vercel** (optimizes Server Components and Serverless APIs natively).
*   **Backend (Python/Flask ML Service):** Best deployed on **Render** or **Google Cloud Run** (as a persistent web service to keep large ML models loaded in memory for faster prediction latency).
*   **Database & Auth:** Hosted automatically on **Firebase Cloud**.

---

## Step 1: Pre-Deployment Preparation

Before deploying, ensure you have active accounts on:
1.  **GitHub** (for hosting your repository)
2.  **Firebase Console** (your existing backend and auth)
3.  **Render** or **Google Cloud** (for the Python ML Service)
4.  **Vercel** (for the Next.js frontend)

Push your most recent `MoveOnEV-main` code to a GitHub repository if you haven't already.

---

## Step 2: Deploy the ML Service (Backend)

We deploy the ML Service first because the frontend will need the backend's URL to function correctly in production. We will use **Render** for a straightforward Python deployment.

1. Go to your Render Dashboard (https://dashboard.render.com).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository containing the MoveOnEV code.
4. **Configuration Settings:**
    *   **Name:** `moveonev-ml-backend` (or similar)
    *   **Root Directory:** `backend/ml-service` *(Crucial step: telling Render where the Python code lives)*
    *   **Environment:** `Python 3`
    *   **Build Command:** `pip install -r requirements.txt`
    *   **Start Command:** `gunicorn app:app --workers 2 --timeout 120` (Using `gunicorn` instead of `flask run` is required for production stability).
5. **Environment Variables:**
    *   Add `FLASK_ENV=production` if necessary.
6. Click **Create Web Service**.
7. *Wait 5-10 minutes* for the build to complete. 
8. **Save the Production URL:** Once live, copy the Render App URL (e.g., `https://moveonev-ml-backend.onrender.com`). You will need this for the frontend!

---

## Step 3: Deploy the Next.js App (Frontend)

With the backend live, we deploy the frontend using Vercel.

1. Go to your Vercel Dashboard (https://vercel.com).
2. Click **Add New -> Project**.
3. Import your GitHub repository.
4. **Configuration Settings:**
    *   **Framework Preset:** Next.js (Should be auto-detected)
    *   **Root Directory:** `./` (Leave as root)
5. **Environment Variables:** Open the `Environment Variables` tab and add all the keys from your `.env.local.example` file. 

    > **Crucial URL Changes for Production:**
    > Make sure you point the Next.js app to the newly deployed ML Backend!
    > `ML_SERVICE_URL=https://moveonev-ml-backend.onrender.com`
    > `NEXT_PUBLIC_ML_SERVICE_URL=https://moveonev-ml-backend.onrender.com`

    *Add all other required API keys:*
    *   `NEXT_PUBLIC_FIREBASE_API_KEY`, etc.
    *   `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON`
    *   `GOOGLE_GENAI_API_KEY`
    *   `ROUTING_PROVIDER=tomtom`
    *   `TOMTOM_API_KEY`
    *   `OPENCHARGEMAP_API_KEY`
6. Click **Deploy**.
7. Vercel will build your Next.js application, generate statically optimized pages, and deploy serverless functions.
8. Once completed, copy the **Vercel Production Domain** (e.g., `https://moveonev.vercel.app`).

---

## Step 4: Post-Deployment Firebase Configuration

Now that you have a live, production frontend URL, you must inform Firebase that this URL is allowed to communicate with your project.

### 4.1 Update Firebase Auth Authorized Domains
By default, Firebase Auth only functions on `localhost`. 

1. Go to your **Firebase Console**.
2. Navigate to **Authentication** -> **Settings** -> **Authorized domains**.
3. Click **Add domain** and paste your Vercel Production Domain (e.g., `moveonev.vercel.app` - omit the `https://`).

### 4.2 Validate Firestore Security Rules
Ensure your Firestore Rules are set up to properly protect your database in production. Ensure read/write operations require a verified `request.auth.uid`.

---

## Step 5: Final Verification

Perform a live sanity check to ensure the microservices are communicating correctly.

1. Open your Vercel domain in an incognito window.
2. Sign up / Log in to test **Firebase Authentication**.
3. Navigate to the **Route Planner** to verify that TomTom/Google Maps APIs load.
4. Navigate to the **EV Analytics / Predictor** and attempt a prediction. This will verify if the Next.js app is successfully passing CORS checks and communicating with the **Render Python ML backend**.
5. Use the **AI Assistant** to verify the Genkit flow and Gemini API key works in a lambda/serverless environment.

---
### Congratulations!
Your web application is now successfully deployed in a decoupled microservices architecture. Once this is stable, you are well-positioned to wrap this PWA into a native mobile skeleton.
