/* ============================================================
   Smart Fridge IoT Dashboard — Application Logic
   ============================================================ */

// ============================================================
// STATE
// ============================================================
const state = {
    currentPanel: 'sensor',
    sensorData: { temperature: 12, humidity: 50, co: 5.6, door: 0 },
    sensorFeeds: [],
    connected: false,
    inventory: [],
    alerts: [],
    predictions: [],
    charts: {},
    insightsLoaded: false,
    recipePage: 1,
    recipePages: 1,
    thresholds: { temp: 30, humidity: 70, co: 15 },
    intervals: { buyHours: 3, cleanDays: 10 },
    lastBuyReminder: null,
    lastCleanReminder: null,
    alertPopupShown: {}
};

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadInventoryFromStorage();
    loadAlertsFromStorage();
    fetchSensorData();
    loadInsights();
    loadRecommendedRecipes();
    loadAllRecipes(1);

    // Fetch predictions at startup to sync inventory conditions with AI
    runPredictions();

    // Auto-refresh sensor data every 10 seconds
    setInterval(fetchSensorData, 10000);
    // Update inventory timers every second
    setInterval(updateInventoryTimers, 1000);
    // Re-sync predictions with inventory every 60 seconds
    setInterval(runPredictions, 60000);
    // Check periodic notifications every 60 seconds
    setInterval(checkPeriodicNotifications, 60000);
    // Initial periodic check
    setTimeout(checkPeriodicNotifications, 3000);
});

// ============================================================
// PANEL NAVIGATION
// ============================================================
function switchPanel(panelId) {
    state.currentPanel = panelId;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.panel === panelId);
    });

    // Update panels
    document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `panel-${panelId}`);
    });

    // Load content on demand
    if (panelId === 'prediction') {
        runPredictions();
        if (!state.insightsLoaded) loadInsights();
    }
    if (panelId === 'recipes') {
        loadRecommendedRecipes();
    }

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ============================================================
// TAB SYSTEM
// ============================================================
function switchTab(prefix, tabId, btn) {
    // Update tab buttons
    btn.closest('.tab-bar').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Update tab contents - find sibling tab-contents
    const panel = btn.closest('.panel');
    panel.querySelectorAll(`.tab-content[id^="${prefix}-"]`).forEach(tc => {
        tc.classList.toggle('active', tc.id === `${prefix}-${tabId}`);
    });
}

// ============================================================
// THEME TOGGLE
// ============================================================
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('smartfridge-theme', next);
}

