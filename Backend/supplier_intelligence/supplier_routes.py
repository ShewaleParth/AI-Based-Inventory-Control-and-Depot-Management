from flask import Blueprint, request, jsonify
import pandas as pd
import os

supplier_routes = Blueprint('supplier_routes', __name__)

# MongoDB db reference â€” injected via init_db() from app.py
_db = None


def init_db(database):
    """Called once from app.py to give this blueprint access to MongoDB."""
    global _db
    _db = database


# â”€â”€â”€ HELPER: Compute risk metrics from MongoDB product records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _compute_risk_from_products(products):
    """
    Derives supplier risk metrics entirely from the live MongoDB products
    collection.  No fake CSV data is needed.

    Fields used from each product document:
      stock        â€“ current total stock
      reorderPoint â€“ trigger level below which stock is "understocked"
      leadTime     â€“ how many days this supplier takes to deliver (delay proxy)
      status       â€“ 'out-of-stock' | 'low-stock' | 'in-stock' | 'overstock'
      category     â€“ product category
    """
    total = len(products)
    if total == 0:
        return None

    out_of_stock  = sum(1 for p in products if (p.get('stock') or 0) == 0)
    low_stock     = sum(1 for p in products if p.get('status') == 'low-stock')
    understocked  = sum(
        1 for p in products
        if (p.get('stock') or 0) < (p.get('reorderPoint') or 0)
    )

    # avg_delay:  use leadTime as a direct proxy for supplier delivery delay
    avg_lead = sum(p.get('leadTime') or 7 for p in products) / total

    # avg_fulfillment:  % of products that are adequately stocked
    adequately_stocked = total - understocked
    fulfillment_pct = round((adequately_stocked / total) * 100, 1)

    # avg_rejection proxy:  % of products currently out-of-stock
    rejection_pct = round((out_of_stock / total) * 100, 1)

    # risk_score (0â€“100):
    #   40 pts  â†’ out-of-stock pressure
    #   35 pts  â†’ understock pressure
    #   25 pts  â†’ lead-time pressure  (14 days = max pressure)
    risk_score = min(100, round(
        (out_of_stock  / total) * 40 +
        (understocked  / total) * 35 +
        min(1.0, avg_lead / 14.0) * 25
    ))

    if risk_score >= 60:
        risk_level = 'High'
    elif risk_score >= 30:
        risk_level = 'Medium'
    else:
        risk_level = 'Low'

    # Most common category among this supplier's products
    cats = [p.get('category', 'General') for p in products if p.get('category')]
    top_category = max(set(cats), key=cats.count) if cats else 'General'

    return {
        "avg_delay":       round(avg_lead, 1),
        "avg_fulfillment": fulfillment_pct,
        "avg_rejection":   rejection_pct,
        "risk_score":      risk_score,
        "risk_level":      risk_level,
        "category":        top_category,
        "total_products":  total,
    }


