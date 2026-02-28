from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_caching import Cache
import pandas as pd
import numpy as np
import joblib
import os
import sys
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import warnings
warnings.filterwarnings('ignore')
# ML Libraries
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor, VotingRegressor
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.impute import SimpleImputer
from xgboost import XGBRegressor
import lightgbm as lgb
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
# Configure logging
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('ev_predictor.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)
# Cache configuration
cache = Cache(app, config={'CACHE_TYPE': 'simple'})
# Data directory
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')
os.makedirs(MODELS_DIR, exist_ok=True)
# Global variables
models = {}
scalers = {}
feature_importances = {}
datasets = {}
model_metadata = {}
# Feature configurations for different prediction scenarios (updated for both datasets)
RANGE_FEATURES_ML = [
    'battery_capacity_kWh', 'battery_health_percent', 'energy_consumption_kWh_per_100km',
    'avg_speed_kmh', 'temperature_c', 'mileage_km', 'year', 'max_speed_kmh',
    'acceleration_0_100_kmh_sec', 'charging_power_kw', 'system_power_kw', 'top_speed_kmh'
]
REAL_WORLD_FEATURES = [
    'Battery_Capacity_kWh', 'Battery_Health_%', 'Energy_Consumption_kWh_per_100km',
    'Avg_Speed_kmh', 'Temperature_C', 'Mileage_km', 'Driving_Style_Index',
    'Terrain_Index', 'AC_Usage_kWh', 'Regenerative_Braking_Efficiency_%'
]
TRAFFIC_FEATURES = [
    'avg_speed_kmh', 'congestion_factor', 'traffic_density',
    'stop_count_per_km', 'avg_acceleration_mps2'
]
WEATHER_FEATURES = [
    'temperature_c', 'wind_speed_kmh', 'precipitation_mm',
    'humidity_percent', 'road_condition_index'
]
class EVRangePredictor:
    """Advanced EV Range Prediction System with Multiple Models"""
    def __init__(self):
        self.models = {}
        self.pipelines = {}
        self.feature_sets = {}
        self.scalers = {}
        self.performance_metrics = {}
    def load_and_preprocess_data(self):
        """Load and preprocess all available datasets"""
        logger.info("🔄 Loading and preprocessing datasets...")
        try:
            # Load all datasets
            datasets = {}
            # electric_vehicle_analytics.csv
            try:
                analytics_df = pd.read_csv(os.path.join(DATA_DIR, 'electric_vehicle_analytics.csv'))
                analytics_df.columns = analytics_df.columns.str.strip()
                datasets['analytics'] = analytics_df
                logger.info(f"✅ Loaded analytics dataset: {analytics_df.shape}")
            except Exception as e:
                logger.warning(f"⚠️ Could not load analytics dataset: {e}")
            # open-ev-data-v1.24.0.csv
            try:
                open_ev_df = pd.read_csv(os.path.join(DATA_DIR, 'open-ev-data-v1.24.0.csv'))
                open_ev_df.columns = open_ev_df.columns.str.strip()
                datasets['open_ev'] = open_ev_df
                logger.info(f"✅ Loaded open-ev dataset: {open_ev_df.shape}")
            except Exception as e:
                logger.warning(f"⚠️ Could not load open-ev dataset: {e}")
            # Merge and preprocess datasets
            combined_df = self.merge_datasets(datasets)
            processed_df = self.preprocess_features(combined_df)
            return processed_df
        except Exception as e:
            logger.error(f"❌ Error in load_and_preprocess_ {e}")
            raise
    def merge_datasets(self, datasets: Dict) -> pd.DataFrame:
        """Merge multiple datasets intelligently"""
        logger.info("🔄 Merging datasets...")
        merged_df = None
        # Start with analytics data as base (has more operational data)
        if 'analytics' in datasets:
            merged_df = datasets['analytics'].copy()
            logger.info("Using analytics dataset as base")
        # Merge with open-ev data if available
        if 'open_ev' in datasets and merged_df is not None:
            try:
                open_ev_features = datasets['open_ev'][[
                    'make_name', 'model_name', 'year', 'battery_capacity_net_kwh',
                    'battery_capacity_gross_kwh', 'range_wltp_km', 'range_epa_km',
                    'system_power_kw', 'system_torque_nm', 'top_speed_kmh',
                    'acceleration_0_100_s', 'dc_max_power_kw', 'vehicle_type'
                ]].drop_duplicates()
                # Rename columns to match analytics dataset
                open_ev_features = open_ev_features.rename(columns={
                    'make_name': 'Make',
                    'model_name': 'Model',
                    'year': 'Year',
                    'battery_capacity_net_kwh': 'Battery_Capacity_kWh_OpenEV',
                    'battery_capacity_gross_kwh': 'Battery_Capacity_Gross_kWh',
                    'range_wltp_km': 'Range_WLTP_km',
                    'range_epa_km': 'Range_EPA_km',
                    'system_power_kw': 'System_Power_kW',
                    'system_torque_nm': 'System_Torque_Nm',
                    'top_speed_kmh': 'Top_Speed_kmh',
                    'acceleration_0_100_s': 'Acceleration_0_100_s',
                    'dc_max_power_kw': 'DC_Max_Power_kW',
                    'vehicle_type': 'Vehicle_Type_OpenEV'
                })
                # Merge on Make, Model, and Year
                merged_df = pd.merge(
                    merged_df,
                    open_ev_features,
                    left_on=['Make', 'Model', 'Year'],
                    right_on=['Make', 'Model', 'Year'],
                    how='left'
                )
                logger.info(f"Merged with open-ev data: {merged_df.shape}")
            except Exception as e:
                logger.warning(f"⚠️ Could not merge open-ev  {e}")
        # If only open-ev data is available
        elif 'open_ev' in datasets:
            merged_df = datasets['open_ev'].copy()
            logger.info("Using open-ev dataset as base")
        return merged_df if merged_df is not None else pd.DataFrame()
    def preprocess_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Advanced feature preprocessing and engineering"""
        logger.info("🔄 Preprocessing features...")
        df_processed = df.copy()
        # Handle column names variations
        column_mapping = {
            'Range_km': 'range_km',
            'Range_WLTP_km': 'range_wltp_km',
            'Range_EPA_km': 'range_epa_km',
            'Battery_Capacity_kWh': 'battery_capacity_kWh',
            'Battery_Capacity_kWh_OpenEV': 'battery_capacity_open_ev_kWh',
            'Battery_Capacity_Gross_kWh': 'battery_capacity_gross_kWh',
            'Battery_Health_%': 'battery_health_percent',
            'Energy_Consumption_kWh_per_100km': 'energy_consumption_kWh_per_100km',
            'Avg_Speed_kmh': 'avg_speed_kmh',
            'Max_Speed_kmh': 'max_speed_kmh',
            'Top_Speed_kmh': 'top_speed_kmh',
            'Temperature_C': 'temperature_c',
            'Mileage_km': 'mileage_km',
            'Year': 'year',
            'Acceleration_0_100_kmh_sec': 'acceleration_0_100_kmh_sec',
            'Acceleration_0_100_s': 'acceleration_0_100_s',
            'Charging_Power_kW': 'charging_power_kw',
            'DC_Max_Power_kW': 'dc_max_power_kw',
            'System_Power_kW': 'system_power_kw',
            'System_Torque_Nm': 'system_torque_nm',
            'Vehicle_Type': 'vehicle_type',
            'Vehicle_Type_OpenEV': 'vehicle_type_open_ev',
            'Region': 'region',
            'Usage_Type': 'usage_type'
        }
        df_processed.rename(columns=column_mapping, inplace=True)
        # Feature Engineering
        logger.info("🔧 Engineering new features...")
        # Battery efficiency score
        if 'battery_capacity_kWh' in df_processed.columns and 'energy_consumption_kWh_per_100km' in df_processed.columns:
            df_processed['battery_efficiency_score'] = (
                df_processed['battery_capacity_kWh'] / df_processed['energy_consumption_kWh_per_100km'] * 100
            )
        # Battery health impact
        if 'battery_health_percent' in df_processed.columns and 'battery_capacity_kWh' in df_processed.columns:
            df_processed['effective_battery_capacity'] = (
                df_processed['battery_capacity_kWh'] * (df_processed['battery_health_percent'] / 100)
            )
        # Age of vehicle
        if 'year' in df_processed.columns:
            df_processed['vehicle_age'] = datetime.now().year - df_processed['year']
        # Speed efficiency factor
        if 'avg_speed_kmh' in df_processed.columns and 'energy_consumption_kWh_per_100km' in df_processed.columns:
            df_processed['speed_efficiency_factor'] = (
                df_processed['avg_speed_kmh'] / df_processed['energy_consumption_kWh_per_100km']
            )
        # Power-to-weight ratio (if system power available)
        if 'system_power_kw' in df_processed.columns:
            df_processed['has_system_power'] = 1
        else:
            df_processed['has_system_power'] = 0
        # Range consistency check (compare analytics range with WLTP/EPA)
        if 'range_km' in df_processed.columns and 'range_wltp_km' in df_processed.columns:
            df_processed['range_consistency_ratio'] = (
                df_processed['range_km'] / df_processed['range_wltp_km'].replace(0, 1)
            )
        # Handle missing values with intelligent imputation
        numeric_cols = df_processed.select_dtypes(include=[np.number]).columns
        for col in numeric_cols:
            if df_processed[col].isna().sum() > 0:
                # Use median for skewed distributions, mean otherwise
                if df_processed[col].skew() > 1:
                    df_processed[col].fillna(df_processed[col].median(), inplace=True)
                else:
                    df_processed[col].fillna(df_processed[col].mean(), inplace=True)
        # Encode categorical variables
        categorical_cols = ['vehicle_type', 'region', 'usage_type', 'vehicle_type_open_ev']
        for col in categorical_cols:
            if col in df_processed.columns:
                df_processed[col] = df_processed[col].fillna('Unknown')
                # One-hot encode
                dummies = pd.get_dummies(df_processed[col], prefix=col)
                df_processed = pd.concat([df_processed, dummies], axis=1)
                df_processed.drop(col, axis=1, inplace=True)
        # Remove extreme outliers using IQR method
        for col in numeric_cols:
            if col not in ['range_km', 'range_wltp_km', 'range_epa_km']:  # Don't remove outliers from target
                Q1 = df_processed[col].quantile(0.25)
                Q3 = df_processed[col].quantile(0.75)
                IQR = Q3 - Q1
                lower_bound = Q1 - 3 * IQR
                upper_bound = Q3 + 3 * IQR
                df_processed = df_processed[
                    (df_processed[col] >= lower_bound) & (df_processed[col] <= upper_bound)
                ]
        logger.info(f"✅ Preprocessing complete. Final shape: {df_processed.shape}")
        return df_processed
    def train_advanced_models(self, df: pd.DataFrame):
        """Train multiple advanced ML models with hyperparameter tuning"""
        logger.info("🔄 Training advanced ML models...")
        # Prepare data for range prediction
        if 'range_km' not in df.columns:
            logger.error("❌ Target variable 'range_km' not found")
            return
        # Select features that are actually present
        available_features = [f for f in RANGE_FEATURES_ML if f in df.columns]
        # Add engineered features
        engineered_features = [
            'battery_efficiency_score', 'effective_battery_capacity', 
            'vehicle_age', 'speed_efficiency_factor', 'has_system_power',
            'range_consistency_ratio'
        ]
        available_features.extend([f for f in engineered_features if f in df.columns])
        # Add one-hot encoded categorical features
        categorical_features = [col for col in df.columns if col.startswith(('vehicle_type_', 'region_', 'usage_type_'))]
        available_features.extend(categorical_features)
        if len(available_features) == 0:
            logger.error("❌ No features available for training")
            return
        # Prepare training data
        df_train = df[df['range_km'].notna() & (df['range_km'] > 0)].copy()
        if len(df_train) < 10:
            logger.error("❌ Insufficient training data")
            return
        X = df_train[available_features]
        y = df_train['range_km']
        # Train-test split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        logger.info(f"Training on {len(X_train)} samples, testing on {len(X_test)} samples")
        # Define models to train
        models_config = {
            'xgboost': XGBRegressor(
                n_estimators=200,
                learning_rate=0.05,
                max_depth=6,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                n_jobs=-1
            ),
            'lightgbm': lgb.LGBMRegressor(
                n_estimators=200,
                learning_rate=0.05,
                max_depth=8,
                num_leaves=64,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                n_jobs=-1
            ),
            'gradient_boosting': GradientBoostingRegressor(
                n_estimators=150,
                learning_rate=0.05,
                max_depth=5,
                subsample=0.8,
                random_state=42
            ),
            'random_forest': RandomForestRegressor(
                n_estimators=200,
                max_depth=10,
                min_samples_split=5,
                min_samples_leaf=2,
                random_state=42,
                n_jobs=-1
            )
        }
        # Train each model
        for name, model in models_config.items():
            try:
                logger.info(f"Training {name} model...")
                # Create pipeline with preprocessing
                numeric_features = X_train.select_dtypes(include=[np.number]).columns.tolist()
                preprocessor = ColumnTransformer(
                    transformers=[
                        ('num', Pipeline(steps=[
                            ('imputer', SimpleImputer(strategy='median')),
                            ('scaler', StandardScaler())
                        ]), numeric_features)
                    ])
                pipeline = Pipeline(steps=[
                    ('preprocessor', preprocessor),
                    ('regressor', model)
                ])
                # Train
                pipeline.fit(X_train, y_train)
                # Evaluate
                y_pred = pipeline.predict(X_test)
                mae = mean_absolute_error(y_test, y_pred)
                rmse = np.sqrt(mean_squared_error(y_test, y_pred))
                r2 = r2_score(y_test, y_pred)
                self.models[name] = pipeline
                self.performance_metrics[name] = {
                    'mae': mae,
                    'rmse': rmse,
                    'r2': r2,
                    'training_samples': len(X_train),
                    'features_used': len(available_features)
                }
                logger.info(f"✅ {name} trained - R²: {r2:.4f}, MAE: {mae:.2f} km, RMSE: {rmse:.2f} km")
                # Feature importance
                if hasattr(model, 'feature_importances_'):
                    feature_importance = pd.DataFrame({
                        'feature': available_features,
                        'importance': model.feature_importances_
                    }).sort_values('importance', ascending=False)
                    self.feature_sets[f'{name}_importance'] = feature_importance.to_dict('records')
            except Exception as e:
                logger.error(f"❌ Error training {name}: {e}")
        # Create ensemble model (Voting Regressor)
        try:
            logger.info("Creating ensemble model...")
            # Use best performing models
            best_models = sorted(
                self.performance_metrics.items(),
                key=lambda x: x[1]['r2'],
                reverse=True
            )[:3]
            ensemble_estimators = [
                (name, self.models[name].named_steps['regressor'])
                for name, _ in best_models
            ]
            ensemble = VotingRegressor(estimators=ensemble_estimators, weights=[1/len(ensemble_estimators)]*len(ensemble_estimators))
            # Retrain ensemble on full pipeline
            ensemble_pipeline = Pipeline(steps=[
                ('preprocessor', preprocessor),
                ('regressor', ensemble)
            ])
            ensemble_pipeline.fit(X_train, y_train)
            y_pred_ensemble = ensemble_pipeline.predict(X_test)
            mae_ens = mean_absolute_error(y_test, y_pred_ensemble)
            rmse_ens = np.sqrt(mean_squared_error(y_test, y_pred_ensemble))
            r2_ens = r2_score(y_test, y_pred_ensemble)
            self.models['ensemble'] = ensemble_pipeline
            self.performance_metrics['ensemble'] = {
                'mae': mae_ens,
                'rmse': rmse_ens,
                'r2': r2_ens,
                'base_models': [name for name, _ in best_models],
                'training_samples': len(X_train)
            }
            logger.info(f"✅ Ensemble trained - R²: {r2_ens:.4f}, MAE: {mae_ens:.2f} km")
        except Exception as e:
            logger.error(f"❌ Error creating ensemble: {e}")
        # Save best model
        best_model_name = max(self.performance_metrics.items(), key=lambda x: x[1]['r2'])[0]
        self.models['best'] = self.models[best_model_name]
        logger.info(f"🏆 Best model: {best_model_name} with R²: {self.performance_metrics[best_model_name]['r2']:.4f}")
        # Save models to disk
        self.save_models()
    def save_models(self):
        """Save trained models to disk"""
        try:
            for name, model in self.models.items():
                model_path = os.path.join(MODELS_DIR, f'{name}_model.pkl')
                joblib.dump(model, model_path)
                logger.info(f"💾 Saved {name} model to {model_path}")
            # Save metadata
            metadata_path = os.path.join(MODELS_DIR, 'model_metadata.pkl')
            joblib.dump({
                'performance_metrics': self.performance_metrics,
                'feature_sets': self.feature_sets,
                'training_date': datetime.now().isoformat()
            }, metadata_path)
            logger.info(f"💾 Saved model metadata")
        except Exception as e:
            logger.error(f"❌ Error saving models: {e}")
    def load_models(self):
        """Load pre-trained models from disk"""
        try:
            for model_file in os.listdir(MODELS_DIR):
                if model_file.endswith('_model.pkl'):
                    name = model_file.replace('_model.pkl', '')
                    model_path = os.path.join(MODELS_DIR, model_file)
                    self.models[name] = joblib.load(model_path)
                    logger.info(f"✅ Loaded {name} model")
            metadata_path = os.path.join(MODELS_DIR, 'model_metadata.pkl')
            if os.path.exists(metadata_path):
                metadata = joblib.load(metadata_path)
                self.performance_metrics = metadata['performance_metrics']
                self.feature_sets = metadata['feature_sets']
                logger.info(f"✅ Loaded model metadata")
            return len(self.models) > 0
        except Exception as e:
            logger.error(f"❌ Error loading models: {e}")
            return False
    def predict_range(self, input_data: Dict, model_type: str = 'best') -> Dict:
        """Predict EV range using specified model"""
        try:
            if len(self.models) == 0:
                raise ValueError("No trained models available")
            if model_type not in self.models:
                if 'best' in self.models:
                    model_type = 'best'
                elif len(self.performance_metrics) > 0:
                    best_available = max(
                        self.performance_metrics.items(),
                        key=lambda x: x[1].get('r2', float('-inf'))
                    )[0]
                    model_type = best_available if best_available in self.models else list(self.models.keys())[0]
                else:
                    model_type = list(self.models.keys())[0]
            model = self.models[model_type]
            # Create input dataframe
            input_df = pd.DataFrame([input_data])
            # Ensure all required features are present with defaults
            required_features = [
                'battery_capacity_kWh', 'battery_health_percent', 'energy_consumption_kWh_per_100km',
                'avg_speed_kmh', 'temperature_c', 'mileage_km', 'year', 'max_speed_kmh',
                'acceleration_0_100_kmh_sec', 'charging_power_kw'
            ]
            for feat in required_features:
                if feat not in input_df.columns:
                    if feat == 'year':
                        input_df[feat] = datetime.now().year
                    elif feat == 'battery_health_percent':
                        input_df[feat] = 100.0
                    else:
                        input_df[feat] = 0.0
            # Add engineered features
            if 'battery_capacity_kWh' in input_df.columns and 'energy_consumption_kWh_per_100km' in input_df.columns:
                input_df['battery_efficiency_score'] = (
                    input_df['battery_capacity_kWh'] / input_df['energy_consumption_kWh_per_100km'] * 100
                )
            if 'battery_health_percent' in input_df.columns and 'battery_capacity_kWh' in input_df.columns:
                input_df['effective_battery_capacity'] = (
                    input_df['battery_capacity_kWh'] * (input_df['battery_health_percent'] / 100)
                )
            if 'year' in input_df.columns:
                input_df['vehicle_age'] = datetime.now().year - input_df['year']
            if 'avg_speed_kmh' in input_df.columns and 'energy_consumption_kWh_per_100km' in input_df.columns:
                input_df['speed_efficiency_factor'] = (
                    input_df['avg_speed_kmh'] / input_df['energy_consumption_kWh_per_100km']
                )
            # Predict
            prediction = model.predict(input_df)[0]
            # Get prediction interval (approximate)
            if hasattr(model.named_steps['regressor'], 'feature_importances_'):
                uncertainty = prediction * 0.05  # 5% uncertainty estimate
            else:
                uncertainty = prediction * 0.08  # 8% for ensemble
            # Confidence score from spread across model predictions (when available)
            confidence_score = None
            ensemble_candidates = []
            for name, candidate in self.models.items():
                if name in ('best',):
                    continue
                try:
                    pred_val = float(candidate.predict(input_df)[0])
                    if np.isfinite(pred_val):
                        ensemble_candidates.append(pred_val)
                except Exception:
                    continue
            if len(ensemble_candidates) >= 2:
                mean_pred = float(np.mean(ensemble_candidates))
                std_pred = float(np.std(ensemble_candidates))
                if mean_pred > 0:
                    confidence_score = max(0.0, min(1.0, 1 - (std_pred / mean_pred)))
            if confidence_score is None:
                if prediction > 0:
                    confidence_score = max(0.0, min(1.0, 1 - (uncertainty / prediction)))
                else:
                    confidence_score = 0.5
            return {
                'predicted_range_km': float(prediction),
                'uncertainty_km': float(uncertainty),
                'confidence_interval': [
                    float(prediction - uncertainty),
                    float(prediction + uncertainty)
                ],
                'confidence_score': float(confidence_score),
                'model_used': model_type,
                'model_performance': self.performance_metrics.get(model_type, {})
            }
        except Exception as e:
            logger.error(f"❌ Error in prediction: {e}")
            raise
    def predict_with_conditions(self, input_data: Dict, conditions: Dict) -> Dict:
        """Predict range with environmental and driving conditions"""
        try:
            # Base prediction
            base_pred = self.predict_range(input_data, 'best')
            base_range = base_pred['predicted_range_km']
            # Apply condition adjustments
            adjustment_factors = {}
            # Temperature adjustment
            if 'temperature_c' in conditions:
                temp = conditions['temperature_c']
                if temp < 0:
                    temp_factor = 0.85 + (temp / -20) * 0.1  # Colder = worse
                elif temp > 35:
                    temp_factor = 0.95 - ((temp - 35) / 20) * 0.1  # Hotter = worse
                else:
                    temp_factor = 1.0
                adjustment_factors['temperature'] = temp_factor
            # Speed adjustment
            if 'avg_speed_kmh' in conditions:
                speed = conditions['avg_speed_kmh']
                if speed > 120:
                    speed_factor = 0.85
                elif speed > 90:
                    speed_factor = 0.92
                elif speed < 30:
                    speed_factor = 0.90  # Stop-and-go traffic
                else:
                    speed_factor = 1.0
                adjustment_factors['speed'] = speed_factor
            # Terrain adjustment
            if 'terrain_type' in conditions:
                terrain_map = {'flat': 1.0, 'hilly': 0.92, 'mountainous': 0.85}
                adjustment_factors['terrain'] = terrain_map.get(conditions['terrain_type'], 1.0)
            # AC/Heating adjustment
            if 'climate_control' in conditions:
                adjustment_factors['climate'] = 0.93 if conditions['climate_control'] else 1.0
            # Calculate total adjustment
            total_factor = np.prod(list(adjustment_factors.values()))
            adjusted_range = base_range * total_factor
            return {
                'base_range_km': float(base_range),
                'adjusted_range_km': float(adjusted_range),
                'adjustment_factors': adjustment_factors,
                'total_adjustment_factor': float(total_factor),
                **base_pred
            }
        except Exception as e:
            logger.error(f"❌ Error in conditional prediction: {e}")
            raise
# Initialize predictor
predictor = EVRangePredictor()
# Compatibility datasets for analytics endpoints
compat_specs_df = None
compat_analytics_df = None
compat_open_ev_df = None

def _first_existing_data_path(filenames: List[str]) -> Optional[str]:
    """Return first existing dataset path from candidate filenames."""
    for filename in filenames:
        candidate = os.path.join(DATA_DIR, filename)
        if os.path.exists(candidate):
            return candidate
    return None

def _normalize_open_ev_specs(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize Open EV style datasets to legacy Make/Model compatibility schema."""
    if df is None or df.empty:
        return pd.DataFrame()

    data = df.copy()
    data.columns = data.columns.str.strip()

    make_col = 'make_name' if 'make_name' in data.columns else None
    model_col = 'model_name' if 'model_name' in data.columns else None
    year_col = 'year' if 'year' in data.columns else None
    top_speed_col = 'top_speed_kmh' if 'top_speed_kmh' in data.columns else None
    charging_col = 'dc_max_power_kw' if 'dc_max_power_kw' in data.columns else None

    range_col = None
    if 'range_wltp_km' in data.columns:
        range_col = 'range_wltp_km'
    elif 'range_epa_km' in data.columns:
        range_col = 'range_epa_km'

    battery_col = None
    if 'battery_capacity_net_kwh' in data.columns:
        battery_col = 'battery_capacity_net_kwh'
    elif 'battery_capacity_gross_kwh' in data.columns:
        battery_col = 'battery_capacity_gross_kwh'

    if not make_col or not model_col:
        return pd.DataFrame()

    normalized = pd.DataFrame({
        'Make': data[make_col].astype(str).str.strip(),
        'Model': data[model_col].astype(str).str.strip(),
    })
    normalized['Year'] = pd.to_numeric(data[year_col], errors='coerce') if year_col else np.nan
    normalized['Range_km'] = pd.to_numeric(data[range_col], errors='coerce') if range_col else np.nan
    normalized['Battery_Capacity_kWh'] = (
        pd.to_numeric(data[battery_col], errors='coerce') if battery_col else np.nan
    )
    normalized['Charging_Power_kW'] = (
        pd.to_numeric(data[charging_col], errors='coerce') if charging_col else np.nan
    )
    normalized['Max_Speed_kmh'] = (
        pd.to_numeric(data[top_speed_col], errors='coerce') if top_speed_col else np.nan
    )

    # Derive consumption where possible to preserve efficiency endpoints.
    normalized['Energy_Consumption_kWh_per_100km'] = np.nan
    valid_consumption = (
        normalized['Battery_Capacity_kWh'].notna() &
        normalized['Range_km'].notna() &
        (normalized['Range_km'] > 0)
    )
    normalized.loc[valid_consumption, 'Energy_Consumption_kWh_per_100km'] = (
        normalized.loc[valid_consumption, 'Battery_Capacity_kWh'] /
        normalized.loc[valid_consumption, 'Range_km'] * 100
    )

    normalized = normalized[
        (normalized['Make'].str.len() > 0) &
        (normalized['Model'].str.len() > 0)
    ].copy()
    return normalized

def load_compatibility_datasets():
    """Load datasets used by legacy analytics endpoints."""
    global compat_specs_df, compat_analytics_df, compat_open_ev_df
    try:
        analytics_path = os.path.join(DATA_DIR, 'electric_vehicle_analytics.csv')
        open_ev_path = _first_existing_data_path([
            'open-ev-data-v1.24.0.csv',
            'electric_vehicles_spec_2025.csv.csv',
            'electric_vehicles_spec_2025.csv',
        ])

        compat_analytics_df = None
        compat_open_ev_df = None
        compat_specs_df = None

        if os.path.exists(analytics_path):
            compat_analytics_df = pd.read_csv(analytics_path)
            compat_analytics_df.columns = compat_analytics_df.columns.str.strip()

        if open_ev_path:
            raw_open_ev_df = pd.read_csv(open_ev_path)
            raw_open_ev_df.columns = raw_open_ev_df.columns.str.strip()
            compat_open_ev_df = _normalize_open_ev_specs(raw_open_ev_df)

        specs_frames = []
        if isinstance(compat_analytics_df, pd.DataFrame) and not compat_analytics_df.empty:
            specs_frames.append(compat_analytics_df.copy())
        if isinstance(compat_open_ev_df, pd.DataFrame) and not compat_open_ev_df.empty:
            specs_frames.append(compat_open_ev_df.copy())

        if specs_frames:
            compat_specs_df = pd.concat(specs_frames, ignore_index=True, sort=False)
            if 'Make' in compat_specs_df.columns and 'Model' in compat_specs_df.columns:
                compat_specs_df = compat_specs_df[
                    compat_specs_df['Make'].notna() &
                    compat_specs_df['Model'].notna()
                ]
                compat_specs_df['Make'] = compat_specs_df['Make'].astype(str).str.strip()
                compat_specs_df['Model'] = compat_specs_df['Model'].astype(str).str.strip()

        analytics_shape = compat_analytics_df.shape if isinstance(compat_analytics_df, pd.DataFrame) else None
        open_ev_shape = compat_open_ev_df.shape if isinstance(compat_open_ev_df, pd.DataFrame) else None
        specs_shape = compat_specs_df.shape if isinstance(compat_specs_df, pd.DataFrame) else None

        logger.info(
            f"Compatibility datasets loaded: analytics={analytics_shape}, open-ev={open_ev_shape}, merged-specs={specs_shape}"
        )
    except Exception as exc:
        logger.warning(f"Could not load compatibility datasets: {exc}")
def initialize_system():
    """Initialize the prediction system"""
    logger.info("🚀 Initializing EV Range Prediction System...")
    # Try to load pre-trained models first
    if predictor.load_models():
        logger.info("✅ Loaded pre-trained models")
    else:
        logger.info("🔄 No pre-trained models found, training new models...")
        try:
            df = predictor.load_and_preprocess_data()
            if not df.empty:
                predictor.train_advanced_models(df)
                logger.info("✅ System initialization complete!")
            else:
                logger.error("❌ No data available for training")
        except Exception as e:
            logger.error(f"❌ Error during initialization: {e}")
# Initialize on startup
initialize_system()
load_compatibility_datasets()
# Flask Routes
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'models_loaded': list(predictor.models.keys()),
        'model_performance': predictor.performance_metrics
    })
