import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

def seed_db():
    # Load env from Backend/server/.env
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'server', '.env')
    load_dotenv(env_path)
    
    mongo_uri = os.getenv("MONGODB_URI")
    if not mongo_uri:
        print("MONGODB_URI not found!")
        return

    client = MongoClient(mongo_uri)
    # Use database from URI, or animesh as fallback
    db = client.get_database()
    if not db.name or db.name == 'test':
        db = client['animesh']
    
    print(f"Seeding supplier data into {db.name}.transactions...")
    
    csv_path = os.path.join(os.path.dirname(__file__), "processed_supplier_data.csv")
    if not os.path.exists(csv_path):
        print(f"CSV not found at {csv_path}. Please run loader first.")
        return
        
    df = pd.read_csv(csv_path)
    
    # We only want the last 500 transactions to keep DB clean but representative
    records = df.tail(500).to_dict('records')
    
    # Add fake userId (organizationId) since the app filters by it
    # We'll use a placeholder or better, try to find one from existing users
    org_id = None
    try:
        user = db.users.find_one()
        if user:
            org_id = user['_id']
            print(f"Found org_id: {org_id}")
    except:
        pass
        
    for r in records:
        if org_id:
            r['userId'] = org_id
        # Ensure numeric fields are correctly typed for aggregation
        r['delay_days'] = float(r.get('delay_days', 0))
        r['quality_rejection_rate'] = float(r.get('quality_rejection_rate', 0))
        r['fulfillment_rate'] = float(r.get('fulfillment_rate', 1.0))
        r['ordered_qty'] = int(r.get('ordered_qty', 100))
        r['base_price'] = float(r.get('base_price', 50))
        r['payment_risk'] = int(r.get('payment_risk', 0))

    # Clear existing supplier transactions to avoid duplicates or junk
    db.transactions.delete_many({"supplier": {"$exists": True}})
    
    if records:
        db.transactions.insert_many(records)
        print(f"Successfully seeded {len(records)} transactions!")
    else:
        print("No records found to seed.")

    # --- PART 2: Seed Supplier History (for the trend chart) ---
    print(f"Seeding 30-day risk history into {db.name}.supplier_risk_snapshots...")
    db.supplier_risk_snapshots.delete_many({}) # Clear old history
    
    history_records = []
    suppliers = df['supplier'].unique()
    now = datetime.utcnow()
    
    for s_name in suppliers:
        # Get base values to keep individual patterns somewhat consistent
        base_delay = np.random.randint(10, 80)
        base_quality = np.random.randint(5, 60)
        
        for d in range(35):
            date = now - timedelta(days=35-d)
            # Add some variance (+/- 10%)
            history_records.append({
                "supplierName": s_name,
                "date": date,
                "delay":      max(0, min(100, base_delay + np.random.randint(-15, 15))),
                "qualityRisk": max(0, min(100, base_quality + np.random.randint(-10, 10))),
                "fulfillment": max(70, min(100, 100 - np.random.randint(0, 15))),
                "overallScore": max(0, min(100, (base_delay + base_quality) / 2 + np.random.randint(-5, 5)))
            })
            
    if history_records:
        db.supplier_risk_snapshots.insert_many(history_records)
        print(f"Successfully seeded {len(history_records)} history snapshots!")

if __name__ == "__main__":
    seed_db()
