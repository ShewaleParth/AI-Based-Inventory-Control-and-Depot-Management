# Run from Backend/code/ or wherever your app.py is

import pandas as pd
import numpy as np
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, accuracy_score
from sklearn.preprocessing import LabelEncoder

# ── Load your dataset ─────────────────────────────────────────────
# Replace with your actual dataset path
df = pd.read_csv('D:\MajorProject\Dataset\Item List.csv')   # adjust path

# ── Check what columns exist ──────────────────────────────────────
print("Columns:", df.columns.tolist())
print("Class distribution:\n", df['status'].value_counts())   # adjust column name if different

# ── Features and label ────────────────────────────────────────────
feature_cols = ['current_stock', 'forecasted_demand', 'reorder_threshold',
                'lead_time', 'rolling_consumption_avg', 'depot_utilization_ratio']

X = df[feature_cols]
y = df['status']   # adjust if your label column has a different name

le = LabelEncoder()
y_enc = le.fit_transform(y)

# ── Train/test split ──────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y_enc, test_size=0.2, random_state=42, stratify=y_enc)

# ── Train XGBoost ─────────────────────────────────────────────────
clf = XGBClassifier(learning_rate=0.1, n_estimators=200, max_depth=6,
                    use_label_encoder=False, eval_metric='mlogloss', random_state=42)
clf.fit(X_train, y_train)

# ── Evaluate ──────────────────────────────────────────────────────
y_pred = clf.predict(X_test)
y_prob = clf.predict_proba(X_test)

print("\n=== CLASSIFICATION REPORT ===")
print(classification_report(y_test, y_pred, target_names=le.classes_))

print("=== CONFUSION MATRIX ===")
print(confusion_matrix(y_test, y_pred))

print("=== OVERALL ACCURACY ===")
print(f"Accuracy: {accuracy_score(y_test, y_pred)*100:.2f}%")

try:
    auc = roc_auc_score(y_test, y_prob, multi_class='ovr', average='weighted')
    print(f"AUC-ROC (weighted): {auc:.4f}")
except:
    print("AUC-ROC: could not compute (check class count)")