@app.route('/predict-range', methods=['POST'])
def predict_range_endpoint():
    """Main range prediction endpoint"""
    try:
        data = request.json or {}
        model_type = data.get('model_type', 'best')
        try:
            result = predictor.predict_range(data, model_type)
        except Exception as prediction_error:
            if 'No trained models available' not in str(prediction_error):
                raise
            # Compatibility fallback when models are unavailable
            battery_capacity = float(data.get('Battery_Capacity_kWh', data.get('battery_capacity_kWh', 0)))
            efficiency = float(data.get('Energy_Consumption_kWh_per_100km', data.get('energy_consumption_kWh_per_100km', 0)))
            if battery_capacity <= 0 or efficiency <= 0:
                raise
            predicted = (battery_capacity / efficiency) * 100
            result = {
                'predicted_range_km': float(predicted),
                'uncertainty_km': float(predicted * 0.12),
                'confidence_interval': [
                    float(predicted * 0.88),
                    float(predicted * 1.12)
                ],
                'confidence_score': 0.5,
                'model_used': 'formula_fallback',
                'model_performance': {}
            }
        return jsonify({
            'success': True,
            'predicted_range_km': round(float(result.get('predicted_range_km', 0)), 1),
            'prediction': result
        })
    except Exception as e:
        logger.error(f"Error in /predict-range: {e}")
        return jsonify({'error': str(e)}), 500
