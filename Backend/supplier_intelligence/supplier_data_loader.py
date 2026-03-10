import pandas as pd
import numpy as np
import os

def load_supplier_data(file_path="supplier_transactions.csv"):
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Data file not found at {file_path}")
    
    df = pd.read_csv(file_path)
    
    # Convert dates
    df['order_date'] = pd.to_datetime(df['order_date'])
    df['promised_date'] = pd.to_datetime(df['promised_date'])
    df['actual_date'] = pd.to_datetime(df['actual_date'])
    
    # Compute derived features
    # 1. Delay Days
    df['delay_days'] = (df['actual_date'] - df['promised_date']).dt.days
    
    # 2. Fulfillment Ratio
    df['fulfillment_ratio'] = df['delivered_qty'] / df['ordered_qty']
    
    # 3. Rejection Ratio
    df['rejection_ratio'] = df['rejected_qty'] / df.apply(lambda x: max(x['delivered_qty'], 1), axis=1)
    
    # 4. Price Deviation
    df['price_deviation'] = (df['actual_price'] - df['base_price']) / df['base_price']
    
    # 5. Delay Trend (rolling mean of delays per supplier)
    df = df.sort_values(['supplier', 'order_date'])
    df['delay_trend'] = df.groupby('supplier')['delay_days'].transform(lambda x: x.rolling(window=3, min_periods=1).mean())
    
    # 6. Complaint Frequency
    df['complaint_frequency'] = df.groupby('supplier')['complaints'].transform(lambda x: x.rolling(window=5, min_periods=1).sum())
    
    # 7. Payment Risk
    # Simple mapping: On-Time=0, Under Review=1, Delayed=2
    risk_map = {"On-Time": 0, "Under Review": 1, "Delayed": 2}
    df['payment_risk'] = df['payment_status'].map(risk_map)
    
    return df

if __name__ == "__main__":
    # Test loading
    try:
        data = load_supplier_data("d:/Major/AI-Based-Inevtnory-Control-and-Depot-Management/Backend/supplier_intelligence/supplier_transactions.csv")
        print("Data loaded and processed successfully.")
        print(data.head())
        data.to_csv("d:/Major/AI-Based-Inevtnory-Control-and-Depot-Management/Backend/supplier_intelligence/processed_supplier_data.csv", index=False)
    except Exception as e:
        print(f"Error: {e}")
