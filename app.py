"""
app.py - Smart Fridge IoT Dashboard Backend
Flask server with ThingSpeak integration, ML predictions, and recipe management.
"""

import os
import json
import csv
import pickle
import time
import math
import random
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request, send_from_directory
import requests as http_requests
import numpy as np
import pandas as pd

app = Flask(__name__, static_folder='static', template_folder='templates')

# ============================================================
# THINGSPEAK CONFIGURATION — HARDCODED CREDENTIALS
# ============================================================
THINGSPEAK_CHANNEL_ID = "3358658"      # <-- Replace with your Channel ID
THINGSPEAK_READ_API_KEY = "HJXJ6DZ373KXIDOA"    # <-- Replace with your Read API Key
THINGSPEAK_BASE_URL = "https://api.thingspeak.com"

# Field mapping
# field1 = Temperature (°C)
# field2 = Humidity (%)
# field3 = Door Status (0=closed, 1=open)
# field4 = CO Gas (ppm)

# Default fallback values
DEFAULTS = {
    'temperature': 12.0,
    'humidity': 50.0,
    'co': 5.6,
    'door': 0
}

# Spoilage alert thresholds
ALERT_THRESHOLDS = {
    'temp_danger': 30,
    'humidity_danger': 70,
    'co_danger': 15
}

# ============================================================
# LOAD ML MODEL
# ============================================================
MODEL = None
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'smart_fridge_model_v2.pkl')

def load_model():
    global MODEL
    try:
        with open(MODEL_PATH, 'rb') as f:
            MODEL = pickle.load(f)
        print("[OK] ML model loaded successfully")
    except Exception as e:
        print(f"[WARN] Could not load ML model: {e}")
        MODEL = None

load_model()

# ============================================================
# LOAD & PREPROCESS RECIPES
# ============================================================
RECIPES = []
RECIPES_PATH = os.path.join(os.path.dirname(__file__), 'recipes_processed.json')
RAW_RECIPES_PATH = os.path.join(os.path.dirname(__file__), 'RAW_recipes.csv')

def preprocess_recipes():
    """Parse the large CSV and extract only needed fields into a smaller JSON file."""
    global RECIPES
    print("[INFO] Preprocessing recipes from RAW_recipes.csv (this may take a moment)...")
    
    recipes = []
    try:
        count = 0
        with open(RAW_RECIPES_PATH, 'r', encoding='utf-8', errors='replace') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if count >= 5000:  # Limit to 5000 recipes for performance
                    break
                try:
                    name = row.get('name', '').strip()
                    if not name:
                        continue
                    
                    # Parse ingredients (stored as Python list string)
                    ingredients_str = row.get('ingredients', '[]')
                    try:
                        ingredients = eval(ingredients_str) if ingredients_str else []
                    except:
                        ingredients = []
                    
                    # Parse steps
                    steps_str = row.get('steps', '[]')
                    try:
                        steps = eval(steps_str) if steps_str else []
                    except:
                        steps = []
                    
                    description = row.get('description', '').strip()
                    minutes = int(row.get('minutes', 0)) if row.get('minutes', '').strip().isdigit() else 0
                    n_ingredients = int(row.get('n_ingredients', 0)) if row.get('n_ingredients', '').strip().isdigit() else len(ingredients)
                    
                    recipes.append({
                        'id': count,
                        'name': name,
                        'ingredients': [str(i).strip().lower() for i in ingredients],
                        'steps': [str(s).strip() for s in steps],
                        'description': description,
                        'minutes': minutes,
                        'n_ingredients': n_ingredients
                    })
                    count += 1
                except Exception as e:
                    continue
        
        # Save preprocessed data
        with open(RECIPES_PATH, 'w', encoding='utf-8') as f:
            json.dump(recipes, f)
        
        RECIPES = recipes
        print(f"[OK] Preprocessed {len(recipes)} recipes -> recipes_processed.json")
    except Exception as e:
        print(f"[ERROR] Failed to preprocess recipes: {e}")

def load_recipes():
    global RECIPES
    if os.path.exists(RECIPES_PATH):
        try:
            with open(RECIPES_PATH, 'r', encoding='utf-8') as f:
                RECIPES = json.load(f)
            print(f"[OK] Loaded {len(RECIPES)} preprocessed recipes")
        except:
            preprocess_recipes()
    else:
        preprocess_recipes()