# â”€â”€â”€ ROUTE: GET /api/supplier/risk-overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@supplier_routes.route('/risk-overview', methods=['GET'])
def risk_overview():
    """
    Returns supplier risk data.

    Strategy:
      1. PRIMARY  â€“ Query MongoDB products collection for live data.
                    Metrics are derived from real stock / lead-time figures.
      2. FALLBACK â€“ Read processed_supplier_data.csv if MongoDB is unavailable
                    or has no products yet.
    """
    try:
        # â”€â”€ 1. Try MongoDB (live, real data) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if _db is not None:
            raw_products = list(_db.products.find(
                {},
                {
                    '_id': 0,
                    'supplier': 1, 'category': 1,
                    'stock': 1,  'reorderPoint': 1,
                    'leadTime': 1, 'status': 1
                }
            ))

            # Keep only products that have a named supplier
            live_products = [p for p in raw_products if p.get('supplier', '').strip()]

            if live_products:
                # Group by supplier name
                supplier_map = {}
                for p in live_products:
                    name = p['supplier'].strip()
                    supplier_map.setdefault(name, []).append(p)

                results = []
                for supplier_name, prods in supplier_map.items():
                    metrics = _compute_risk_from_products(prods)
                    if metrics:
                        results.append({
                            "supplier":         supplier_name,
                            "category":         metrics["category"],
                            "avg_delay":        metrics["avg_delay"],
                            "avg_fulfillment":  metrics["avg_fulfillment"],
                            "avg_rejection":    metrics["avg_rejection"],
                            "risk_score":       metrics["risk_score"],
                            "risk_level":       metrics["risk_level"],
                            "total_products":   metrics["total_products"],
                            "source":           "live"          # handy for debugging
                        })

                # Sort highest-risk suppliers to the top
                results.sort(key=lambda x: x['risk_score'], reverse=True)

                return jsonify({
                    "success":   True,
                    "suppliers": results,
                    "source":    "mongodb"
                })

        # â”€â”€ 2. Fallback â†’ CSV (in case DB is empty or unavailable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        DATA_PATH = os.path.join(os.path.dirname(__file__), "processed_supplier_data.csv")
        if not os.path.exists(DATA_PATH):
            return jsonify({
                "success": False,
                "error":   "No supplier data available. Add products with supplier names to get started."
            }), 404

        df = pd.read_csv(DATA_PATH)
        suppliers = df.groupby('supplier').agg({
            'delay_days':       'mean',
            'fulfillment_ratio':'mean',
            'rejection_ratio':  'mean',
            'category':         'first',
            'base_price':       'mean',
            'payment_risk':     'max'
        }).reset_index()

        results = []
        for _, row in suppliers.iterrows():
            delay      = round(row['delay_days'], 1)
            fulfillment= round(row['fulfillment_ratio'] * 100, 1)
            rejection  = round(row['rejection_ratio']  * 100, 1)
            risk_score = min(100, round(
                (rejection  / 100) * 40 +
                (max(0, 100 - fulfillment) / 100) * 35 +
                min(1, delay / 14) * 25
            ))
            risk_level = 'High' if risk_score >= 60 else ('Medium' if risk_score >= 30 else 'Low')

            results.append({
                "supplier":        row['supplier'],
                "category":        row['category'],
                "avg_delay":       delay,
                "avg_fulfillment": fulfillment,
                "avg_rejection":   rejection,
                "risk_score":      risk_score,
                "risk_level":      risk_level,
                "source":          "csv"
            })

        results.sort(key=lambda x: x['risk_score'], reverse=True)
        return jsonify({"success": True, "suppliers": results, "source": "csv"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# â”€â”€â”€ ROUTE: GET /api/supplier/history/<supplier_name> â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@supplier_routes.route('/history/<supplier_name>', methods=['GET'])
def supplier_history(supplier_name):
    """
    Returns a risk trend for the given supplier.

    PRIMARY:   Builds the trend from stock-out / low-stock events recorded
               in the MongoDB transactions collection (stock-out entries =
               quality/fulfilment events). Falls back to showing a static
               snapshot derived from the supplier's current products.
    FALLBACK:  Reads the processed CSV as before.
    """
    try:
        if _db is not None:
            # Fetch current products for this supplier
            prods = list(_db.products.find(
                {'supplier': supplier_name},
                {'_id': 0, 'leadTime': 1, 'stock': 1, 'reorderPoint': 1,
                 'status': 1, 'updatedAt': 1, 'name': 1}
            ))

            if prods:
                # Build a trend list â€” one data point per product (last 10)
                trend = []
                for p in prods[-10:]:
                    stock  = p.get('stock', 0) or 0
                    reorder= p.get('reorderPoint', 10) or 10
                    lead   = p.get('leadTime', 7) or 7

                    # Fulfillment: 100% if stock >= reorder, else proportional
                    fulfil = round(min(100, (stock / reorder) * 100), 1) if reorder > 0 else 100.0
                    # Rejection proxy: 100% if completely out-of-stock
                    reject = 100.0 if stock == 0 else (round((1 - stock / reorder) * 100, 1) if stock < reorder else 0.0)
                    delay  = lead

                    trend.append({
                        "date":        (p.get('updatedAt') or '').strftime('%Y-%m-%d')
                                       if hasattr(p.get('updatedAt'), 'strftime') else 'N/A',
                        "delay":       delay,
                        "rejection":   max(0, reject),
                        "fulfillment": fulfil
                    })

                return jsonify({"success": True, "supplier": supplier_name, "trend": trend, "source": "mongodb"})

        # Fallback â†’ CSV
        DATA_PATH = os.path.join(os.path.dirname(__file__), "processed_supplier_data.csv")
        if not os.path.exists(DATA_PATH):
            return jsonify({"success": False, "error": "No data available"}), 404

        df = pd.read_csv(DATA_PATH)
        history = df[df['supplier'] == supplier_name].sort_values('order_date').tail(10)

        if history.empty:
            return jsonify({"success": False, "error": "Supplier not found"}), 404

        trend = history.apply(lambda r: {
            "date":        r['order_date'],
            "delay":       r['delay_days'],
            "rejection":   round(r['rejection_ratio'] * 100, 2),
            "fulfillment": round(r['fulfillment_ratio'] * 100, 2)
        }, axis=1).tolist()

        return jsonify({"success": True, "supplier": supplier_name, "trend": trend, "source": "csv"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# â”€â”€â”€ ROUTE: POST /api/supplier/predict-risk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@supplier_routes.route('/predict-risk', methods=['POST'])
def predict_risk():
    """Quick one-off risk check for an arbitrary supplier / order payload."""
    try:
        data        = request.json
        supplier   = data.get('supplier', 'Unknown')
        category   = data.get('category', 'General')
        qty        = float(data.get('qty', 100))
        price      = float(data.get('price', 50))
        pay_risk   = int(data.get('payment_risk', 0))

        # Simple rule-based scoring (no ML model needed for this endpoint)
        price_factor = min(1.0, price / 200)           # higher price â†’ slightly more risk
        pay_factor   = pay_risk / 2                    # 0, 0.5, or 1
        risk_score   = round((price_factor * 30) + (pay_factor * 40) + 30)
        risk_score   = max(0, min(100, risk_score))
        risk_level   = 'High' if risk_score >= 60 else ('Medium' if risk_score >= 30 else 'Low')

        return jsonify({
            "success": True,
            "result": {
                "supplier":   supplier,
                "risk_score": risk_score,
                "label":      risk_level,
                "category":   category
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

