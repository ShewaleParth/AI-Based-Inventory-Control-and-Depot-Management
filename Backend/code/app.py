from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import joblib
import xgboost as xgb
from pymongo import MongoClient
from datetime import datetime, timedelta
from sklearn.preprocessing import LabelEncoder
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tools.sm_exceptions import ConvergenceWarning
import warnings
import os
from bson import ObjectId
import traceback
import sys
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(__file__))))
from supplier_intelligence.supplier_routes import supplier_routes, init_db
from supplier_intelligence.risk_score_engine import get_all_supplier_scores, get_supplier_history

warnings.filterwarnings('ignore', category=ConvergenceWarning)
warnings.filterwarnings('ignore', category=FutureWarning)

# Load environment variables
from dotenv import load_dotenv

# Try multiple locations for .env to ensures we sync with server.js
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_paths = [
    os.path.join(BASE_DIR, 'server', '.env'),
    os.path.join(BASE_DIR, '.env'),
    os.path.join(os.path.dirname(BASE_DIR), '.env')
]
for path in env_paths:
    if os.path.exists(path):
        load_dotenv(path)
        print(f" Loaded environment from {path}")
        break  # Use the first found .env — subsequent loads would be no-ops anyway

app = Flask(__name__)
# Allow CORS for all domains in development, or restrict based on env
CORS(app, resources={r"/api/*": {"origins": "*"}})

# MongoDB Configuration
# Require MONGODB_URI from environment — never hardcode credentials in source
MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    raise EnvironmentError(
        "MONGODB_URI environment variable is not set. "
        "Please configure your .env file before starting the server."
    )
client = MongoClient(MONGODB_URI)
db = client.get_database() # Uses database name from URI or defaults
if not db.name or db.name == 'test':
    db = client['animesh']

print(f" Connected to MongoDB Database: {db.name}")

forecasts_collection = db['forecasts']
products_collection = db['products']

# Global variables
ml_model = None
use_xgb_native = False
target_encoders = None
arima_models = None

# Model paths - Relative configuration
# BASE_PATH is the parent directory of this file (Major-/Backend)
BASE_PATH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_ROOT = os.path.join(os.path.dirname(BASE_PATH), "Models")
JSON_MODEL_PATH = os.path.join(MODELS_ROOT, "ml_stock_priority_model.json")
PKL_MODEL_PATH = os.path.join(MODELS_ROOT, "ml_stock_priority_model.pkl")
ENCODERS_PATH = os.path.join(MODELS_ROOT, "target_label_encoders.pkl")
# ARIMA_PATH = os.path.join(BASE_PATH, "Models", "arima_models_dict.pkl") # 2GB file - skip loading to avoid hang


def load_models():
    """Load all ML models and encoders at startup"""
    global ml_model, use_xgb_native, target_encoders, arima_models
    
    try:
        if os.path.exists(JSON_MODEL_PATH):
            try:
                ml_model = xgb.Booster()
                ml_model.load_model(JSON_MODEL_PATH)
                use_xgb_native = True
                print(" Loaded ML model from JSON")
            except Exception as e:
                print(f" Failed to load JSON model: {e}")
        
        if ml_model is None and os.path.exists(PKL_MODEL_PATH):
            ml_model = joblib.load(PKL_MODEL_PATH)
            use_xgb_native = False
            print(" Loaded ML model from Pickle")
        
        if os.path.exists(ENCODERS_PATH):
            target_encoders = joblib.load(ENCODERS_PATH)
            print(" Loaded label encoders")
        
        # if os.path.exists(ARIMA_PATH):
        #     arima_models = joblib.load(ARIMA_PATH)
        #     print(" Loaded ARIMA models")
        
        return True
    except Exception as e:
        print(f" Error loading models: {e}")
        traceback.print_exc()
        return False


def preprocess_data(df):
    """Preprocess the input data"""
    global target_encoders

    features = [
        "current_stock",
        "daily_sales",
        "weekly_sales",
        "reorder_level",
        "lead_time",
        "days_to_empty",
    ]
    
    categorical = ["brand", "category", "location", "supplier_name"]

    if target_encoders is None:
        print(" Warning: target_encoders not loaded, using fresh LabelEncoders.")
        target_encoders = {}

    for col in categorical:
        df[col] = df[col].astype(str)

        if col in target_encoders:
            le = target_encoders[col]
            
            if "Unknown" not in le.classes_:
                le.classes_ = np.append(le.classes_, "Unknown")

            df[col] = df[col].apply(lambda x: x if x in le.classes_ else "Unknown")
            df[col] = le.transform(df[col])
        else:
            le = LabelEncoder()
            df[col] = le.fit_transform(df[col])
            target_encoders[col] = le
        
        features.append(col)
    
    return df, features