// Load saved theme
(function() {
    const saved = localStorage.getItem('smartfridge-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
})();

// ============================================================
// SENSOR DATA FETCHING
// ============================================================
async function fetchSensorData() {
    try {
        const resp = await fetch('/api/sensor-data?results=50');
        const data = await resp.json();

        state.sensorData = data.current;
        state.sensorFeeds = data.feeds;
        state.connected = data.connected;

        updateSensorUI();
        updateConnectionStatus(data.connected);
        updateSensorCharts();

        // Check for alerts from server
        if (data.alerts && data.alerts.length > 0) {
            data.alerts.forEach(alert => {
                const key = alert.message;
                if (!state.alertPopupShown[key]) {
                    showAlertPopup(alert.type === 'danger' ? '🚨' : '⚠️',
                        alert.type === 'danger' ? 'Spoilage Alert!' : 'Warning',
                        alert.message);
                    addAlert(alert.type, alert.type === 'danger' ? 'Spoilage Alert' : 'Warning', alert.message);
                    state.alertPopupShown[key] = true;
                    // Reset after 5 minutes
                    setTimeout(() => { delete state.alertPopupShown[key]; }, 300000);
                }
            });
        }

        document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
    } catch (err) {
        console.error('Sensor fetch error:', err);
        updateConnectionStatus(false);
    }
}

function updateSensorUI() {
    const d = state.sensorData;
    const th = state.thresholds;

    // Temperature
    const tempStatus = d.temperature > th.temp ? 'danger' : d.temperature > (th.temp * 0.6) ? 'warning' : 'safe';
    updateSensorCard('sensorTemp', 'tempValue', 'tempBadge', d.temperature.toFixed(1), tempStatus);

    // Humidity
    const humStatus = d.humidity > th.humidity ? 'danger' : d.humidity > (th.humidity * 0.85) ? 'warning' : 'safe';
    updateSensorCard('sensorHumidity', 'humidityValue', 'humidityBadge', d.humidity.toFixed(1), humStatus);

    // CO
    const coStatus = d.co > th.co ? 'danger' : d.co > (th.co * 0.6) ? 'warning' : 'safe';
    updateSensorCard('sensorCO', 'coValue', 'coBadge', d.co.toFixed(1), coStatus);

    // Door
    const doorOpen = d.door === 1;
    const doorEl = document.getElementById('sensorDoor');
    const doorVal = document.getElementById('doorValue');
    const doorBadge = document.getElementById('doorBadge');
    const doorVisual = document.getElementById('doorVisual');

    doorEl.className = `glass-card sensor-card ${doorOpen ? 'status-warning' : 'status-safe'}`;
    doorVal.textContent = doorOpen ? 'Open' : 'Closed';
    doorVal.className = `sensor-value ${doorOpen ? 'warning' : 'safe'}`;
    doorBadge.textContent = doorOpen ? 'Open' : 'Secure';
    doorBadge.className = `sensor-status-badge ${doorOpen ? 'warning' : 'safe'}`;
    doorVisual.className = `door-visual ${doorOpen ? 'open' : 'closed'}`;
}

function updateSensorCard(cardId, valueId, badgeId, value, status) {
    const card = document.getElementById(cardId);
    const valueEl = document.getElementById(valueId);
    const badge = document.getElementById(badgeId);

    card.className = `glass-card sensor-card status-${status}`;
    valueEl.textContent = value;
    valueEl.className = `sensor-value ${status}`;

    const labels = { safe: 'Normal', warning: 'Elevated', danger: 'Critical' };
    badge.textContent = labels[status];
    badge.className = `sensor-status-badge ${status}`;
}

function updateConnectionStatus(connected) {
    const el = document.getElementById('connectionStatus');
    const text = document.getElementById('connectionText');
    el.className = `connection-status ${connected ? '' : 'disconnected'}`;
    text.textContent = connected ? 'ThingSpeak Connected' : 'Using Defaults';
}

// ============================================================
// SENSOR CHARTS
// ============================================================
function updateSensorCharts() {
    const feeds = state.sensorFeeds;
    if (feeds.length === 0) return;

    const labels = feeds.map((f, i) => {
        if (f.created_at) {
            const d = new Date(f.created_at);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return `#${i + 1}`;
    });
    const temps = feeds.map(f => f.temperature);
    const humids = feeds.map(f => f.humidity);
    const cos = feeds.map(f => f.co);
    const doors = feeds.map(f => f.door);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'top', labels: { usePointStyle: true, padding: 16, font: { size: 11 } } }
        },
        scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 10 } } },
            y: { grid: { color: 'rgba(135,133,162,0.08)' }, ticks: { font: { size: 10 } } }
        }
    };

    // Temp & Humidity Chart
    if (state.charts.tempHumid) state.charts.tempHumid.destroy();
    state.charts.tempHumid = new Chart(document.getElementById('tempHumidChart'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: temps,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231,76,60,0.1)',
                    borderWidth: 2,
                    pointRadius: 1,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Humidity (%)',
                    data: humids,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52,152,219,0.1)',
                    borderWidth: 2,
                    pointRadius: 1,
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: chartOptions
    });

    // CO & Door Chart
    if (state.charts.coDoor) state.charts.coDoor.destroy();
    state.charts.coDoor = new Chart(document.getElementById('coDoorChart'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'CO Gas (ppm)',
                    data: cos,
                    borderColor: '#9b59b6',
                    backgroundColor: 'rgba(155,89,182,0.1)',
                    borderWidth: 2,
                    pointRadius: 1,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Door (0=Closed, 1=Open)',
                    data: doors,
                    borderColor: '#f39c12',
                    backgroundColor: 'rgba(243,156,18,0.15)',
                    borderWidth: 2,
                    pointRadius: 2,
                    fill: true,
                    stepped: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            ...chartOptions,
            scales: {
                ...chartOptions.scales,
                y: { ...chartOptions.scales.y, position: 'left' },
                y1: { position: 'right', grid: { display: false }, min: 0, max: 1.5, ticks: { stepSize: 1, font: { size: 10 } } }
            }
        }
    });
}

