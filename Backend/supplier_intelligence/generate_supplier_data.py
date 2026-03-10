import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def generate_sample_data(filename="supplier_transactions.csv"):
    # Expanded supplier list with 25 vendors for better visualization
    suppliers = [
        "Apex Logistics", "Global Parts Inc", "Speedy Supply", "Quality First", "Mega Corp",
        "Delta Manufacturing", "Beta Corp", "Nova Logistics", "Alpha Parts", "Omega Industries",
        "Prime Suppliers", "Elite Materials", "Swift Transport", "Precision Parts", "Titan Supply",
        "Vertex Solutions", "Nexus Trading", "Quantum Logistics", "Stellar Components", "Fusion Materials",
        "Zenith Suppliers", "Horizon Industries", "Phoenix Trading", "Atlas Logistics", "Vanguard Parts"
    ]
    categories = ["Electronics", "Raw Materials", "Packaging", "Fasteners", "Chemicals", "Components", "Tools", "Machinery"]
    
    data = []
    start_date = datetime(2023, 1, 1)
    
    # Define specific profiles for variety
    high_risk_suppliers = ["Alpha Parts", "Nova Logistics", "Omega Industries"]
    medium_risk_suppliers = ["Speedy Supply", "Prime Suppliers", "Swift Transport"]
    
    for i in range(1000):
        supplier = np.random.choice(suppliers)
        category = np.random.choice(categories)
        order_date = start_date + timedelta(days=np.random.randint(0, 365))
        promised_date = order_date + timedelta(days=np.random.randint(5, 15))
        
        # Profile-based behavior
        if supplier in high_risk_suppliers:
            # High risk: More delays, more rejections
            delay = np.random.choice([0, 5, 8, 12, 15], p=[0.2, 0.3, 0.2, 0.2, 0.1])
            fulfillment_rate = np.random.choice([1.0, 0.8, 0.7, 0.6], p=[0.3, 0.3, 0.2, 0.2])
            rejection_rate = np.random.choice([0.05, 0.1, 0.15, 0.2], p=[0.3, 0.3, 0.2, 0.2])
        elif supplier in medium_risk_suppliers:
            # Medium risk
            delay = np.random.choice([0, 2, 4, 6], p=[0.4, 0.3, 0.2, 0.1])
            fulfillment_rate = np.random.choice([1.0, 0.95, 0.9], p=[0.6, 0.3, 0.1])
            rejection_rate = np.random.choice([0, 0.02, 0.05], p=[0.5, 0.3, 0.2])
        else:
            # Low risk / Stable
            delay = np.random.choice([0, 1, 2], p=[0.8, 0.15, 0.05])
            fulfillment_rate = np.random.choice([1.0, 0.98], p=[0.9, 0.1])
            rejection_rate = np.random.choice([0, 0.01], p=[0.9, 0.1])

        actual_date = promised_date + timedelta(days=int(delay))
        ordered_qty = np.random.randint(100, 1000)
        delivered_qty = int(ordered_qty * fulfillment_rate)
        rejected_qty = int(delivered_qty * rejection_rate)
        
        base_price = np.random.randint(10, 100)
        actual_price = base_price * (1 + np.random.uniform(-0.05, 0.15))
        
        complaints = np.random.choice([0, 1], p=[0.95, 0.05])
        payment_status = np.random.choice(["On-Time", "Delayed", "Under Review"], p=[0.8, 0.15, 0.05])
        
        data.append({
            "order_id": f"ORD-{1000+i}",
            "supplier": supplier,
            "category": category,
            "order_date": order_date.strftime("%Y-%m-%d"),
            "promised_date": promised_date.strftime("%Y-%m-%d"),
            "actual_date": actual_date.strftime("%Y-%m-%d"),
            "ordered_qty": ordered_qty,
            "delivered_qty": delivered_qty,
            "rejected_qty": rejected_qty,
            "base_price": base_price,
            "actual_price": actual_price,
            "complaints": complaints,
            "payment_status": payment_status
        })
    
    df = pd.DataFrame(data)
    df.to_csv(filename, index=False)
    print(f"Sample data generated: {filename}")

if __name__ == "__main__":
    generate_sample_data("d:/Major/AI-Based-Inevtnory-Control-and-Depot-Management/Backend/supplier_intelligence/supplier_transactions.csv")
