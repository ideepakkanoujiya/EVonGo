# Planner Model Accuracy Risk Report

Generated on: 2026-03-24

## Scope

This report identifies planner EV make/model entries that are **likely** to have less accurate range predictions in the current project.

This is a risk analysis, not a measured per-model error benchmark.

## Important Caveat

The current range predictor in `backend/ml-service/app.py` does **not** use make/model directly as a runtime input feature for planner predictions. It predicts mainly from specs such as battery capacity, efficiency, torque, and top speed.

So this report does **not** prove that a model is inaccurate. Instead, it flags models that are more likely to be inaccurate because:

- they have no direct support in the analytics training base
- they have no exact make/model/year support in the training base
- they come from only one dataset source
- some dataset-backed reference specs are missing and would fall back to defaults

## Dataset Reality Behind The Risk

- Planner EV picker options come from multiple CSV files.
- The ML training base is `electric_vehicle_analytics.csv`.
- `open-ev-data-v1.24.0.csv` is merged only when the same make/model/year already exists in the analytics dataset.
- `electric_vehicles_spec_2025.csv.csv` contributes planner options, but it is not the main ML training base.

That mismatch is why many picker models are flagged as risky.

## Counts

- Total planner options analyzed: 1281
- High risk: 1051
- Medium risk: 211
- Low risk: 19

## Highest-Risk Example Models

- Abarth 500e Convertible: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Abarth 500e Hatchback: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Abarth 600e Scorpionissima: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Abarth 600e Turismo: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Aiways U5: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Aiways U6: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Alfa Romeo Junior Elettrica 54 kWh: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Alfa Romeo Junior Elettrica 54 kWh Veloce: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Alpine A290 Electric 180 hp: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Alpine A290 Electric 220 hp: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi A6 Avant e-tron: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi A6 Avant e-tron performance: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi A6 Avant e-tron quattro: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi A6 Sportback e-tron: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi A6 Sportback e-tron performance: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi A6 Sportback e-tron quattro: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi A6 e-tron (2024): no analytics training rows for this make/model; only one dataset source
- Audi A6 e-tron (2025): no analytics training rows for this make/model; only one dataset source
- Audi Q4 Sportback e-tron 40: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q4 Sportback e-tron 45: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q4 Sportback e-tron 45 quattro: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q4 Sportback e-tron 55 quattro: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q4 e-tron 40: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q4 e-tron 45: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q4 e-tron 45 quattro: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q4 e-tron 55 quattro: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q6 e-tron: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q6 e-tron (2024): no analytics training rows for this make/model; only one dataset source
- Audi Q6 e-tron (2025): no analytics training rows for this make/model; only one dataset source
- Audi Q6 e-tron Sportback: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q6 e-tron Sportback performance: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q6 e-tron Sportback quattro: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q6 e-tron performance: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q6 e-tron quattro: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi Q8 e-tron (2023): no analytics training rows for this make/model; only one dataset source
- Audi Q8 e-tron (2024): no analytics training rows for this make/model; only one dataset source
- Audi Q8 e-tron (2025): no analytics training rows for this make/model; only one dataset source
- Audi S6 Avant e-tron: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi S6 Sportback e-tron: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path
- Audi SQ6 e-tron: no analytics training rows for this make/model; only one dataset source; not supported by analytics base or Open EV merge path

## Medium-Risk Example Models

- Tesla Model Y (2021): only one dataset source; missing planner reference field: torque_nm
- Tesla Model Y (2023): only one dataset source; missing planner reference field: torque_nm
- Tesla Model Y (2024): missing planner reference field: torque_nm
- Tesla Model Y (2017): only one dataset source; missing planner reference field: torque_nm
- Tesla Model Y (2019): only one dataset source; missing planner reference field: torque_nm
- Tesla Model Y (2022): only one dataset source; missing planner reference field: torque_nm
- Tesla Model Y (2015): only one dataset source; missing planner reference field: torque_nm
- Tesla Model Y (2018): only one dataset source; missing planner reference field: torque_nm
- Tesla Model Y (2020): only one dataset source; missing planner reference field: torque_nm
- Tesla Model Y (2016): only one dataset source; missing planner reference field: torque_nm
- Tesla Model S (2021): only one dataset source; missing planner reference field: torque_nm
- Tesla Model S (2018): only one dataset source; missing planner reference field: torque_nm
- Tesla Model S (2022): only one dataset source; missing planner reference field: torque_nm
- Tesla Model S (2023): only one dataset source; missing planner reference field: torque_nm
- Tesla Model S (2016): only one dataset source; missing planner reference field: torque_nm
- Tesla Model S (2020): only one dataset source; missing planner reference field: torque_nm
- Tesla Model S (2024): only one dataset source; missing planner reference field: torque_nm
- Tesla Model S (2015): only one dataset source; missing planner reference field: torque_nm
- Tesla Model S (2017): only one dataset source; missing planner reference field: torque_nm
- Tesla Model S (2019): only one dataset source; missing planner reference field: torque_nm
- Tesla Model 3 (2022): very sparse exact analytics support (2 row(s)); only one dataset source; missing planner reference field: torque_nm
- Tesla Model 3 (2018): only one dataset source; missing planner reference field: torque_nm
- Tesla Model 3 (2019): only one dataset source; missing planner reference field: torque_nm
- Tesla Model 3 (2020): only one dataset source; missing planner reference field: torque_nm
- Tesla Model 3 (2015): only one dataset source; missing planner reference field: torque_nm

## Brands With The Most Flagged Models

- Mercedes-Benz: 65 high, 0 medium, 0 low
- BYD: 42 high, 0 medium, 0 low
- Audi: 39 high, 18 medium, 2 low
- Ford: 35 high, 16 medium, 4 low
- NIO: 35 high, 0 medium, 0 low
- BMW: 34 high, 28 medium, 2 low
- Volkswagen: 33 high, 16 medium, 4 low
- Porsche: 33 high, 0 medium, 0 low
- Peugeot: 32 high, 0 medium, 0 low
- Volvo: 29 high, 0 medium, 0 low
- Hyundai: 22 high, 18 medium, 2 low
- Renault: 22 high, 0 medium, 0 low
- Smart: 22 high, 0 medium, 0 low
- VinFast: 22 high, 0 medium, 0 low
- Zeekr: 22 high, 0 medium, 0 low
- Chery: 20 high, 0 medium, 0 low
- GWM: 19 high, 0 medium, 0 low
- Toyota: 18 high, 0 medium, 0 low
- Tesla: 17 high, 39 medium, 1 low
- Citroën: 17 high, 0 medium, 0 low

## Exact Full List

See [planner-model-accuracy-risk.csv](./planner-model-accuracy-risk.csv) for the exact model-by-model risk classification.