@app.route('/predict-with-conditions', methods=['POST'])
def predict_with_conditions_endpoint():
    """Predict range with environmental conditions"""
    try:
        data = request.json
        vehicle_data = data.get('vehicle', {})
        conditions = data.get('conditions', {})
        result = predictor.predict_with_conditions(vehicle_data, conditions)
        return jsonify({
            'success': True,
            'prediction': result
        })
    except Exception as e:
        logger.error(f"Error in /predict-with-conditions: {e}")
        return jsonify({'error': str(e)}), 500
@app.route('/model-info', methods=['GET'])
def get_model_info():
    """Get information about trained models"""
    return jsonify({
        'success': True,
        'models_available': list(predictor.models.keys()),
        'performance_metrics': predictor.performance_metrics,
        'feature_importance': predictor.feature_sets
    })
@app.route('/feature-importance', methods=['GET'])
def get_feature_importance():
    """Get feature importance rankings"""
    try:
        importance_data = {}
        for key, value in predictor.feature_sets.items():
            if 'importance' in key:
                importance_data[key] = value
        return jsonify({
            'success': True,
            'feature_importance': importance_data
        })
    except Exception as e:
        logger.error(f"Error in /feature-importance: {e}")
        return jsonify({'error': str(e)}), 500
@app.route('/compare-models', methods=['GET'])
def compare_models():
    """Compare performance of different models"""
    try:
        comparison = {}
        for model_name, metrics in predictor.performance_metrics.items():
            comparison[model_name] = {
                'r_squared': metrics.get('r2', 0),
                'mae_km': metrics.get('mae', 0),
                'rmse_km': metrics.get('rmse', 0),
                'training_samples': metrics.get('training_samples', 0)
            }
        # Sort by R² score
        comparison_sorted = dict(
            sorted(comparison.items(), key=lambda x: x[1]['r_squared'], reverse=True)
        )
        return jsonify({
            'success': True,
            'model_comparison': comparison_sorted,
            'best_model': max(comparison.items(), key=lambda x: x[1]['r_squared'])[0]
        })
    except Exception as e:
        logger.error(f"Error in /compare-models: {e}")
        return jsonify({'error': str(e)}), 500