// ============================================================
// INVENTORY MANAGEMENT
// ============================================================
function addInventoryItem() {
    const input = document.getElementById('addItemInput');
    const qtyInput = document.getElementById('addItemQty');
    const name = input.value.trim();
    if (!name) return;

    const qty = Math.max(1, parseInt(qtyInput.value) || 1);

    const item = {
        id: Date.now().toString(),
        name: name,
        quantity: qty,
        addedAt: new Date().toISOString(),
        condition: 'ideal'
    };

    state.inventory.push(item);
    saveInventoryToStorage();
    renderInventory();
    input.value = '';
    qtyInput.value = '1';

    addAlert('success', 'Item Added', `"${name}" (x${qty}) has been added to your inventory.`);
}

function removeInventoryItem(id) {
    const item = state.inventory.find(i => i.id === id);
    state.inventory = state.inventory.filter(i => i.id !== id);
    saveInventoryToStorage();
    renderInventory();
    if (item) addAlert('info', 'Item Removed', `"${item.name}" removed from inventory.`);
}

function getItemDaysStored(item) {
    const added = new Date(item.addedAt);
    const now = new Date();
    return (now - added) / (1000 * 60 * 60 * 24);
}

function getItemCondition(item) {
    // Use cached prediction data if available (synced with AI predictions)
    if (item._predictedCondition) {
        return item._predictedCondition;
    }

    // Fallback: use a simplified rule-based approach consistent with the ML model's logic
    const days = getItemDaysStored(item);
    if (days < 1) return 'ideal';
    if (days < 4) return 'ideal';
    if (days < 7) return 'ideal';
    if (days < 10) return 'warning';
    return 'spoilt';
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function renderInventory() {
    const list = document.getElementById('inventoryList');
    let idealCount = 0, warningCount = 0, spoiltCount = 0;

    if (state.inventory.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">No items in inventory. Add items above to start tracking!</div></div>`;
        updateInventoryStats(0, 0, 0, 0);
        updateShoppingList();
        return;
    }

    const vegEmojis = {
        'tomato': '🍅', 'potato': '🥔', 'carrot': '🥕', 'onion': '🧅', 'lettuce': '🥬',
        'broccoli': '🥦', 'corn': '🌽', 'pepper': '🌶️', 'cucumber': '🥒', 'garlic': '🧄',
        'mushroom': '🍄', 'eggplant': '🍆', 'avocado': '🥑', 'apple': '🍎', 'banana': '🍌',
        'grape': '🍇', 'orange': '🍊', 'lemon': '🍋', 'strawberry': '🍓', 'watermelon': '🍉',
        'milk': '🥛', 'cheese': '🧀', 'egg': '🥚', 'eggs': '🥚', 'bread': '🍞',
        'meat': '🥩', 'chicken': '🍗', 'fish': '🐟', 'butter': '🧈', 'rice': '🍚',
        'bean': '🫘', 'pea': '🟢', 'spinach': '🥬', 'cabbage': '🥬', 'default': '🥗'
    };

    function getEmoji(name) {
        const lower = name.toLowerCase();
        for (const [key, emoji] of Object.entries(vegEmojis)) {
            if (lower.includes(key)) return emoji;
        }
        return vegEmojis.default;
    }

    list.innerHTML = state.inventory.map(item => {
        const condition = getItemCondition(item);
        const elapsed = Date.now() - new Date(item.addedAt).getTime();
        const condLabels = { ideal: 'Ideal', warning: 'Warning', spoilt: 'Spoilt' };
        const glowClass = condition === 'spoilt' ? 'glow-danger' : condition === 'warning' ? 'glow-warning' : 'glow-safe';

        if (condition === 'ideal') idealCount++;
        else if (condition === 'warning') warningCount++;
        else spoiltCount++;

        const qty = item.quantity || 1;
        return `
            <div class="inventory-item status-${condition === 'spoilt' ? 'danger' : condition === 'warning' ? 'warning' : 'safe'} ${glowClass}" data-id="${item.id}">
                <span class="inventory-item-icon">${getEmoji(item.name)}</span>
                <div class="inventory-item-info">
                    <div class="inventory-item-name">${escapeHtml(item.name)} <span style="font-weight:400;color:var(--text-tertiary);font-size:12px;">x${qty}</span></div>
                    <div class="inventory-item-time" data-added="${item.addedAt}">Stored: ${formatDuration(elapsed)}</div>
                </div>
                <span class="inventory-item-condition ${condition}">${condLabels[condition]}</span>
                <button class="inventory-item-remove" onclick="removeInventoryItem('${item.id}')" title="Remove item">✕</button>
            </div>
        `;
    }).join('');

    updateInventoryStats(state.inventory.length, idealCount, warningCount, spoiltCount);
    updateShoppingList();
}

function updateInventoryStats(total, ideal, warning, spoilt) {
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statIdeal').textContent = ideal;
    document.getElementById('statWarning').textContent = warning;
    document.getElementById('statSpoilt').textContent = spoilt;

    // Update alert badge
    const badge = document.getElementById('alertBadge');
    const alertCount = state.alerts.length;
    if (alertCount > 0) {
        badge.style.display = 'inline';
        badge.textContent = alertCount > 99 ? '99+' : alertCount;
    } else {
        badge.style.display = 'none';
    }
}

function updateInventoryTimers() {
    document.querySelectorAll('.inventory-item-time[data-added]').forEach(el => {
        const added = new Date(el.dataset.added).getTime();
        const elapsed = Date.now() - added;
        el.textContent = `Stored: ${formatDuration(elapsed)}`;
    });
}

function updateShoppingList() {
    // Items going out of stock (warning or spoilt)
    const restockList = state.inventory.filter(item => {
        const cond = getItemCondition(item);
        return cond === 'warning' || cond === 'spoilt';
    });

    const restockEl = document.getElementById('shoppingRestock');
    if (restockList.length === 0) {
        restockEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">All items are in good condition!</div></div>`;
    } else {
        restockEl.innerHTML = restockList.map(item => {
            const cond = getItemCondition(item);
            const qty = item.quantity || 1;
            return `<div class="shopping-item">
                <span class="shopping-item-type restock">${cond === 'spoilt' ? 'Replace' : 'Restock Soon'}</span>
                <span>${escapeHtml(item.name)} <span style="color:var(--text-tertiary);font-size:11px;">x${qty}</span></span>
                <span style="margin-left:auto;font-size:11px;color:var(--text-tertiary)">${getItemDaysStored(item).toFixed(1)} days stored</span>
            </div>`;
        }).join('');
    }
}

// ============================================================
// AI/ML PREDICTIONS
// ============================================================
async function runPredictions() {
    if (state.inventory.length === 0) {
        document.getElementById('predictionGrid').innerHTML = `<div class="empty-state"><div class="empty-state-icon">🤖</div><div class="empty-state-text">Add items to inventory to see AI predictions.</div></div>`;
        return;
    }

    const items = state.inventory.map(item => ({
        name: item.name,
        days_stored: getItemDaysStored(item)
    }));

    try {
        const resp = await fetch('/api/predict-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, sensor: state.sensorData })
        });
        const data = await resp.json();
        state.predictions = data.predictions;
        syncInventoryWithPredictions();
        renderPredictions();
    } catch (err) {
        console.error('Prediction error:', err);
        // Use fallback
        state.predictions = items.map(item => {
            const pred = getFallbackPrediction(item.days_stored);
            return { ...pred, item_name: item.name, days_stored: item.days_stored };
        });
        syncInventoryWithPredictions();
        renderPredictions();
    }
}