load_recipes()

# ============================================================
# LOAD CSV INSIGHTS DATA
# ============================================================
def load_csv_insights():
    """Load ideal/warning/spoilage CSVs and compute aggregate stats."""
    insights = {'ideal': [], 'warning': [], 'spoilage': []}
    
    for label, filename in [('ideal', 'ideal.csv'), ('warning', 'warning.csv'), ('spoilage', 'spoilage.csv')]:
        filepath = os.path.join(os.path.dirname(__file__), filename)
        try:
            df = pd.read_csv(filepath)
            insights[label] = df.to_dict('records')
        except Exception as e:
            print(f"[WARN] Could not load {filename}: {e}")
    
    # Compute aggregate statistics
    stats = {}
    for label in ['ideal', 'warning', 'spoilage']:
        data = insights[label]
        if data:
            temps = [d['temp'] for d in data]
            humids = [d['humidity'] for d in data]
            cos = [d['co'] for d in data]
            stats[label] = {
                'count': len(data),
                'temp': {'min': min(temps), 'max': max(temps), 'avg': round(sum(temps)/len(temps), 2)},
                'humidity': {'min': min(humids), 'max': max(humids), 'avg': round(sum(humids)/len(humids), 2)},
                'co': {'min': min(cos), 'max': max(cos), 'avg': round(sum(cos)/len(cos), 2)},
                'door_open_pct': round(sum(1 for d in data if d['door'] == 1) / len(data) * 100, 1)
            }
    
    # Build heatmap data (temp vs humidity bins)
    heatmap = {'ideal': [], 'warning': [], 'spoilage': []}
    for label in ['ideal', 'warning', 'spoilage']:
        data = insights[label]
        if data:
            # Create 2D histogram
            temps = [d['temp'] for d in data]
            humids = [d['humidity'] for d in data]
            heatmap[label] = {'temps': temps[:100], 'humids': humids[:100]}  # Sample for performance
    
    return {
        'stats': stats,
        'distribution': {
            'ideal': len(insights['ideal']),
            'warning': len(insights['warning']),
            'spoilage': len(insights['spoilage'])
        },
        'heatmap': heatmap
    }

# ============================================================
# ROUTES
# ============================================================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)