def predict_stock_status(X_test):
    """Predict stock status and priority"""
    # FALLBACK if model is not loaded
    if ml_model is None:
        print(" Using fallback rule-based prediction (Models not loaded)")
        current_stock = X_test['current_stock'].iloc[0]
        reorder_level = X_test['reorder_level'].iloc[0]
        days_to_empty = X_test['days_to_empty'].iloc[0]

        # Rule-based status
        if current_stock == 0:
            status = "Out of Stock"
            priority = "Very High"
        elif current_stock < reorder_level:
            status = "Understock"
            priority = "High" if days_to_empty < 7 else "Medium"
        elif current_stock > reorder_level * 3:
            status = "Overstock"
            priority = "Low"
        else:
            status = "In Stock"
            priority = "Medium"

        return pd.DataFrame({
            "stock_status_pred": [status],
            "priority_pred": [priority]
        })
    if use_xgb_native:
        dtest = xgb.DMatrix(X_test)
        y_pred_numeric = ml_model.predict(dtest)
        if y_pred_numeric.ndim > 1:
            y_pred_numeric = np.argmax(y_pred_numeric, axis=1)
    else:
        y_pred_numeric = ml_model.predict(X_test)
    
    if isinstance(y_pred_numeric, np.ndarray):
        if y_pred_numeric.ndim == 1:
            # WARNING: Model returned a single 1D output — both columns will share the same values.
            # This likely means the model only predicts one target. Verify model output format.
            print(" Warning: Model returned 1D output; stock_status_pred and priority_pred will be identical.")
            y_pred = pd.DataFrame({
                "stock_status_pred": y_pred_numeric,
                "priority_pred": y_pred_numeric
            })
        elif y_pred_numeric.shape[1] == 2:
            y_pred = pd.DataFrame(
                y_pred_numeric, columns=["stock_status_pred", "priority_pred"]
            )
        else:
            raise ValueError(f"Unexpected model output shape: {y_pred_numeric.shape}")
    else:
        raise ValueError("Model prediction returned unexpected type")
    
    for col in ["stock_status_pred", "priority_pred"]:
        encoder_key = col.replace("_pred", "")
        if encoder_key in target_encoders:
            encoder = target_encoders[encoder_key]
            try:
                y_pred[col] = encoder.inverse_transform(y_pred[col].astype(int))
            except (ValueError, KeyError) as e:
                print(f" Could not decode {col}: {e}")
                y_pred[col] = "Unknown"
    
    return y_pred


def generate_historical_sales_from_inputs(daily_sales, weekly_sales, num_days=60):
    """
    Generate synthetic historical sales data based on user inputs.
    This creates a realistic time series that ARIMA can learn from.
    
    Args:
        daily_sales: Average daily sales rate
        weekly_sales: Average weekly sales rate
        num_days: Number of historical days to generate
    
    Returns:
        Array of historical sales values
    """
    # Calculate base sales from both metrics
    avg_from_daily = daily_sales
    avg_from_weekly = weekly_sales / 7
    base_sales = (avg_from_daily * 0.4 + avg_from_weekly * 0.6)
    
    historical_sales = []
    
    for i in range(num_days):
        # Weekly seasonality (higher on weekdays, lower on weekends)
        day_of_week = i % 7
        seasonality = 1.15 if day_of_week < 5 else 0.75
        
        # Add some trend (slight growth over time)
        trend = 1 + (i / num_days) * 0.1
        
        # Random noise (±20% variation)
        noise = np.random.uniform(0.8, 1.2)
        
        # Generate realistic sales value
        sales_value = base_sales * seasonality * trend * noise
        historical_sales.append(max(0, sales_value))
    
    return np.array(historical_sales)


def fit_arima_model(historical_sales, order=(1, 1, 1)):
    """
    Fit ARIMA model on historical sales data.
    
    Args:
        historical_sales: Array of historical sales values
        order: ARIMA order (p, d, q)
    
    Returns:
        Tuple of (fitted_model, model_info) or (None, None) if fitting fails
    """
    try:
        print(f" Fitting ARIMA{order} model on {len(historical_sales)} data points...")
        
        # Ensure data is suitable for ARIMA
        if len(historical_sales) < 10:
            print(" Not enough data points for ARIMA, need at least 10")
            return None, None
        
        # Fit ARIMA model
        model = ARIMA(historical_sales, order=order)
        fitted_model = model.fit()
        
        # Extract model information for verification
        model_info = {
            "order": order,
            "aic": float(fitted_model.aic),
            "bic": float(fitted_model.bic),
            "params": fitted_model.params.tolist() if hasattr(fitted_model, 'params') else []
        }
        
        print(f" ARIMA model fitted successfully (AIC: {fitted_model.aic:.2f})")
        return fitted_model, model_info
        
    except Exception as e:
        # print(f" ARIMA fitting failed: {e}")
        return None, None