@app.route('/batch-predict', methods=['POST'])
def batch_predict():
    """Batch prediction for multiple vehicles"""
    try:
        data = request.json
        vehicles = data.get('vehicles', [])
        model_type = data.get('model_type', 'best')
        results = []
        for vehicle in vehicles:
            try:
                pred = predictor.predict_range(vehicle, model_type)
                results.append({
                    'vehicle': vehicle,
                    'prediction': pred
                })
            except Exception as e:
                results.append({
                    'vehicle': vehicle,
                    'error': str(e)
                })
        return jsonify({
            'success': True,
            'predictions': results,
            'total': len(results)
        })
    except Exception as e:
        logger.error(f"Error in /batch-predict: {e}")
        return jsonify({'error': str(e)}), 500
@app.route('/retrain', methods=['POST'])
def retrain_models():
    """Retrain models with latest data"""
    try:
        logger.info("🔄 Retraining models...")
        df = predictor.load_and_preprocess_data()
        if df.empty:
            return jsonify({'error': 'No data available for training'}), 400
        predictor.train_advanced_models(df)
        return jsonify({
            'success': True,
            'message': 'Models retrained successfully',
            'performance': predictor.performance_metrics
        })
    except Exception as e:
        logger.error(f"Error in /retrain: {e}")
        return jsonify({'error': str(e)}), 500