function syncInventoryWithPredictions() {
    /**
     * Sync each inventory item's condition with the AI prediction result.
     * This ensures the inventory panel and AI predictions panel always agree.
     */
    if (!state.predictions || state.predictions.length === 0) return;

    state.inventory.forEach(item => {
        const pred = state.predictions.find(
            p => p.item_name.toLowerCase() === item.name.toLowerCase()
        );
        if (pred) {
            // Map ML class names to inventory condition names
            const classToCondition = {
                'ideal': 'ideal',
                'warning': 'warning',
                'spoilage': 'spoilt'
            };
            item._predictedCondition = classToCondition[pred.class] || 'warning';
        }
    });

    // Re-render inventory to reflect synced conditions
    renderInventory();
}

function getFallbackPrediction(daysStored) {
    let probs;
    if (daysStored < 1) probs = { ideal: 95, warning: 5, spoilage: 0 };
    else if (daysStored < 4) probs = { ideal: 80, warning: 15, spoilage: 5 };
    else if (daysStored < 7) probs = { ideal: 70, warning: 20, spoilage: 10 };
    else if (daysStored < 10) probs = { ideal: 50, warning: 35, spoilage: 15 };
    else probs = { ideal: 30, warning: 35, spoilage: 35 };

    const maxKey = Object.keys(probs).reduce((a, b) => probs[a] > probs[b] ? a : b);
    const estDays = probs.spoilage >= 50 ? 0 : probs.spoilage >= 20 ? 2 : 5;

    return {
        class: maxKey,
        probabilities: probs,
        estimated_days_until_spoilage: estDays,
        source: 'fallback'
    };
}