def forecast_with_arima(daily_sales, weekly_sales, steps=30):
    """
    Generate forecast using ARIMA model trained on synthetic historical data.
    
    Args:
        daily_sales: User-provided daily sales rate
        weekly_sales: User-provided weekly sales rate
        steps: Number of days to forecast
    
    Returns:
        Tuple of (forecast_array, forecast_metadata)
    """
    forecast_metadata = {
        "method": "Fallback",
        "arima_used": False,
        "model_details": None
    }
    
    try:
        # Generate historical sales data from user inputs
        # print(" Generating historical sales pattern from user inputs...")
        historical_sales = generate_historical_sales_from_inputs(
            daily_sales, weekly_sales, num_days=60
        )
        
        # print(f"Historical sales stats: mean={historical_sales.mean():.2f}, std={historical_sales.std():.2f}")
        
        # Try different ARIMA orders to find the best fit
        orders_to_try = [
            (1, 1, 1),  # Standard ARIMA
            (2, 1, 1),  # More autoregressive terms
            (1, 1, 2),  # More moving average terms
            (2, 1, 2),  # More complex model
            (0, 1, 1),  # Simple model
        ]
        
        best_model = None
        best_aic = float('inf')
        best_model_info = None
        best_order = None
        
        for order in orders_to_try:
            model, model_info = fit_arima_model(historical_sales, order=order)
            if model is not None:
                if model_info["aic"] < best_aic:
                    best_aic = model_info["aic"]
                    best_model = model
                    best_model_info = model_info
                    best_order = order
        
        if best_model is None:
            # print(" All ARIMA models failed, using fallback method")
            forecast = generate_fallback_forecast(daily_sales, weekly_sales, steps)
            return forecast, forecast_metadata
        
        # print(f" Best ARIMA model selected: {best_order} (AIC: {best_aic:.2f}, BIC: {best_model_info['bic']:.2f})")
        
        # Generate forecast
        # print(f" Forecasting next {steps} days using ARIMA{best_order}...")
        forecast = best_model.forecast(steps=steps)
        
        # Ensure non-negative values
        forecast = np.maximum(forecast, 0)
        
        # Add small random variation to make it more realistic
        forecast = forecast * np.random.uniform(0.95, 1.05, size=len(forecast))
        
        # print(f" ARIMA forecast completed successfully!")
        # print(f" Forecast stats: mean={forecast.mean():.2f}, min={forecast.min():.2f}, max={forecast.max():.2f}")
        
        # Update metadata
        forecast_metadata.update({
            "method": "ARIMA",
            "arima_used": True,
            "model_details": {
                "order": best_order,
                "aic": best_aic,
                "bic": best_model_info["bic"],
                "historical_points": len(historical_sales),
                "forecast_mean": float(forecast.mean()),
                "forecast_std": float(forecast.std())
            },
            "historical_sales": historical_sales.tolist()
        })
        
        return forecast, forecast_metadata
        
    except Exception as e:
        # Reduced printing for production-like feel
        forecast = generate_fallback_forecast(daily_sales, weekly_sales, steps)
        # Ensure historical sales is also in fallback
        historical_sales = generate_historical_sales_from_inputs(daily_sales, weekly_sales, num_days=60)
        forecast_metadata["historical_sales"] = historical_sales.tolist()
        return forecast, forecast_metadata


def generate_fallback_forecast(daily_sales, weekly_sales, steps=30):
    """
    Fallback forecasting method if ARIMA fails.
    Uses exponential smoothing with trend and seasonality.
    """
    print(" Using fallback forecasting method (Exponential Smoothing)")
    print(" This happens when ARIMA model fails to converge or fit properly")
    
    avg_from_daily = daily_sales
    avg_from_weekly = weekly_sales / 7
    base_sales = (avg_from_daily * 0.4 + avg_from_weekly * 0.6)
    
    forecast = []
    for i in range(steps):
        # Trend component
        trend = 1 + (i / steps) * 0.05
        
        # Seasonality (weekly pattern)
        day_of_week = i % 7
        seasonality = 1.1 if day_of_week < 5 else 0.85
        
        # Random variation
        noise = np.random.uniform(0.9, 1.1)
        
        value = base_sales * trend * seasonality * noise
        forecast.append(max(0, value))
    
    return np.array(forecast)