@app.route('/dataset-stats', methods=['GET'])
def get_dataset_stats():
    """Get statistics about the training dataset"""
    try:
        df = predictor.load_and_preprocess_data()
        if df.empty:
            return jsonify({'error': 'No data available'}), 400
        stats = {
            'total_samples': len(df),
            'features': len(df.columns),
            'missing_values': df.isnull().sum().to_dict(),
            'numeric_columns': df.select_dtypes(include=[np.number]).columns.tolist(),
            'sample_ranges': {
                col: {
                    'min': float(df[col].min()),
                    'max': float(df[col].max()),
                    'mean': float(df[col].mean()),
                    'median': float(df[col].median())
                }
                for col in df.select_dtypes(include=[np.number]).columns[:10]  # First 10 numeric
            }
        }
        return jsonify({
            'success': True,
            'dataset_stats': stats
        })
    except Exception as e:
        logger.error(f"Error in /dataset-stats: {e}")
        return jsonify({'error': str(e)}), 500
@app.route('/predict-real-world-range', methods=['POST'])
def predict_real_world_range():
    """Compatibility endpoint for real-world range prediction."""
    try:
        data = request.json or {}
        battery_capacity = float(data.get('Battery_Capacity_kWh', data.get('battery_capacity_kWh', 0)))
        battery_health = float(data.get('Battery_Health_Percent', data.get('Battery_Health_%', 100)))
        consumption = float(data.get('Energy_Consumption_kWh_per_100km', data.get('energy_consumption_kWh_per_100km', 0)))
        avg_speed = float(data.get('Avg_Speed_kmh', data.get('avg_speed_kmh', 50)))
        temperature = float(data.get('Temperature_C', data.get('temperature_c', 25)))
        mileage = float(data.get('Mileage_km', data.get('mileage_km', 0)))
        if battery_capacity <= 0 or consumption <= 0:
            return jsonify({'error': 'Battery capacity and consumption must be positive'}), 400
        base_range = (battery_capacity / consumption) * 100
        health_factor = max(0.6, min(1.05, battery_health / 100))
        speed_factor = 1.0
        if avg_speed > 100:
            speed_factor = 0.88
        elif avg_speed > 80:
            speed_factor = 0.94
        elif avg_speed < 25:
            speed_factor = 0.92
        temp_factor = 1.0 - min(0.15, max(0, abs(25 - temperature) * 0.004))
        mileage_factor = max(0.85, 1.0 - (mileage / 250000) * 0.1)
        prediction = base_range * health_factor * speed_factor * temp_factor * mileage_factor
        return jsonify({
            'success': True,
            'predicted_range_km': round(float(prediction), 1),
            'input': data
        })
    except Exception as e:
        logger.error(f"Error in /predict-real-world-range: {e}")
        return jsonify({'error': str(e)}), 500
