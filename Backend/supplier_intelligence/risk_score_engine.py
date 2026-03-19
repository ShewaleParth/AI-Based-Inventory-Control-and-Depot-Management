import pickle
import os
import numpy as np
import pandas as pd

class RiskScoreEngine:
    def __init__(self, models_dir=None):
        if models_dir is None:
            # Use relative path from current script location
            script_dir = os.path.dirname(os.path.abspath(__file__))
            models_dir = os.path.join(script_dir, "models")
        self.models_dir = models_dir
        self.delay_data = self._load_model("delay_risk_model.pkl")
        self.quality_data = self._load_model("quality_risk_model.pkl")
        self.fulfillment_data = self._load_model("fulfillment_risk_model.pkl")

    def _load_model(self, filename):
        path = os.path.join(self.models_dir, filename)
        if os.path.exists(path):
            with open(path, "rb") as f:
                return pickle.load(f)
        return None

    def predict_risk(self, supplier_name, category, ordered_qty, base_price, payment_risk=0):
        if not self.delay_data or not self.quality_data or not self.fulfillment_data:
            return {"error": "Models not loaded"}

        # Prepare inputs using encoders from ANY model (assuming they are consistent or we use specific ones)
        # To be safe, each model has its own encoder.
        
        try:
            # 1. Delay Risk
            delay_feat = self._prepare_features(self.delay_data, supplier_name, category, ordered_qty, base_price, payment_risk)
            delay_pred = self.delay_data['model'].predict(delay_feat)[0]
            # Normalize delay: 0 days = 0, 15+ days = 100
            delay_score = min(max(delay_pred * 6.6, 0), 100) 

            # 2. Quality Risk
            quality_feat = self._prepare_features(self.quality_data, supplier_name, category, ordered_qty, base_price, payment_risk)
            quality_pred = self.quality_data['model'].predict(quality_feat)[0]
            # Normalize rejection: 0% = 0, 10%+ = 100
            quality_score = min(max(quality_pred * 1000, 0), 100)

            # 3. Fulfillment Risk
            fulfillment_feat = self._prepare_features(self.fulfillment_data, supplier_name, category, ordered_qty, base_price, payment_risk)
            fulfillment_pred = self.fulfillment_data['model'].predict(fulfillment_feat)[0]
            # Normalize failure: 1.0 (100% full) = 0, 0.8 or less = 100
            failure_rate = 1.0 - fulfillment_pred
            fulfillment_score = min(max(failure_rate * 500, 0), 100)

            # Weighted final score
            final_score = (delay_score * 0.4) + (quality_score * 0.3) + (fulfillment_score * 0.3)
            
            label = "Low"
            if final_score > 70:
                label = "High"
            elif final_score > 40:
                label = "Medium"

            return {
                "risk_score": round(final_score, 2),
                "label": label,
                "breakdown": {
                    "delay": round(delay_score, 2),
                    "quality": round(quality_score, 2),
                    "fulfillment": round(fulfillment_score, 2)
                }
            }
        except Exception as e:
            return {"error": str(e)}

    def _prepare_features(self, model_data, supplier, category, qty, price, pay_risk):
        # We need to handle unseen labels gracefully if using LabelEncoder in production
        # For simplicity in this project, we'll try to transform or use a default if it fails
        try:
            s_id = model_data['le_supplier'].transform([supplier])[0]
        except:
            s_id = 0 # Default/Unknown
            
        try:
            c_id = model_data['le_category'].transform([category])[0]
        except:
            c_id = 0

        # Return DataFrame with proper feature names to avoid sklearn warnings
        feature_names = ['supplier_id', 'category_id', 'ordered_qty', 'base_price', 'payment_risk']
        return pd.DataFrame([[s_id, c_id, qty, price, pay_risk]], columns=feature_names)

if __name__ == "__main__":
    engine = RiskScoreEngine()
    result = engine.predict_risk("Apex Logistics", "Electronics", 500, 50)
    print(result)

# â”€â”€â”€ ADD THESE TWO FUNCTIONS TO THE BOTTOM OF risk_score_engine.py â”€â”€â”€