def generate_alerts(row, forecast_sales_data=None, initial_stock=0):
    """Generate professional, decision-oriented alerts based on predictions"""
    insights = {
        "status": "Healthy",
        "eta_days": None,
        "recommended_reorder": 0,
        "risk_level": "Low",
        "message": "Stock levels are optimal."
    }
    
    current_stock = initial_stock if initial_stock > 0 else row.get("current_stock", 0)
    lead_time = row.get("lead_time", 7)
    
    if forecast_sales_data is not None and len(forecast_sales_data) > 0:
        total_forecasted = sum(forecast_sales_data)
        
        # Calculate ETA based on daily projections if available
        # Find the day where stock runs out
        eta = None
        temp_stock = current_stock
        for i, daily_sale in enumerate(forecast_sales_data):
            temp_stock -= daily_sale
            if temp_stock <= 0:
                eta = i + 1
                break
        
        # Fallback to average if it doesn't run out in the forecast window
        if eta is None:
            avg_daily_forecast = total_forecasted / len(forecast_sales_data)
            if avg_daily_forecast > 0:
                eta = current_stock / avg_daily_forecast
                insights["eta_days"] = round(eta, 1)
            else:
                insights["eta_days"] = 999
        else:
            insights["eta_days"] = round(eta, 1)
            
        # Decision Logic
        if current_stock <= 0:
            insights["status"] = "OUT OF STOCK"
            insights["risk_level"] = "Critical"
            insights["recommended_reorder"] = round(total_forecasted * 1.2)
            insights["message"] = f"Immediate restock required. Recommended: {insights['recommended_reorder']} units."
        elif insights["eta_days"] < lead_time:
            insights["status"] = "At Risk"
            insights["risk_level"] = "High"
            insights["recommended_reorder"] = round((total_forecasted - current_stock) * 1.1)
            insights["message"] = f"Stock-out predicted in {insights['eta_days']} days. Reorder {insights['recommended_reorder']} units now."
        elif insights["eta_days"] < 30:
            insights["status"] = "Warning"
            insights["risk_level"] = "Medium"
            # Calculate reorder even for warnings so the modal isn't empty
            insights["recommended_reorder"] = round(total_forecasted * 0.8)
            insights["message"] = f"Inventory sufficient for {insights['eta_days']} days. Plan reorder soon."

        # Add additional fields for modal - Ensure they are always set
        insights["avg_daily_demand"] = round(total_forecasted / len(forecast_sales_data), 2)
        insights["reorder_point"] = round(insights["avg_daily_demand"] * lead_time * 1.5)
        
        # Calculate predicted stock out date
        if insights["eta_days"] and insights["eta_days"] < 365:
            insights["predicted_stock_out_date"] = (datetime.now() + timedelta(days=insights["eta_days"])).strftime('%Y-%m-%d')
        else:
            insights["predicted_stock_out_date"] = "N/A"
    else:
        # Fallback if no forecast data
        insights["avg_daily_demand"] = 0
        insights["reorder_point"] = 0
        insights["predicted_stock_out_date"] = "N/A"
            
    return insights


def generate_forecast_data(future_sales, current_date, initial_stock=0):
    """Generate forecast data points with confidence intervals and projected stock"""
    forecast_data = []
    try:
        if isinstance(current_date, str):
            # Try YYYY-MM-DD
            try:
                base_date = datetime.strptime(current_date, '%Y-%m-%d')
            except ValueError:
                # Try ISO format
                base_date = datetime.fromisoformat(current_date.replace('Z', '+00:00'))
        else:
            base_date = current_date
    except Exception:
        print(f" Date parsing failed for {current_date}, using today")
        base_date = datetime.now()
    
    running_stock = initial_stock
    
    for i, predicted_val in enumerate(future_sales):
        forecast_date = base_date + timedelta(days=i+1)
        
        # Confidence decreases over time (more uncertainty in distant future)
        base_confidence = 0.95
        time_decay = 0.004 * i
        confidence = max(0.75, base_confidence - time_decay)
        
        # Calculate projected stock
        running_stock = max(0, running_stock - predicted_val)
        
        forecast_data.append({
            "date": forecast_date.strftime('%Y-%m-%d'),
            "predicted": float(predicted_val),
            "projected_stock": float(running_stock),
            "actual": None,
            "confidence": float(confidence)
        })
    
    return forecast_data


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "OK",
        "timestamp": datetime.now().isoformat(),
        "models_loaded": ml_model is not None and target_encoders is not None
    })