@app.route('/efficiency-rankings', methods=['GET'])
def efficiency_rankings():
    """Compatibility endpoint for efficiency rankings."""
    try:
        if compat_specs_df is None:
            return jsonify({'error': 'Specs dataset not loaded'}), 500
        df = compat_specs_df.copy()
        # Use energy consumption as efficiency metric
        if 'Energy_Consumption_kWh_per_100km' in df.columns:
            eff_col = 'Energy_Consumption_kWh_per_100km'
        elif 'energy_consumption_kWh_per_100km' in df.columns:
            eff_col = 'energy_consumption_kWh_per_100km'
        else:
            return jsonify({'success': True, 'rankings': []})
        df = df[df[eff_col].notna() & (df[eff_col] > 0)]
        if df.empty:
            return jsonify({'success': True, 'rankings': []})
        min_eff = df[eff_col].min()
        max_eff = df[eff_col].max()
        if max_eff == min_eff:
            df['efficiency_score'] = 100.0
        else:
            df['efficiency_score'] = 100 - (
                (df[eff_col] - min_eff) / (max_eff - min_eff) * 100
            )
        df['efficiency_score'] = df['efficiency_score'].clip(0, 100)
        df = df.sort_values('efficiency_score', ascending=False).head(15)
        df['rank'] = range(1, len(df) + 1)
        return_cols = ['rank', 'Make', 'Model', eff_col, 'efficiency_score']
        available_cols = [col for col in return_cols if col in df.columns]
        return jsonify({
            'success': True,
            'rankings': df[available_cols].to_dict('records')
        })
    except Exception as e:
        logger.error(f"Error in /efficiency-rankings: {e}")
        return jsonify({'error': str(e)}), 500
