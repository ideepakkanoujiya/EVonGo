from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
import os
import sys

app = Flask(__name__)
CORS(app)  # Enable CORS for Next.js frontend

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Load datasets
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')

try:
    specs_df = pd.read_csv(os.path.join(DATA_DIR, 'electric_vehicles_spec_2025.csv.csv'))
    analytics_df = pd.read_csv(os.path.join(DATA_DIR, 'electric_vehicle_analytics.csv'))
    print(f"✅ Loaded specs dataset: {specs_df.shape}")
    print(f"✅ Loaded analytics dataset: {analytics_df.shape}")
except Exception as e:
    print(f"❌ Error loading datasets: {e}")
    specs_df = None
    analytics_df = None

# Global models
range_model = None
real_world_model = None
range_features = ['battery_capacity_kWh', 'efficiency_wh_per_km', 'torque_nm', 'top_speed_kmh']
real_world_features = ['Battery_Capacity_kWh', 'Battery_Health_%', 
                       'Energy_Consumption_kWh_per_100km', 'Avg_Speed_kmh', 
                       'Temperature_C', 'Mileage_km']

def train_models():
    global range_model, real_world_model
    
    print("🔄 Training ML models...")
    
    # Train range prediction model
    if specs_df is not None:
        train_data = specs_df[specs_df['range_km'].notna()].copy()
        X = train_data[range_features].fillna(train_data[range_features].median())
        y = train_data['range_km']
        
        range_model = RandomForestRegressor(n_estimators=100, random_state=42)
        range_model.fit(X, y)
        print(f"✅ Range prediction model trained (R²: {range_model.score(X, y):.3f})")
    
    # Train real-world range model
    if analytics_df is not None:
        df = analytics_df[analytics_df['Range_km'].notna() & (analytics_df['Range_km'] > 0)].copy()
        X_rw = df[real_world_features].fillna(df[real_world_features].median())
        y_rw = df['Range_km']
        
        real_world_model = RandomForestRegressor(n_estimators=150, random_state=42)
        real_world_model.fit(X_rw, y_rw)
        print(f"✅ Real-world range model trained (R²: {real_world_model.score(X_rw, y_rw):.3f})")

# Initialize models on startup
train_models()

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'models_loaded': {
            'range_model': range_model is not None,
            'real_world_model': real_world_model is not None
        }
    })

@app.route('/predict-range', methods=['POST'])
def predict_range():
    try:
        data = request.json
        
        if not range_model:
            return jsonify({'error': 'Range model not loaded'}), 500
        
        # Create input dataframe
        input_df = pd.DataFrame([data])
        
        # Fill missing features with median values
        for col in range_features:
            if col not in input_df.columns:
                input_df[col] = specs_df[col].median()
        
        # Predict
        prediction = range_model.predict(input_df[range_features])[0]
        
        return jsonify({
            'success': True,
            'predicted_range_km': round(float(prediction), 1),
            'input': data
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/predict-real-world-range', methods=['POST'])
def predict_real_world_range():
    try:
        data = request.json
        
        if not real_world_model:
            return jsonify({'error': 'Real-world model not loaded'}), 500
        
        # Create input dataframe
        input_df = pd.DataFrame([data])
        
        # Fill missing features
        for col in real_world_features:
            if col not in input_df.columns:
                input_df[col] = analytics_df[col].median()
        
        # Predict
        prediction = real_world_model.predict(input_df[real_world_features])[0]
        
        return jsonify({
            'success': True,
            'predicted_range_km': round(float(prediction), 1),
            'input': data
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/efficiency-rankings', methods=['GET'])
def get_efficiency_rankings():
    try:
        if specs_df is None:
            return jsonify({'error': 'Specs dataset not loaded'}), 500
        
        df = specs_df[specs_df['efficiency_wh_per_km'].notna() & 
                      (specs_df['efficiency_wh_per_km'] > 0)].copy()
        
        min_eff = df['efficiency_wh_per_km'].min()
        max_eff = df['efficiency_wh_per_km'].max()
        
        if max_eff == min_eff:
            df['efficiency_score'] = 100.0
        else:
            df['efficiency_score'] = 100 - ((df['efficiency_wh_per_km'] - min_eff) / 
                                            (max_eff - min_eff) * 100)
        
        df['efficiency_score'] = df['efficiency_score'].clip(0, 100)
        df = df.sort_values('efficiency_score', ascending=False)
        df['rank'] = range(1, len(df) + 1)
        
        result = df[['rank', 'brand', 'model', 'efficiency_wh_per_km', 'efficiency_score']].head(15)
        
        return jsonify({
            'success': True,
            'rankings': result.to_dict('records')
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/compare-vehicles', methods=['POST'])
def compare_vehicles():
    try:
        data = request.json
        vehicle_keywords = data.get('vehicleNames', [])
        
        if specs_df is None:
            return jsonify({'error': 'Specs dataset not loaded'}), 500
        
        # Find matching vehicles (case-insensitive partial match)
        matches = []
        keywords = [kw.lower() for kw in vehicle_keywords]
        
        for idx, row in specs_df.iterrows():
            model_name = str(row['model']).lower()
            for kw in keywords:
                if kw in model_name:
                    matches.append({
                        'brand': row['brand'],
                        'model': row['model'],
                        'range_km': float(row.get('range_km', 0)),
                        'efficiency_wh_per_km': float(row.get('efficiency_wh_per_km', 0)),
                        'fast_charging_power_kw_dc': float(row.get('fast_charging_power_kw_dc', 0))
                    })
                    break
        
        if not matches:
            return jsonify({
                'success': False,
                'message': 'No vehicles found',
                'suggestions': specs_df['model'].sample(5).tolist()
            })
        
        # Normalize scores
        comparison_df = pd.DataFrame(matches)
        
        comparison_df['range_score'] = (
            comparison_df['range_km'] / comparison_df['range_km'].max() * 100
        ).fillna(0)
        
        comparison_df['efficiency_score'] = (
            1 - (comparison_df['efficiency_wh_per_km'] - comparison_df['efficiency_wh_per_km'].min()) / 
            (comparison_df['efficiency_wh_per_km'].max() - comparison_df['efficiency_wh_per_km'].min() + 1)
        ) * 100
        
        comparison_df['charging_score'] = (
            comparison_df['fast_charging_power_kw_dc'] / 
            comparison_df['fast_charging_power_kw_dc'].max() * 100
        ).fillna(0)
        
        return jsonify({
            'success': True,
            'comparison': comparison_df.to_dict('records')
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/search-vehicles', methods=['GET'])
def search_vehicles():
    try:
        brand = request.args.get('brand', '')
        model = request.args.get('model', '')
        min_range = request.args.get('minRange', type=float)
        max_range = request.args.get('maxRange', type=float)
        
        if specs_df is None:
            return jsonify({'error': 'Specs dataset not loaded'}), 500
        
        df = specs_df.copy()
        
        # Apply filters
        if brand:
            df = df[df['brand'].str.lower().str.contains(brand.lower())]
        
        if model:
            df = df[df['model'].str.lower().str.contains(model.lower())]
        
        if min_range:
            df = df[df['range_km'] >= min_range]
        
        if max_range:
            df = df[df['range_km'] <= max_range]
        
        # Return top 20 results
        result = df[['brand', 'model', 'range_km', 'efficiency_wh_per_km', 
                    'battery_capacity_kWh', 'fast_charging_power_kw_dc']].head(20)
        
        return jsonify({
            'success': True,
            'vehicles': result.to_dict('records'),
            'total': len(df)
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)