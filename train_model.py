"""
train_model.py — Retrain the Smart Fridge spoilage prediction model.
Loads ideal.csv, warning.csv, spoilage.csv → trains RandomForestClassifier → saves smart_fridge_model_v2.pkl
"""

import pandas as pd
import numpy as np
import pickle
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

def main():
    # Load datasets
    ideal = pd.read_csv('ideal.csv')
    warning = pd.read_csv('warning.csv')
    spoilage = pd.read_csv('spoilage.csv')

    # Label: 0 = ideal, 1 = warning, 2 = spoilage
    ideal['label'] = 0
    warning['label'] = 1
    spoilage['label'] = 2

    # Combine
    data = pd.concat([ideal, warning, spoilage], ignore_index=True)
    print(f"Total samples: {len(data)}")
    print(f"  Ideal:    {len(ideal)}")
    print(f"  Warning:  {len(warning)}")
    print(f"  Spoilage: {len(spoilage)}")

    # Features and labels
    X = data[['temp', 'humidity', 'door', 'co']].values
    y = data['label'].values

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Train
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\nAccuracy: {acc:.4f}")
    print("\nClassification Report:")
    print(classification_report(
        y_test, y_pred,
        target_names=['Ideal', 'Warning', 'Spoilage']
    ))

    # Test predictions
    test_cases = [
        [3.5, 65, 0, 100],   # Should be ~ideal
        [6.5, 78, 0, 200],   # Should be ~warning
        [10.0, 90, 1, 450],  # Should be ~spoilage
    ]
    print("Test predictions:")
    for tc in test_cases:
        pred = model.predict([tc])[0]
        proba = model.predict_proba([tc])[0]
        labels = ['Ideal', 'Warning', 'Spoilage']
        print(f"  {tc} -> {labels[pred]} (probs: {dict(zip(labels, [f'{p:.2f}' for p in proba]))})")

    # Save model
    with open('smart_fridge_model_v2.pkl', 'wb') as f:
        pickle.dump(model, f)
    print("\nModel saved to smart_fridge_model_v2.pkl")

if __name__ == '__main__':
    main()
