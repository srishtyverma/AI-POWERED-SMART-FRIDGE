# IntelliFresh : AI Powered Smart Fridge with IoT (Dashboard)

A full-stack IoT monitoring dashboard for a smart fridge system that integrates **real-time sensor data** from ThingSpeak, **AI/ML-based spoilage prediction**, **inventory management**, and **recipe recommendations**.

Built with Flask, scikit-learn, Chart.js, and vanilla JavaScript.

---

## Features

### 1. Sensor Status Panel
- Real-time monitoring of **Temperature**, **Humidity**, **CO Gas**, and **Door Status** via ThingSpeak cloud
- Interactive history charts (Temperature & Humidity line chart, CO & Door event timeline)
- Auto-refresh every 10 seconds with fallback defaults when sensors are offline
- Visual status badges (Normal / Elevated / Critical) with color-coded glow effects

### 2. Inventory Management
- Add/remove food items with **quantity tracking**
- Live storage timer showing how long each item has been stored (days, hours, minutes)
- Automatic condition assessment: **Ideal** (green), **Warning** (yellow), **Spoilt** (red)
- Shopping List tab with restock recommendations and recipe-based purchase suggestions
- Data persisted via browser localStorage

### 3. AI/ML Predictions
- **Random Forest Classifier** trained on labeled sensor data (ideal, warning, spoilage conditions)
- Combined scoring: 60% ML model + 40% time-based heuristics for robust predictions
- Per-item probability bars and estimated days until spoilage
- Fallback rule-based detection when ML model is unavailable
- **Data Insights**: Condition distribution pie chart, Temperature vs Humidity scatter plot, Sensor ranges bar chart

### 4. Alerts & Notifications
- Automatic spoilage alerts when thresholds are breached (Temperature > 30°C, Humidity > 70%, CO > 15 ppm)
- Periodic shopping reminders (configurable, default: every 3 hours)
- Fridge cleaning reminders (configurable, default: every 10 days)
- Alert popup modal for critical conditions
- Dismissible alert history with badge counter

### 5. Recipe Recommendations
- **5,000 recipes** preprocessed from the Food.com dataset
- Recommended tab filters recipes matching your current inventory ingredients
- Expandable recipe cards with full steps, description, and prep time
- All Recipes tab with search and pagination (20 per page)
- Missing ingredient suggestions for top recommended recipes

### 6. Settings
- ThingSpeak connection configuration (Channel ID + Read API Key)
- Live connection status indicator
- Notification interval customization

### Design
- **Dual Theme**: Light mode (fresh green) & Dark mode (modern dark) with smooth toggle
- **Glassmorphism**: Frosted glass cards with `backdrop-filter: blur()`
- **Responsive**: Collapsible sidebar with mobile menu support
- **Micro-animations**: Ambient background gradients, panel transitions, pulse effects, hover states
- **Typography**: Inter + JetBrains Mono (Google Fonts)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.13, Flask 3.1 |
| ML Model | scikit-learn (RandomForestClassifier) |
| Data Processing | Pandas, NumPy |
| IoT Cloud | ThingSpeak REST API |
| Frontend | HTML5, CSS3 (vanilla), JavaScript (ES6+) |
| Charts | Chart.js 4.4.7 (CDN) |
| Persistence | localStorage (client-side) |

---

## Project Structure

```
aiotpro/
├── app.py                      # Flask backend (API endpoints, ThingSpeak proxy, ML inference)
├── train_model.py              # ML model training script
├── requirements.txt            # Python dependencies
├── README.md                   # This file
│
├── templates/
│   └── index.html              # Single-page application (6 panels)
│
├── static/
│   ├── style.css               # Design system (glassmorphic, light/dark themes)
│   └── app.js                  # Application logic (state management, API calls, rendering)
│
├── ideal.csv                   # Training data — ideal conditions
├── warning.csv                 # Training data — warning conditions
├── spoilage.csv                # Training data — spoilage conditions
├── RAW_recipes.csv             # Source recipe dataset (Food.com, ~280MB)
│
├── smart_fridge_model_v2.pkl   # Trained ML model (generated)
└── recipes_processed.json      # Preprocessed recipes (generated on first run)
```

---

## Setup & Installation

### Prerequisites
- Python 3.10 or higher
- pip (Python package manager)

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/smart-fridge-iot-dashboard.git
cd smart-fridge-iot-dashboard
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Train the ML model
```bash
python train_model.py
```
This reads `ideal.csv`, `warning.csv`, and `spoilage.csv` to train a Random Forest model and saves it as `smart_fridge_model_v2.pkl`.

### 4. Configure ThingSpeak (optional)
Edit `app.py` lines 23–24 with your ThingSpeak credentials:
```python
THINGSPEAK_CHANNEL_ID = "YOUR_CHANNEL_ID"
THINGSPEAK_READ_API_KEY = "YOUR_READ_API_KEY"
```
Or configure at runtime via the **Settings** panel in the dashboard.

> **Note:** The dashboard works without ThingSpeak — it falls back to safe default values (12°C, 50% humidity, 5.6 ppm CO, door closed).

### 5. Run the application
```bash
python app.py
```
Open **http://localhost:5000** in your browser.

---

## ThingSpeak Field Mapping

| Field | Sensor |
|-------|--------|
| field1 | Temperature (°C) |
| field2 | Humidity (%) |
| field3 | Door Status (0 = Closed, 1 = Open) |
| field4 | CO Gas (ppm) |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serves the dashboard |
| `/api/sensor-data` | GET | Returns live sensor data from ThingSpeak (with fallback) |
| `/api/predict` | POST | Single-item ML spoilage prediction |
| `/api/predict-batch` | POST | Batch predictions for all inventory items |
| `/api/csv-insights` | GET | Aggregated statistics from training CSVs for insight charts |
| `/api/recipes` | GET | Recipe listing with search, filtering, and pagination |
| `/api/config` | POST | Update ThingSpeak credentials at runtime |

---

## ML Model Details

- **Algorithm**: Random Forest Classifier (100 estimators)
- **Features**: Temperature, Humidity, Door Status, CO Gas Level
- **Classes**: `ideal`, `warning`, `spoilage`
- **Training Data**: 1,500 labeled samples (500 per class)
- **Accuracy**: 100% on test set (stratified 80/20 split)
- **Inference**: Combined 60% ML probability + 40% time-decay heuristic for production robustness

---

## Screenshots

### Model Images
<img width="1035" height="575" alt="model img" src="https://github.com/user-attachments/assets/4fc21ea2-6585-4391-a9cc-75cebca14c34" />

### Website Images
<img width="1018" height="579" alt="website imgs" src="https://github.com/user-attachments/assets/5eec2766-2c57-453a-9954-a6ecbee0e22d" />

<img width="1022" height="578" alt="website imgs -2" src="https://github.com/user-attachments/assets/4c311c06-d263-4042-a0fd-305e17cbeebf" />

<img width="943" height="430" alt="image" src="https://github.com/user-attachments/assets/e165fe00-7f16-49e7-8805-bd828efc6299" />


---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -m 'Add new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Open a Pull Request

---

## Acknowledgments

- [ThingSpeak](https://thingspeak.com/) — IoT cloud platform
- [Food.com Recipes Dataset](https://www.kaggle.com/shuyangli94/food-com-recipes-and-user-interactions) — Recipe data source
- [Chart.js](https://www.chartjs.org/) — Charting library
- [Google Fonts](https://fonts.google.com/) — Inter & JetBrains Mono typefaces