function renderPredictions() {
    const grid = document.getElementById('predictionGrid');

    grid.innerHTML = state.predictions.map(pred => {
        const p = pred.probabilities;
        const daysClass = pred.estimated_days_until_spoilage <= 1 ? 'danger' :
                         pred.estimated_days_until_spoilage <= 3 ? 'warning' : 'safe';

        return `
            <div class="prediction-item">
                <div class="prediction-item-info">
                    <div class="prediction-item-name">${escapeHtml(pred.item_name)}</div>
                    <div class="prediction-item-detail">
                        Stored ${pred.days_stored ? pred.days_stored.toFixed(1) : '0'} days
                        &bull; Status: <strong style="color:var(--status-${pred.class === 'spoilage' ? 'danger' : pred.class === 'warning' ? 'warning' : 'safe'})">${pred.class.toUpperCase()}</strong>
                        &bull; Source: ${pred.source || 'ml'}
                    </div>
                </div>
                <div>
                    <div class="prediction-bar">
                        <div class="prediction-bar-segment ideal" style="width:${p.ideal}%"></div>
                        <div class="prediction-bar-segment warning" style="width:${p.warning}%"></div>
                        <div class="prediction-bar-segment spoilage" style="width:${p.spoilage}%"></div>
                    </div>
                    <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;display:flex;justify-content:space-between;font-family:var(--font-mono);">
                        <span style="color:var(--status-safe)">${p.ideal}%</span>
                        <span style="color:var(--status-warning)">${p.warning}%</span>
                        <span style="color:var(--status-danger)">${p.spoilage}%</span>
                    </div>
                </div>
                <div class="prediction-days ${daysClass}">
                    ${pred.estimated_days_until_spoilage.toFixed(1)}
                    <small>days left</small>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// DATA INSIGHTS (Charts from CSV data)
// ============================================================
async function loadInsights() {
    try {
        const resp = await fetch('/api/csv-insights');
        const data = await resp.json();
        state.insightsLoaded = true;
        renderInsightCharts(data);
    } catch (err) {
        console.error('Insights error:', err);
    }
}

function renderInsightCharts(data) {
    // Pie Chart — Distribution
    if (state.charts.pie) state.charts.pie.destroy();
    state.charts.pie = new Chart(document.getElementById('pieChart'), {
        type: 'doughnut',
        data: {
            labels: ['Ideal', 'Warning', 'Spoilage'],
            datasets: [{
                data: [data.distribution.ideal, data.distribution.warning, data.distribution.spoilage],
                backgroundColor: ['#2ecc71', '#f39c12', '#e74c3c'],
                borderWidth: 0,
                spacing: 4,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 12 } } }
            }
        }
    });

    // Heatmap (scatter plot of temp vs humidity)
    if (state.charts.heatmap) state.charts.heatmap.destroy();
    const heatmapDatasets = [];
    const heatColors = { ideal: '#2ecc71', warning: '#f39c12', spoilage: '#e74c3c' };
    for (const label of ['ideal', 'warning', 'spoilage']) {
        if (data.heatmap[label]) {
            const temps = data.heatmap[label].temps;
            const humids = data.heatmap[label].humids;
            heatmapDatasets.push({
                label: label.charAt(0).toUpperCase() + label.slice(1),
                data: temps.map((t, i) => ({ x: t, y: humids[i] })),
                backgroundColor: heatColors[label] + '66',
                borderColor: heatColors[label],
                borderWidth: 1,
                pointRadius: 4,
                pointHoverRadius: 6
            });
        }
    }

    state.charts.heatmap = new Chart(document.getElementById('heatmapChart'), {
        type: 'scatter',
        data: { datasets: heatmapDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 11 } } }
            },
            scales: {
                x: { title: { display: true, text: 'Temperature (°C)', font: { size: 11 } }, grid: { color: 'rgba(135,133,162,0.08)' } },
                y: { title: { display: true, text: 'Humidity (%)', font: { size: 11 } }, grid: { color: 'rgba(135,133,162,0.08)' } }
            }
        }
    });

    // Bar Chart — Sensor ranges
    if (state.charts.bar) state.charts.bar.destroy();
    const stats = data.stats;
    if (stats.ideal && stats.warning && stats.spoilage) {
        state.charts.bar = new Chart(document.getElementById('barChart'), {
            type: 'bar',
            data: {
                labels: ['Temp Avg (°C)', 'Humidity Avg (%)', 'CO Avg (ppm)', 'Door Open (%)'],
                datasets: [
                    {
                        label: 'Ideal',
                        data: [stats.ideal.temp.avg, stats.ideal.humidity.avg, stats.ideal.co.avg, stats.ideal.door_open_pct],
                        backgroundColor: '#2ecc71aa',
                        borderColor: '#2ecc71',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Warning',
                        data: [stats.warning.temp.avg, stats.warning.humidity.avg, stats.warning.co.avg, stats.warning.door_open_pct],
                        backgroundColor: '#f39c12aa',
                        borderColor: '#f39c12',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Spoilage',
                        data: [stats.spoilage.temp.avg, stats.spoilage.humidity.avg, stats.spoilage.co.avg, stats.spoilage.door_open_pct],
                        backgroundColor: '#e74c3caa',
                        borderColor: '#e74c3c',
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 11 } } }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: 'rgba(135,133,162,0.08)' } }
                }
            }
        });
    }
}

// ============================================================
// ALERTS & NOTIFICATIONS
// ============================================================
function addAlert(type, title, message) {
    const alert = {
        id: Date.now().toString(),
        type, // 'danger', 'warning', 'info', 'success'
        title,
        message,
        time: new Date().toISOString(),
        read: false
    };
    state.alerts.unshift(alert);
    if (state.alerts.length > 100) state.alerts = state.alerts.slice(0, 100);
    saveAlertsToStorage();
    renderAlerts();
}

function dismissAlert(id) {
    state.alerts = state.alerts.filter(a => a.id !== id);
    saveAlertsToStorage();
    renderAlerts();
}

function clearAllAlerts() {
    state.alerts = [];
    saveAlertsToStorage();
    renderAlerts();
}

function renderAlerts() {
    const list = document.getElementById('alertsList');
    const badge = document.getElementById('alertBadge');

    if (state.alerts.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔔</div><div class="empty-state-text">No notifications yet. Alerts will appear here automatically.</div></div>`;
        badge.style.display = 'none';
        return;
    }

    badge.style.display = 'inline';
    badge.textContent = state.alerts.length > 99 ? '99+' : state.alerts.length;

    const icons = { danger: '🚨', warning: '⚠️', info: 'ℹ️', success: '✅' };

    list.innerHTML = state.alerts.map(alert => `
        <div class="alert-item ${alert.type}">
            <span class="alert-icon">${icons[alert.type] || 'ℹ️'}</span>
            <div class="alert-content">
                <div class="alert-title">${escapeHtml(alert.title)}</div>
                <div class="alert-message">${escapeHtml(alert.message)}</div>
                <div class="alert-time">${new Date(alert.time).toLocaleString()}</div>
            </div>
            <button class="alert-dismiss" onclick="dismissAlert('${alert.id}')" title="Dismiss">✕</button>
        </div>
    `).join('');
}

function checkPeriodicNotifications() {
    const now = Date.now();

    // Buy reminder every N hours
    const buyInterval = state.intervals.buyHours * 60 * 60 * 1000;
    if (!state.lastBuyReminder || (now - state.lastBuyReminder) > buyInterval) {
        // Check if any items need restocking
        const warningItems = state.inventory.filter(i => getItemCondition(i) !== 'ideal');
        if (warningItems.length > 0) {
            addAlert('info', 'Shopping Reminder', `${warningItems.length} item(s) may need restocking: ${warningItems.map(i => i.name).join(', ')}`);
        } else if (state.inventory.length > 0) {
            addAlert('info', 'Shopping Reminder', 'All items are fresh! Consider checking your fridge inventory.');
        }
        state.lastBuyReminder = now;
        localStorage.setItem('smartfridge-lastBuy', now.toString());
    }

    // Clean fridge reminder every N days
    const cleanInterval = state.intervals.cleanDays * 24 * 60 * 60 * 1000;
    const lastClean = parseInt(localStorage.getItem('smartfridge-lastClean') || '0');
    if (!lastClean || (now - lastClean) > cleanInterval) {
        addAlert('info', 'Maintenance Reminder', 'It\'s time to clean your fridge! Regular cleaning prevents bacterial growth and odors.');
        localStorage.setItem('smartfridge-lastClean', now.toString());
    }
}

// Alert Popup
function showAlertPopup(icon, title, message) {
    document.getElementById('alertPopupIcon').textContent = icon;
    document.getElementById('alertPopupTitle').textContent = title;
    document.getElementById('alertPopupMessage').textContent = message;
    document.getElementById('alertPopup').classList.add('show');
}

function dismissAlertPopup() {
    document.getElementById('alertPopup').classList.remove('show');
}

// ============================================================
// RECIPE RECOMMENDATIONS
// ============================================================
async function loadRecommendedRecipes() {
    const container = document.getElementById('recommendedRecipes');

    if (state.inventory.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🍳</div><div class="empty-state-text">Add items to your inventory to see recipe recommendations.</div></div>`;
        return;
    }

    container.innerHTML = '<div class="spinner"></div>';

    const ingredients = state.inventory.map(i => i.name.toLowerCase()).join(',');

    try {
        const resp = await fetch(`/api/recipes?ingredients=${encodeURIComponent(ingredients)}&mode=matching&per_page=20`);
        const data = await resp.json();

        if (data.recipes.length === 0) {
            container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">No matching recipes found. Try adding more items to your inventory.</div></div>`;
            return;
        }

        container.innerHTML = data.recipes.map(recipe => renderRecipeCard(recipe, true)).join('');

        // Also update shopping suggestions
        updateRecipeShoppingSuggestions(data.recipes);
    } catch (err) {
        console.error('Recipe load error:', err);
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">Failed to load recipes. Please try again.</div></div>`;
    }
}

