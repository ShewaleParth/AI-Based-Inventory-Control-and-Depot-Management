import numpy as np
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import SimpleExpSmoothing
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import warnings
from statsmodels.tools.sm_exceptions import ConvergenceWarning

warnings.filterwarnings('ignore', category=ConvergenceWarning)
warnings.filterwarnings('ignore', category=UserWarning)

def generate_historical_sales_from_inputs(daily_sales, weekly_sales, num_days=100):
    avg_from_daily = daily_sales
    avg_from_weekly = weekly_sales / 7
    base_sales = (avg_from_daily * 0.4 + avg_from_weekly * 0.6)
    
    historical_sales = []
    
    for i in range(num_days):
        day_of_week = i % 7
        seasonality = 1.15 if day_of_week < 5 else 0.75
        trend = 1 + (i / num_days) * 0.1
        noise = np.random.uniform(0.8, 1.2)
        sales_value = base_sales * seasonality * trend * noise
        historical_sales.append(max(0, sales_value))
    
    return np.array(historical_sales)

print("Generating synthetic historical sales matching app.py logic...")
np.random.seed(42)
series = generate_historical_sales_from_inputs(daily_sales=25, weekly_sales=175, num_days=100)

train_size = int(len(series) * 0.8)
train = series[:train_size]
test  = series[train_size:]

print(f"Train size: {len(train)}, Test size: {len(test)}")

# Moving Average baseline
ma_pred = pd.Series(train).rolling(7).mean().iloc[-1]
ma_preds = np.full(len(test), ma_pred)

# Exponential Smoothing baseline
es = SimpleExpSmoothing(train).fit()
es_preds = es.forecast(len(test))

# Find best ARIMA order similar to app.py
orders_to_try = [(1, 1, 1), (2, 1, 1), (1, 1, 2), (2, 1, 2), (0, 1, 1)]
best_aic = float('inf')
best_order = None
best_model_fit = None

for order in orders_to_try:
    try:
        model = ARIMA(train, order=order)
        fitted = model.fit()
        if fitted.aic < best_aic:
            best_aic = fitted.aic
            best_order = order
            best_model_fit = fitted
    except Exception:
        continue

print(f"Best ARIMA Order Selected: {best_order}")

# Forecast
arima_preds = best_model_fit.forecast(steps=len(test))

print("\n--- Quantitative Metrics on Test Set ---")
for name, preds in [("Moving Avg", ma_preds), ("Exp Smoothing", es_preds), ("ARIMA", arima_preds)]:
    mae  = mean_absolute_error(test, preds)
    rmse = np.sqrt(mean_squared_error(test, preds))
    mape = np.mean(np.abs((test - preds) / test)) * 100
    r2   = r2_score(test, preds)
    print(f"{name}:\n  MAE={mae:.4f}\n  RMSE={rmse:.4f}\n  MAPE={mape:.2f}%\n  R2={r2:.4f}\n")