@app.route('/compare-vehicles', methods=['POST'])
def compare_vehicles():
    """Compatibility endpoint for vehicle comparison."""
    try:
        if compat_specs_df is None:
            return jsonify({'error': 'Specs dataset not loaded'}), 500
        data = request.json or {}
        names = [str(item).lower() for item in data.get('vehicleNames', []) if str(item).strip()]
        if not names:
            return jsonify({'success': True, 'comparison': []})
        matches = []
        for _, row in compat_specs_df.iterrows():
            model_name = str(row.get('Model', '')).lower()
            make_name = str(row.get('Make', '')).lower()
            if any(token in model_name for token in names) or any(token in make_name for token in names):
                range_val = float(row.get('Range_km', 0) or 0)
                eff_val = float(row.get('Energy_Consumption_kWh_per_100km', 0) or 0)
                charging_val = float(row.get('Charging_Power_kW', 0) or 0)
                matches.append({
                    'brand': row.get('Make', ''),
                    'model': row.get('Model', ''),
                    'range_km': range_val,
                    'efficiency_wh_per_km': eff_val * 10 if eff_val > 0 else 0,
                    'fast_charging_power_kw_dc': charging_val,
                })
        if not matches:
            suggestions = compat_specs_df['Model'].dropna().astype(str).head(5).tolist()
            return jsonify({'success': False, 'message': 'No vehicles found', 'suggestions': suggestions})
        result_df = pd.DataFrame(matches)
        result_df['range_score'] = (
            result_df['range_km'] / max(1.0, result_df['range_km'].max()) * 100
        )
        eff_min = result_df['efficiency_wh_per_km'].min()
        eff_max = result_df['efficiency_wh_per_km'].max()
        if eff_max == eff_min:
            result_df['efficiency_score'] = 100.0
        else:
            result_df['efficiency_score'] = (
                1 - (result_df['efficiency_wh_per_km'] - eff_min) / (eff_max - eff_min)
            ) * 100
        result_df['charging_score'] = (
            result_df['fast_charging_power_kw_dc'] /
            max(1.0, result_df['fast_charging_power_kw_dc'].max()) * 100
        )
        return jsonify({'success': True, 'comparison': result_df.to_dict('records')})
    except Exception as e:
        logger.error(f"Error in /compare-vehicles: {e}")
        return jsonify({'error': str(e)}), 500