async function loadAllRecipes(page) {
    const container = document.getElementById('allRecipesList');
    const search = document.getElementById('recipeSearch')?.value || '';

    container.innerHTML = '<div class="spinner"></div>';
    state.recipePage = page;

    try {
        const resp = await fetch(`/api/recipes?page=${page}&per_page=20&search=${encodeURIComponent(search)}`);
        const data = await resp.json();
        state.recipePages = data.total_pages;

        if (data.recipes.length === 0) {
            container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📚</div><div class="empty-state-text">No recipes found.</div></div>`;
        } else {
            container.innerHTML = data.recipes.map(recipe => renderRecipeCard(recipe, false)).join('');
        }

        renderPagination(data.page, data.total_pages);
    } catch (err) {
        console.error('All recipes error:', err);
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">Failed to load recipes.</div></div>`;
    }
}

function searchAllRecipes() {
    loadAllRecipes(1);
}

function renderRecipeCard(recipe, showMatching) {
    const foodEmojis = ['🍲', '🥘', '🍛', '🍜', '🥗', '🍝', '🫕', '🥙', '🌮', '🍕'];
    const emoji = foodEmojis[recipe.id % foodEmojis.length];

    const ingredients = (recipe.ingredients || []).slice(0, 8);
    const matchedIngs = recipe.matching_ingredients || [];

    const ingredientTags = ingredients.map(ing => {
        const isMatched = matchedIngs.some(mi => ing.includes(mi));
        return `<span class="recipe-ingredient-tag ${isMatched ? 'matched' : ''}">${escapeHtml(ing)}</span>`;
    }).join('');

    const extraCount = (recipe.ingredients || []).length - 8;
    const extraTag = extraCount > 0 ? `<span class="recipe-ingredient-tag">+${extraCount} more</span>` : '';

    return `
        <div class="recipe-card" id="recipe-${recipe.id}" onclick="toggleRecipe(${recipe.id})">
            <div class="recipe-card-header">
                <span class="recipe-card-icon">${emoji}</span>
                <div class="recipe-card-info">
                    <div class="recipe-card-name">${escapeHtml(recipe.name)}</div>
                    <div class="recipe-card-meta">
                        ${recipe.minutes ? `<span>⏱ ${recipe.minutes} min</span>` : ''}
                        <span>🧂 ${recipe.n_ingredients} ingredients</span>
                        ${showMatching && recipe.matching_count ? `<span style="color:var(--status-safe);font-weight:600">✓ ${recipe.matching_count} matched</span>` : ''}
                    </div>
                </div>
                <span class="recipe-card-expand">▼</span>
            </div>
            <div class="recipe-card-ingredients">${ingredientTags}${extraTag}</div>
            <div class="recipe-card-body">
                ${recipe.description ? `<div class="recipe-description">${escapeHtml(recipe.description)}</div>` : ''}
                <h4 style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--text-primary)">Steps:</h4>
                <ol class="recipe-steps">
                    ${(recipe.steps || []).map(step => `<li>${escapeHtml(step)}</li>`).join('')}
                </ol>
            </div>
        </div>
    `;
}

function toggleRecipe(id) {
    const card = document.getElementById(`recipe-${id}`);
    if (card) card.classList.toggle('expanded');
}

function renderPagination(current, total) {
    const container = document.getElementById('recipePagination');
    if (total <= 1) { container.innerHTML = ''; return; }

    let html = '';
    html += `<button class="btn btn-secondary btn-sm" ${current <= 1 ? 'disabled' : ''} onclick="loadAllRecipes(${current - 1})">‹</button>`;

    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);

    if (start > 1) html += `<button class="btn btn-secondary btn-sm" onclick="loadAllRecipes(1)">1</button>`;
    if (start > 2) html += `<span class="pagination-info">...</span>`;

    for (let i = start; i <= end; i++) {
        html += `<button class="btn ${i === current ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="loadAllRecipes(${i})">${i}</button>`;
    }

    if (end < total - 1) html += `<span class="pagination-info">...</span>`;
    if (end < total) html += `<button class="btn btn-secondary btn-sm" onclick="loadAllRecipes(${total})">${total}</button>`;

    html += `<button class="btn btn-secondary btn-sm" ${current >= total ? 'disabled' : ''} onclick="loadAllRecipes(${current + 1})">›</button>`;
    html += `<span class="pagination-info">Page ${current} of ${total}</span>`;

    container.innerHTML = html;
}