@app.route('/api/sensor-data')
def get_sensor_data():
    """Fetch live sensor data from ThingSpeak with fallback defaults."""
    results_count = request.args.get('results', 50, type=int)
    
    feeds = []
    current = dict(DEFAULTS)
    thingspeak_connected = False
    
    try:
        url = f"{THINGSPEAK_BASE_URL}/channels/{THINGSPEAK_CHANNEL_ID}/feeds.json"
        params = {
            'api_key': THINGSPEAK_READ_API_KEY,
            'results': results_count
        }
        resp = http_requests.get(url, params=params, timeout=5)
        
        if resp.status_code == 200:
            data = resp.json()
            raw_feeds = data.get('feeds', [])
            
            for feed in raw_feeds:
                entry = {
                    'created_at': feed.get('created_at', ''),
                    'temperature': safe_float(feed.get('field1'), DEFAULTS['temperature']),
                    'humidity': safe_float(feed.get('field2'), DEFAULTS['humidity']),
                    'door': safe_int(feed.get('field3'), DEFAULTS['door']),
                    'co': safe_float(feed.get('field4'), DEFAULTS['co'])
                }
                feeds.append(entry)
            
            if feeds:
                current = {
                    'temperature': feeds[-1]['temperature'],
                    'humidity': feeds[-1]['humidity'],
                    'door': feeds[-1]['door'],
                    'co': feeds[-1]['co']
                }
                thingspeak_connected = True
    except Exception as e:
        print(f"[WARN] ThingSpeak error: {e}")
    
    # Check alert conditions
    alerts = []
    if current['temperature'] > ALERT_THRESHOLDS['temp_danger']:
        alerts.append({'type': 'danger', 'message': f"Temperature critically high: {current['temperature']}°C (>{ALERT_THRESHOLDS['temp_danger']}°C)"})
    if current['humidity'] > ALERT_THRESHOLDS['humidity_danger']:
        alerts.append({'type': 'danger', 'message': f"Humidity critically high: {current['humidity']}% (>{ALERT_THRESHOLDS['humidity_danger']}%)"})
    if current['co'] > ALERT_THRESHOLDS['co_danger']:
        alerts.append({'type': 'danger', 'message': f"CO gas critically high: {current['co']} ppm (>{ALERT_THRESHOLDS['co_danger']} ppm)"})
    if current['door'] == 1:
        alerts.append({'type': 'warning', 'message': "Door is currently OPEN"})
    
    return jsonify({
        'current': current,
        'feeds': feeds,
        'connected': thingspeak_connected,
        'alerts': alerts,
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/predict', methods=['POST'])
def predict():
    """ML prediction for a single set of sensor readings."""
    data = request.get_json()
    temp = float(data.get('temperature', DEFAULTS['temperature']))
    humidity = float(data.get('humidity', DEFAULTS['humidity']))
    door = int(data.get('door', DEFAULTS['door']))
    co = float(data.get('co', DEFAULTS['co']))
    days_stored = float(data.get('days_stored', 0))
    
    result = make_prediction(temp, humidity, door, co, days_stored)
    return jsonify(result)


@app.route('/api/predict-batch', methods=['POST'])
def predict_batch():
    """Batch ML prediction for all inventory items."""
    data = request.get_json()
    items = data.get('items', [])
    sensor = data.get('sensor', DEFAULTS)
    
    temp = float(sensor.get('temperature', DEFAULTS['temperature']))
    humidity = float(sensor.get('humidity', DEFAULTS['humidity']))
    door = int(sensor.get('door', DEFAULTS['door']))
    co = float(sensor.get('co', DEFAULTS['co']))
    
    predictions = []
    for item in items:
        days_stored = float(item.get('days_stored', 0))
        pred = make_prediction(temp, humidity, door, co, days_stored)
        pred['item_name'] = item.get('name', 'Unknown')
        predictions.append(pred)
    
    return jsonify({'predictions': predictions})


@app.route('/api/csv-insights')
def csv_insights():
    """Return aggregated statistics from training CSVs."""
    insights = load_csv_insights()
    return jsonify(insights)


@app.route('/api/recipes')
def get_recipes():
    """Return recipes, optionally filtered by ingredients."""
    ingredient_filter = request.args.get('ingredients', '').lower().strip()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 30, type=int)
    search = request.args.get('search', '').lower().strip()
    mode = request.args.get('mode', 'all')  # 'all' or 'matching'
    
    filtered = RECIPES
    
    # Filter by search term
    if search:
        filtered = [r for r in filtered if search in r['name'].lower()]
    
    # Filter by ingredients (match ANY ingredient)
    if ingredient_filter and mode == 'matching':
        user_ingredients = [i.strip() for i in ingredient_filter.split(',') if i.strip()]
        if user_ingredients:
            def matches_any(recipe):
                recipe_ings = ' '.join(recipe.get('ingredients', []))
                return any(ui in recipe_ings for ui in user_ingredients)
            filtered = [r for r in filtered if matches_any(r)]
    
    total = len(filtered)
    start = (page - 1) * per_page
    end = start + per_page
    page_recipes = filtered[start:end]
    
    # Count matching ingredients for each recipe
    if ingredient_filter:
        user_ingredients = [i.strip() for i in ingredient_filter.split(',') if i.strip()]
        for recipe in page_recipes:
            recipe_ings = ' '.join(recipe.get('ingredients', []))
            matching = [ui for ui in user_ingredients if ui in recipe_ings]
            recipe['matching_count'] = len(matching)
            recipe['matching_ingredients'] = matching
    
    return jsonify({
        'recipes': page_recipes,
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': math.ceil(total / per_page) if per_page > 0 else 0
    })


@app.route('/api/config', methods=['POST'])
def update_config():
    """Update ThingSpeak configuration at runtime."""
    global THINGSPEAK_CHANNEL_ID, THINGSPEAK_READ_API_KEY
    data = request.get_json()
    
    if 'channel_id' in data:
        THINGSPEAK_CHANNEL_ID = data['channel_id']
    if 'api_key' in data:
        THINGSPEAK_READ_API_KEY = data['api_key']
    
    return jsonify({'status': 'ok', 'channel_id': THINGSPEAK_CHANNEL_ID})


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def safe_float(val, default):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default

def safe_int(val, default):
    try:
        return int(float(val)) if val is not None else default
    except (ValueError, TypeError):
        return default

def make_prediction(temp, humidity, door, co, days_stored=0):
    """Make ML prediction with fallback to rule-based system."""
    labels = ['ideal', 'warning', 'spoilage']
    
    # Try ML model first
    ml_prediction = None
    if MODEL is not None:
        try:
            features = np.array([[temp, humidity, door, co]])
            pred_class = int(MODEL.predict(features)[0])
            proba = MODEL.predict_proba(features)[0].tolist()
            ml_prediction = {
                'class': labels[pred_class],
                'probabilities': {
                    'ideal': round(proba[0] * 100, 1),
                    'warning': round(proba[1] * 100, 1),
                    'spoilage': round(proba[2] * 100, 1)
                },
                'source': 'ml_model'
            }
        except Exception as e:
            print(f"[WARN] ML prediction failed: {e}")
    
    # Rule-based fallback using time stored
    time_prediction = get_time_based_prediction(days_stored)
    
    # Combine ML + time-based predictions
    if ml_prediction:
        # Weight: 60% ML, 40% time-based
        combined_probs = {
            'ideal': round(ml_prediction['probabilities']['ideal'] * 0.6 + time_prediction['probabilities']['ideal'] * 0.4, 1),
            'warning': round(ml_prediction['probabilities']['warning'] * 0.6 + time_prediction['probabilities']['warning'] * 0.4, 1),
            'spoilage': round(ml_prediction['probabilities']['spoilage'] * 0.6 + time_prediction['probabilities']['spoilage'] * 0.4, 1)
        }
        # Determine final class
        max_class = max(combined_probs, key=combined_probs.get)
        
        result = {
            'class': max_class,
            'probabilities': combined_probs,
            'ml_probabilities': ml_prediction['probabilities'],
            'time_probabilities': time_prediction['probabilities'],
            'source': 'combined',
            'days_stored': days_stored
        }
    else:
        # Pure rule-based fallback
        # Also check sensor thresholds
        sensor_spoilage = (temp > ALERT_THRESHOLDS['temp_danger'] or 
                          humidity > ALERT_THRESHOLDS['humidity_danger'] or 
                          co > ALERT_THRESHOLDS['co_danger'])
        
        if sensor_spoilage:
            result = {
                'class': 'spoilage',
                'probabilities': {'ideal': 5.0, 'warning': 15.0, 'spoilage': 80.0},
                'source': 'rule_sensor_threshold',
                'days_stored': days_stored
            }
        else:
            result = {
                'class': time_prediction['class'],
                'probabilities': time_prediction['probabilities'],
                'source': 'rule_time_based',
                'days_stored': days_stored
            }
    
    # Estimate days until spoilage
    spoilage_prob = result['probabilities']['spoilage']
    if spoilage_prob >= 50:
        est_days = max(0, round(1 - (spoilage_prob - 50) / 50, 1))
    elif spoilage_prob >= 20:
        est_days = round(3 - (spoilage_prob - 20) / 10, 1)
    else:
        est_days = round(7 - spoilage_prob / 5, 1)
    
    result['estimated_days_until_spoilage'] = max(0, est_days)
    
    return result


def get_time_based_prediction(days_stored):
    """Rule-based prediction based on time stored."""
    if days_stored < 1:
        probs = {'ideal': 95.0, 'warning': 5.0, 'spoilage': 0.0}
    elif days_stored < 4:
        probs = {'ideal': 80.0, 'warning': 15.0, 'spoilage': 5.0}
    elif days_stored < 7:
        probs = {'ideal': 70.0, 'warning': 20.0, 'spoilage': 10.0}
    elif days_stored < 10:
        probs = {'ideal': 50.0, 'warning': 35.0, 'spoilage': 15.0}
    else:
        probs = {'ideal': 30.0, 'warning': 35.0, 'spoilage': 35.0}
    
    max_class = max(probs, key=probs.get)
    return {'class': max_class, 'probabilities': probs}


# ============================================================
# MAIN
# ============================================================

if __name__ == '__main__':
    print("=" * 60)
    print("  Smart Fridge IoT Dashboard")
    print("  http://localhost:5000")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5000)