@app.route('/search-vehicles', methods=['GET'])
def search_vehicles():
    """Compatibility endpoint for searching EV specs."""
    try:
        if compat_specs_df is None:
            return jsonify({'error': 'Specs dataset not loaded'}), 500
        df = compat_specs_df.copy()
        brand = request.args.get('brand', '').strip().lower()
        model = request.args.get('model', '').strip().lower()
        min_range = request.args.get('minRange', type=float)
        max_range = request.args.get('maxRange', type=float)
        if brand:
            df = df[df['Make'].astype(str).str.lower().str.contains(brand, na=False)]
        if model:
            df = df[df['Model'].astype(str).str.lower().str.contains(model, na=False)]
        if min_range is not None:
            df = df[df['Range_km'] >= min_range]
        if max_range is not None:
            df = df[df['Range_km'] <= max_range]
        cols = [
            'Make',
            'Model',
            'Range_km',
            'Energy_Consumption_kWh_per_100km',
            'Battery_Capacity_kWh',
            'Charging_Power_kW',
            'Max_Speed_kmh',
            'Year'
        ]
        existing_cols = [col for col in cols if col in df.columns]
        return jsonify({
            'success': True,
            'vehicles': df[existing_cols].head(20).to_dict('records'),
            'total': int(len(df)),
        })
    except Exception as e:
        logger.error(f"Error in /search-vehicles: {e}")
        return jsonify({'error': str(e)}), 500
@app.route('/predict-traffic-range', methods=['POST'])
def predict_traffic_range():
    """Traffic-aware hybrid range model endpoint for planner."""
    try:
        data = request.json or {}
        # Support both naming conventions
        battery_capacity = float(data.get('battery_capacity_kWh', data.get('Battery_Capacity_kWh', 0)))
        efficiency = float(data.get('efficiency_wh_per_km', data.get('Energy_Consumption_kWh_per_100km', 0)))
        if efficiency > 0:
            efficiency = efficiency * 10  # Convert kWh/100km to Wh/km if needed
        battery_percent = float(data.get('battery_percent', data.get('Battery_Health_%', 100)))
        avg_speed = float(data.get('avg_speed', data.get('Avg_Speed_kmh', 50)))
        congestion_factor = float(data.get('congestion_factor', 1.0))
        trip_distance_km = float(data.get('trip_distance_km', 0))
        if battery_capacity <= 0 or efficiency <= 0 or trip_distance_km <= 0:
            return jsonify({'error': 'battery_capacity_kWh, efficiency_wh_per_km and trip_distance_km must be positive'}), 400
        battery_percent = max(0.0, min(100.0, battery_percent))
        congestion_factor = max(0.0, min(3.0, congestion_factor))
        avg_speed = max(1.0, min(180.0, avg_speed))
        available_energy_wh = battery_capacity * 1000 * (battery_percent / 100.0)
        # Hybrid ML + physics adjustment
        speed_reference = 60.0
        speed_factor = 0.75 + 0.25 * ((avg_speed / speed_reference) ** 2)
        traffic_factor = 1.0 + (congestion_factor * 0.35)
        adjusted_consumption_wh_per_km = efficiency * speed_factor * traffic_factor
        adjusted_range = available_energy_wh / max(1.0, adjusted_consumption_wh_per_km)
        base_range = available_energy_wh / max(1.0, efficiency)
        can_reach = adjusted_range >= trip_distance_km
        consumed_percent = min(
            battery_percent,
            (trip_distance_km * adjusted_consumption_wh_per_km) /
            max(1.0, battery_capacity * 1000) * 100
        )
        battery_left = max(0.0, battery_percent - consumed_percent)
        speed_penalty = max(0.0, min(0.35, speed_factor - 1))
        traffic_penalty = max(0.0, min(0.35, traffic_factor - 1))
        return jsonify({
            'success': True,
            'base_range_km': round(float(base_range), 1),
            'traffic_adjusted_range_km': round(float(adjusted_range), 1),
            'speed_penalty_%': round(float(speed_penalty * 100), 2),
            'traffic_penalty_%': round(float(traffic_penalty * 100), 2),
            'can_reach_destination': bool(can_reach),
            'estimated_battery_left_%': round(float(battery_left), 1),
            'consumption_wh_per_km': round(float(adjusted_consumption_wh_per_km), 2),
        })
    except Exception as e:
        logger.error(f"Error in /predict-traffic-range: {e}")
        return jsonify({'error': str(e)}), 500
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