function updateRecipeShoppingSuggestions(recipes) {
    const container = document.getElementById('shoppingRecipe');
    if (!recipes || recipes.length === 0) return;

    const inventoryNames = state.inventory.map(i => i.name.toLowerCase());
    const suggestions = new Map();

    // For each recommended recipe, find ingredients NOT in inventory
    recipes.slice(0, 5).forEach(recipe => {
        (recipe.ingredients || []).forEach(ing => {
            const isOwned = inventoryNames.some(inv => ing.includes(inv) || inv.includes(ing));
            if (!isOwned && !suggestions.has(ing)) {
                suggestions.set(ing, recipe.name);
            }
        });
    });

    if (suggestions.size === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✨</div><div class="empty-state-text">You have everything you need!</div></div>`;
        return;
    }

    const items = Array.from(suggestions.entries()).slice(0, 15);
    container.innerHTML = items.map(([ing, recipeName]) => `
        <div class="shopping-item">
            <span class="shopping-item-type recipe">Recipe</span>
            <span>${escapeHtml(ing)}</span>
            <span style="margin-left:auto;font-size:11px;color:var(--text-tertiary)">for: ${escapeHtml(recipeName.substring(0, 30))}</span>
        </div>
    `).join('');
}

// ============================================================
// SETTINGS
// ============================================================
function saveSettings() {
    const channelId = document.getElementById('settingChannelId').value.trim();
    const apiKey = document.getElementById('settingApiKey').value.trim();

    if (channelId || apiKey) {
        fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_id: channelId, api_key: apiKey })
        }).then(() => {
            addAlert('success', 'Settings Saved', 'ThingSpeak configuration updated successfully.');
            fetchSensorData();
        }).catch(err => {
            addAlert('danger', 'Settings Error', 'Failed to save settings: ' + err.message);
        });
    }

    // Save intervals
    state.intervals.buyHours = parseFloat(document.getElementById('settingBuyInterval').value) || 3;
    state.intervals.cleanDays = parseFloat(document.getElementById('settingCleanInterval').value) || 10;

    addAlert('success', 'Settings Updated', 'All settings have been saved.');
}

// ============================================================
// LOCAL STORAGE
// ============================================================
function saveInventoryToStorage() {
    localStorage.setItem('smartfridge-inventory', JSON.stringify(state.inventory));
}

function loadInventoryFromStorage() {
    try {
        const saved = localStorage.getItem('smartfridge-inventory');
        if (saved) state.inventory = JSON.parse(saved);
    } catch (e) {}
    renderInventory();
}

function saveAlertsToStorage() {
    localStorage.setItem('smartfridge-alerts', JSON.stringify(state.alerts));
}

function loadAlertsFromStorage() {
    try {
        const saved = localStorage.getItem('smartfridge-alerts');
        if (saved) state.alerts = JSON.parse(saved);
    } catch (e) {}
    renderAlerts();

    // Load last reminder timestamps
    state.lastBuyReminder = parseInt(localStorage.getItem('smartfridge-lastBuy') || '0') || null;
}

// ============================================================
// UTILITIES
// ============================================================
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