import os, joblib, pandas as pd
from pymongo import MongoClient
from datetime import datetime, timedelta

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')

def _load_models():
    delay_model   = joblib.load(os.path.join(MODEL_DIR, 'delay_risk_model.pkl'))
    quality_model = joblib.load(os.path.join(MODEL_DIR, 'quality_risk_model.pkl'))
    fulfil_model  = joblib.load(os.path.join(MODEL_DIR, 'fulfillment_risk_model.pkl'))
    return delay_model, quality_model, fulfil_model

def get_all_supplier_scores(mongo_uri, db_name='sangrahak'):
    """
    Queries MongoDB for all supplier transaction records,
    runs ML inference on each, returns list of scored dicts.
    """
    client = MongoClient(mongo_uri)
    # Extract DB name from URI or use provided name
    db = client.get_database()
    if not db.name or db.name == 'test':
        db = client[db_name]
    
    print(f"Aggregating supplier scores from DB: {db.name}")

    # Aggregate raw performance metrics per supplier from transactions
    pipeline = [
        { '$group': {
            '_id': '$supplier',
            'category':    { '$first': '$category' },
            'avgDelay':    { '$avg': '$delay_days' },
            'qualityRej':  { '$avg': '$quality_rejection_rate' },
            'fulfillPct':  { '$avg': '$fulfillment_rate' },
            'orderCount':  { '$sum': 1 },
        }},
        { '$match': { '_id': { '$ne': None } } } # Filter out null suppliers
    ]
    raw = list(db.transactions.aggregate(pipeline))

    delay_m, quality_m, fulfil_m = _load_models()
    results = []

    for r in raw:
        supplier_name = r['_id']
        category_name = r.get('category', 'Unknown')
        
        try:
            s_id = delay_m['le_supplier'].transform([supplier_name])[0]
        except:
            s_id = 0
            
        try:
            c_id = delay_m['le_category'].transform([category_name])[0]
        except:
            c_id = 0

        features = pd.DataFrame([{
            'supplier_id': s_id,
            'category_id': c_id,
            'ordered_qty': r.get('orderCount', 100),
            'base_price': 500,
            'payment_risk': 0
        }], columns=['supplier_id', 'category_id', 'ordered_qty', 'base_price', 'payment_risk'])

        delay_pred = float(delay_m['model'].predict(features)[0])
        quality_pred = float(quality_m['model'].predict(features)[0])
        fulfillment_pred = float(fulfil_m['model'].predict(features)[0])

        delay_score   = round(min(max(delay_pred * 6.6, 0), 100))
        quality_score = round(min(max(quality_pred * 1000, 0), 100))
        fulfil_score  = round(min(max((1.0 - fulfillment_pred) * 500, 0), 100))

        overall = round(delay_score * 0.40 + quality_score * 0.30 +
                        fulfil_score * 0.30)

        status = ('CRITICAL' if overall >= 70 else
                  'HIGH'     if overall >= 45 else
                  'MEDIUM'   if overall >= 25 else 'LOW')

        results.append({
            'supplierName':    r['_id'],
            'category':        category_name,
            'delayRiskScore':  delay_score,
            'qualityRiskScore':quality_score,
            'fulfillmentRate': (100 - fulfil_score), # Show as fulfillment % (positive metric)
            'overallRiskScore':overall,
            'status':          status,
            'lastUpdated':     datetime.utcnow().isoformat() + 'Z',
        })

    results.sort(key=lambda x: x['overallRiskScore'], reverse=True)
    return results

def get_supplier_history(supplier_name, mongo_uri, db_name='sangrahak'):
    """Returns 30-day daily risk trend for one supplier."""
    client = MongoClient(mongo_uri)
    db     = client[db_name]
    cutoff = datetime.utcnow() - timedelta(days=45)
    
    docs = list(db.supplier_risk_snapshots.find(
        { 'supplierName': supplier_name, 'date': { '$gte': cutoff } },
        { '_id':0, 'date':1, 'delay':1, 'qualityRisk':1, 'fulfillment':1, 'overallScore':1 }
    ).sort('date', 1))

    return docs