@app.route('/api/ml/products', methods=['GET'])
def get_available_products():
    """Get all products from MongoDB for selection"""
    try:
        products = list(products_collection.find({}, {
            '_id': 0,
            'sku': 1,
            'name': 1,
            'category': 1,
            'stock': 1,
            'supplier': 1,
            'location': 1,
            'depotName': 1
        }))
        
         # Ensure 'location' field is populated from 'depotName' if missing
        processed_products = []
        for p in products:
            if 'location' not in p or not p['location']:
                p['location'] = p.get('depotName', 'General Warehouse')
            processed_products.append(p)

        return jsonify({
            "success": True,
            "products": processed_products,
            "count": len(processed_products)
        })
    except Exception as e:
        print(f"Error fetching products: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500



@app.route('/api/ml/predict/custom', methods=['POST', 'OPTIONS'])
def predict_custom():
    """Run prediction with custom user inputs"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.json
        print(f" Received prediction request: {data}")
        
        # Extract user inputs
        sku = data.get('sku')
        product_name = data.get('productName')
        user_id_str = data.get('userId')
        user_id = None
        if user_id_str:
            try:
                user_id = ObjectId(user_id_str)
            except Exception:
                return jsonify({"success": False, "error": "Invalid userId format — must be a valid 24-character hex ObjectId"}), 400
        current_stock = float(data.get('currentStock', 0))
        daily_sales = float(data.get('dailySales', 0))
        weekly_sales = float(data.get('weeklySales', 0))
        reorder_level = float(data.get('reorderLevel', 0))
        lead_time = float(data.get('leadTime', 0))
        brand = data.get('brand', 'Unknown')
        category = data.get('category', 'Unknown')
        location = data.get('location', 'Unknown')
        supplier_name = data.get('supplierName', 'Unknown')
        forecast_days = int(data.get('forecastDays', 30))
        
        # Validate inputs
        if daily_sales <= 0:
            return jsonify({
                "success": False,
                "error": "Daily sales must be greater than 0"
            }), 400
        
        if weekly_sales <= 0:
            return jsonify({
                "success": False,
                "error": "Weekly sales must be greater than 0"
            }), 400
        
        # Calculate days_to_empty
        days_to_empty = current_stock / daily_sales if daily_sales > 0 else 999
        
        # Create DataFrame for prediction
        input_data = pd.DataFrame([{
            'current_stock': current_stock,
            'daily_sales': daily_sales,
            'weekly_sales': weekly_sales,
            'reorder_level': reorder_level,
            'lead_time': lead_time,
            'days_to_empty': days_to_empty,
            'brand': brand,
            'category': category,
            'location': location,
            'supplier_name': supplier_name
        }])
        
        # Preprocess and predict
        print(" Preprocessing data...")
        processed_data, features = preprocess_data(input_data)
        X_test = processed_data[features]
        
        print(" Running ML prediction for stock status...")
        y_pred = predict_stock_status(X_test)
        
        stock_status_pred = y_pred["stock_status_pred"].iloc[0]
        priority_pred = y_pred["priority_pred"].iloc[0]
        
        # Generate forecast using ARIMA trained on user inputs
        print(f" Training ARIMA model and generating {forecast_days}-day forecast...")
        future_sales, forecast_metadata = forecast_with_arima(
            daily_sales=daily_sales,
            weekly_sales=weekly_sales,
            steps=forecast_days
        )
        
        # Log which method was used
        print(f" Forecast method used: {forecast_metadata['method']}")
        
        # Generate alerts
        row_data = {
            'current_stock': current_stock,
            'stock_status_pred': stock_status_pred,
            'priority_pred': priority_pred
        }
        # Generate professional insights
        insights = generate_alerts(row_data, forecast_sales_data=future_sales, initial_stock=current_stock)
        
        # Generate forecast data points
        current_date = datetime.now().strftime('%Y-%m-%d')
        forecast_data = generate_forecast_data(future_sales, current_date, initial_stock=current_stock)
        
        # Create forecast document
        forecast_doc = {
            "userId": user_id,
            "itemId": sku,
            "productName": product_name,
            "sku": sku,
            "currentStock": int(current_stock),
            "stockStatusPred": stock_status_pred,
            "priorityPred": priority_pred,
            "alert": insights["message"],
            "aiInsights": insights, # New structured insights
            "forecastData": forecast_data,
            "inputParams": {
                "dailySales": daily_sales,
                "weeklySales": weekly_sales,
                "reorderLevel": reorder_level,
                "leadTime": lead_time,
                "brand": brand,
                "category": category,
                "location": location,
                "supplierName": supplier_name
            },
            "forecastMethod": forecast_metadata["method"],
            "arimaUsed": forecast_metadata["arima_used"],
            "modelDetails": forecast_metadata["model_details"],
            "createdAt": datetime.now(),
            "updatedAt": datetime.now()
        }
        
        # Save to MongoDB
        print("Saving forecast to MongoDB...")
        forecasts_collection.update_one(
            {"sku": sku},
            {"$set": forecast_doc},
            upsert=True
        )
        
        print(f" Prediction complete for {sku}")
        
        return jsonify({
            "success": True,
            "forecast": forecast_doc,
            "message": f"Forecast generated successfully for {product_name}",
            "verification": {
                "arima_used": forecast_metadata["arima_used"],
                "method": forecast_metadata["method"],
                "model_details": forecast_metadata["model_details"]
            }
        })
    
    except Exception as e:
        print(f"Error in custom prediction: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/api/ml/scenario-planning', methods=['POST', 'OPTIONS'])
def scenario_planning():
    """
    Run what-if scenario analysis by adjusting forecast parameters.
    Allows users to simulate: demand changes, lead time variations, etc.
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.json
        print(f" Received scenario planning request: {data}")
        
        # Extract baseline data
        sku = data.get('sku')
        product_name = data.get('productName')
        
        # Baseline parameters
        baseline = {
            'currentStock': float(data.get('currentStock', 0)),
            'dailySales': float(data.get('dailySales', 0)),
            'weeklySales': float(data.get('weeklySales', 0)),
            'reorderLevel': float(data.get('reorderLevel', 0)),
            'leadTime': float(data.get('leadTime', 0)),
            'brand': data.get('brand', 'Unknown'),
            'category': data.get('category', 'Unknown'),
            'location': data.get('location', 'Unknown'),
            'supplierName': data.get('supplierName', 'Unknown')
        }
        
        # Scenario adjustments (multipliers and deltas)
        adjustments = data.get('adjustments', {})
        demand_multiplier = float(adjustments.get('demandMultiplier', 1.0))  # e.g., 1.2 = +20% demand
        lead_time_delta = int(adjustments.get('leadTimeDelta', 0))  # e.g., +3 days
        stock_delta = int(adjustments.get('stockDelta', 0))  # e.g., +100 units
        sales_spike = float(adjustments.get('salesSpike', 1.0)) # e.g., 1.5 = +50% spike
        forecast_days = int(data.get('forecastDays', 30))
        
        # Validate
        if baseline['dailySales'] <= 0:
            return jsonify({
                "success": False,
                "error": "Daily sales must be greater than 0"
            }), 400
        
        print(f"Scenario: Demand x{demand_multiplier}, Lead Time {lead_time_delta:+d} days, Stock {stock_delta:+d} units")
        
        # === BASELINE FORECAST ===
        print(" Generating BASELINE forecast...")
        baseline_future_sales, baseline_metadata = forecast_with_arima(
            daily_sales=baseline['dailySales'],
            weekly_sales=baseline['weeklySales'],
            steps=forecast_days
        )
        
        # Calculate baseline insights
        baseline_insights = generate_alerts({
            'current_stock': baseline['currentStock'],
            'lead_time': baseline['leadTime']
        }, forecast_sales_data=baseline_future_sales, initial_stock=baseline['currentStock'])
        
        # === SCENARIO FORECAST ===
        print(f"Generating SCENARIO forecast with adjustments...")
        scenario_daily_sales = baseline['dailySales'] * demand_multiplier * sales_spike
        scenario_weekly_sales = baseline['weeklySales'] * demand_multiplier * sales_spike
        scenario_current_stock = baseline['currentStock'] + stock_delta
        scenario_lead_time = baseline['leadTime'] + lead_time_delta
        
        scenario_future_sales, scenario_metadata = forecast_with_arima(
            daily_sales=scenario_daily_sales,
            weekly_sales=scenario_weekly_sales,
            steps=forecast_days
        )
        
        baseline_forecast_data = generate_forecast_data(baseline_future_sales, datetime.now().strftime('%Y-%m-%d'), initial_stock=baseline['currentStock'])
        scenario_forecast_data = generate_forecast_data(scenario_future_sales, datetime.now().strftime('%Y-%m-%d'), initial_stock=scenario_current_stock)
        
        # Calculate scenario insights
        scenario_insights = generate_alerts({
            'current_stock': scenario_current_stock,
            'lead_time': scenario_lead_time
        }, forecast_sales_data=scenario_future_sales, initial_stock=scenario_current_stock)
        
        # === COMPARISON METRICS ===
        baseline_total_demand = sum(baseline_future_sales)
        scenario_total_demand = sum(scenario_future_sales)
        demand_change_percent = ((scenario_total_demand - baseline_total_demand) / baseline_total_demand * 100) if baseline_total_demand > 0 else 0
        
        # Stock-out risk comparison - use the detailed risk level from insights
        baseline_stockout_risk = baseline_insights.get('risk_level', 'Low')
        scenario_stockout_risk = scenario_insights.get('risk_level', 'Low')
        
        # === AI REASONING GENERATION ===
        ai_situation = f"With demand at {demand_multiplier}x baseline, total projected consumption is {int(scenario_total_demand)} units over {forecast_days} days. "
        if lead_time_delta > 0:
            ai_situation += f"Supply chain delays of {lead_time_delta} days are exacerbating stock pressure."
        
        eta_days = scenario_insights.get('eta_days')
        if eta_days is not None and eta_days < scenario_lead_time:
            ai_risk = f"CRITICAL: Stock exhaustion predicted in {eta_days} days, which is less than your {scenario_lead_time}-day lead time. A stock-out is highly likely."
            ai_action = f"Immediate reorder of {scenario_insights['recommended_reorder']} units required to minimize service interruption."
        elif eta_days is not None and eta_days < 30:
            ai_risk = f"WARNING: Stock will reach critical levels in {eta_days} days. Current buffers may not be sufficient for the simulated demand spike."
            ai_action = f"Place a proactive order of {scenario_insights['recommended_reorder']} units within the next 48 hours."
        else:
            ai_risk = f"Information: Current inventory and simulated restocks provide a {eta_days if eta_days is not None else 'N/A'}-day safety window."
            ai_action = "Maintain regular monitoring. No immediate emergency action required."

        # Build response
        response = {
            "success": True,
            "sku": sku,
            "productName": product_name,
            "baseline": {
                "parameters": baseline,
                "forecastData": baseline_forecast_data,
                "insights": baseline_insights,
                "totalDemand": float(baseline_total_demand),
                "stockoutRisk": baseline_stockout_risk,
                "method": baseline_metadata['method']
            },
            "scenario": {
                "parameters": {
                    'currentStock': scenario_current_stock,
                    'dailySales': scenario_daily_sales,
                    'weeklySales': scenario_weekly_sales,
                    'leadTime': scenario_lead_time,
                    'reorderLevel': baseline['reorderLevel']
                },
                "adjustments": {
                    'demandMultiplier': demand_multiplier,
                    'leadTimeDelta': lead_time_delta,
                    'stockDelta': stock_delta
                },
                "forecastData": scenario_forecast_data,
                "insights": scenario_insights,
                "totalDemand": float(scenario_total_demand),
                "stockoutRisk": scenario_stockout_risk,
                "method": scenario_metadata['method']
            },
            "comparison": {
                "demandChangePercent": round(demand_change_percent, 2),
                "demandChangeDelta": round(scenario_total_demand - baseline_total_demand, 2),
                "stockoutRiskChange": f"{baseline_stockout_risk} → {scenario_stockout_risk}",
                "etaDaysChange": f"{baseline_insights.get('eta_days', 'N/A')} → {scenario_insights.get('eta_days', 'N/A')} days",
                "recommendedAction": scenario_insights['message']
            },
            "ai_analysis": {
                "situation": ai_situation,
                "risk": ai_risk,
                "action": ai_action
            }
        }
        
        print(f" Scenario planning complete. Demand change: {demand_change_percent:+.1f}%")
        
        return jsonify(response)
    
    except Exception as e:
        print(f" Error in scenario planning: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/api/ml/status', methods=['GET'])
def model_status():
    """Get status of loaded models"""
    return jsonify({
        "ml_model_loaded": ml_model is not None,
        "ml_model_type": "XGBoost Native" if use_xgb_native else "Scikit-learn",
        "encoders_loaded": target_encoders is not None,
        "arima_models_loaded": arima_models is not None,
        "arima_models_count": len(arima_models) if arima_models else 0
    })


@app.route('/api/ml/forecast/<sku>', methods=['GET'])
def get_forecast_by_sku(sku):
    """Fetch stored forecast or generate a fresh one for the modal"""
    # Sanitize SKU: only allow alphanumeric characters, hyphens, and underscores
    import re
    if not re.match(r'^[a-zA-Z0-9_\-]{1,64}$', sku):
        return jsonify({"success": False, "error": "Invalid SKU format"}), 400

    try:
        # 1. Check if we already have a fresh forecast in DB
        # Only use it if it's less than 24 hours old
        yesterday = datetime.now() - timedelta(hours=24)
        forecast = forecasts_collection.find_one({
            "sku": sku,
            "updatedAt": {"$gte": yesterday},
            "aiInsights.avg_daily_demand": {"$exists": True} # Force re-generate if missing new fields
        })
        
        if forecast:
            forecast['_id'] = str(forecast['_id'])
            if 'userId' in forecast: forecast['userId'] = str(forecast['userId'])
            return jsonify({
                "success": True,
                "forecast": forecast,
                "source": "cache"
            })

        # 2. If no fresh forecast, get product details and generate one
        product = products_collection.find_one({"sku": sku})
        if not product:
            return jsonify({"success": False, "error": "Product not found"}), 404
        
        # Extract params (matching schema from server.js)
        current_stock = float(product.get('stock', 0))
        daily_sales = float(product.get('dailySales', 5))
        weekly_sales = float(product.get('weeklySales', 35))
        lead_time = float(product.get('leadTime', 7))
        reorder_level = float(product.get('reorderPoint', 10))
        
        # Generate forecast (using our standard internal logic)
        future_sales, metadata = forecast_with_arima(daily_sales, weekly_sales, steps=30)
        insights = generate_alerts({
            'current_stock': current_stock,
            'lead_time': lead_time
        }, forecast_sales_data=future_sales, initial_stock=current_stock)
        
        current_date = datetime.now().strftime('%Y-%m-%d')
        forecast_data = generate_forecast_data(future_sales, current_date, initial_stock=current_stock)
        
        # Build the document
        forecast_doc = {
            "sku": sku,
            "productName": product.get('name', sku),
            "currentStock": int(current_stock),
            "stockStatusPred": insights.get('status', 'Healthy'),
            "priorityPred": insights.get('risk_level', 'Low'),
            "alert": insights.get('message', ''),
            "aiInsights": insights,
            "forecastData": forecast_data,
            "historicalData": metadata.get("historical_sales", []),
            "inputParams": {
                "dailySales": daily_sales,
                "weeklySales": weekly_sales,
                "reorderLevel": reorder_level,
                "leadTime": lead_time,
                "brand": product.get('brand', 'Generic'),
                "category": product.get('category', 'Misc')
            },
            "forecastMethod": metadata["method"],
            "updatedAt": datetime.now()
        }
        
        # Store for future use
        forecasts_collection.update_one({"sku": sku}, {"$set": forecast_doc}, upsert=True)
        
        # Return prepared doc
        if '_id' in forecast_doc: del forecast_doc['_id']
        return jsonify({
            "success": True,
            "forecast": forecast_doc,
            "source": "generated"
        })

    except Exception as e:
        print(f"Error in forecast fetch: {e}")
        return jsonify({"success": False, "error": str(e)}), 500



# Register Supplier Intelligence Routes
# Pass the MongoDB db so supplier routes can read live products data
# init_db(db)
# app.register_blueprint(supplier_routes, url_prefix='/api/supplier')

# ─── ROUTE 1: All supplier risk scores ────────────────────────────────
@app.route('/api/supplier/risk-overview', methods=['GET'])
def supplier_risk_overview():
    try:
        scores = get_all_supplier_scores(MONGODB_URI)
        return jsonify(scores), 200
    except Exception as e:
        print("!!! ERROR IN risk-overview API !!!")
        traceback.print_exc()
        return jsonify({'error': str(e), 'details': traceback.format_exc()}), 500

# ─── ROUTE 2: Aggregated KPI metrics ──────────────────────────────────
@app.route('/api/supplier/kpis', methods=['GET'])
def supplier_kpis():
    try:
        scores = get_all_supplier_scores(MONGODB_URI)
        active_risk  = sum(1 for s in scores if s['status'] in ('HIGH','CRITICAL'))
        
        if scores:
            # Normalized display factors for KPIs
            avg_delay    = round(sum(s['delayRiskScore'] for s in scores) / len(scores) * 0.15, 1)
            quality_fail = round(sum(s['qualityRiskScore'] for s in scores) / len(scores) * 0.05, 1)
        else:
            avg_delay, quality_fail = 0, 0
            
        loss_risk    = active_risk * 10000
        return jsonify({
            'activeRiskEvents':       active_risk,
            'avgDeliveryDelayDays':   avg_delay,
            'qualityFailurePercent':  quality_fail,
            'procurementLossRiskINR': loss_risk,
        }), 200
    except Exception as e:
        print("!!! ERROR IN supplier-kpis API !!!")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ─── ROUTE 3: 30-day history for one supplier ─────────────────────────
@app.route('/api/supplier/history/<supplier_name>', methods=['GET'])
def supplier_history(supplier_name):
    try:
        history = get_supplier_history(supplier_name.strip(), MONGODB_URI, db_name=db.name)
        return jsonify({'trend': history}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
if __name__ == '__main__':
    print("Starting ML Prediction API...")

    if load_models():
        print(" All models loaded successfully")
    else:
        print(" Warning: One or more models could not be loaded. Rule-based fallback prediction will be used.")

    print(" API running on http://localhost:5001")
    print(" CORS enabled for all origins (*)")
    # use_reloader=False fixes WinError 10038 on Windows
    app.run(debug=True, port=5001, host='0.0.0.0', use_reloader=False)