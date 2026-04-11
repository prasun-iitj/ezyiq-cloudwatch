// =============================================================================
// EzyIQ CloudWatch Dashboard — Main Application Logic
// =============================================================================

const state = {
    polling: true,
    pollingInterval: 5000,
    activeScenario: 'normal',
    activeContentTab: 'metrics',
    sparklineHistory: {},
    latestMetrics: null,
    latestLogs: null,
    latestAnalysis: null,
    chartInstances: {},
};

let pollingTimerId = null;

// ---------------------------------------------------------------------------
// Severity Thresholds
// ---------------------------------------------------------------------------
const THRESHOLDS = {
    cpu_percent:    { warning: 70, critical: 90 },
    memory_percent: { warning: 70, critical: 85 },
    disk_percent:   { warning: 80, critical: 90 },
};

const SEVERITY_ORDER = { normal: 0, warning: 1, critical: 2 };

function getSeverity(metricKey, value) {
    var t = THRESHOLDS[metricKey];
    if (!t) return 'normal';
    if (value > t.critical) return 'critical';
    if (value >= t.warning) return 'warning';
    return 'normal';
}

function getMaxSeverity(severities) {
    var max = 'normal';
    for (var i = 0; i < severities.length; i++) {
        if ((SEVERITY_ORDER[severities[i]] || 0) > (SEVERITY_ORDER[max] || 0)) {
            max = severities[i];
        }
    }
    return max;
}

// ---------------------------------------------------------------------------
// Unit formatting
// ---------------------------------------------------------------------------
var UNIT_MAP = {
    cpu_percent: '%', memory_percent: '%', disk_percent: '%',
    net_sent_mb: ' MB', net_recv_mb: ' MB',
    response_latency: ' ms', error_rate: '%', connections: '',
};

function formatMetricValue(key, value) {
    if (value == null) return '--';
    var num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return '--';
    var suffix = UNIT_MAP[key];
    if (suffix !== undefined) {
        return (key === 'connections' ? Math.round(num) : num.toFixed(1)) + suffix;
    }
    return num.toFixed(1);
}

// ---------------------------------------------------------------------------
// Simulated metrics for AWS (not all come from CloudWatch)
// ---------------------------------------------------------------------------
function generateSimulatedMetrics(scenario) {
    var isCpuSpike = scenario === 'cpu_spike';
    var isStress = scenario && scenario !== 'normal';
    return {
        response_latency: (isCpuSpike ? 300 : 50) + Math.random() * (isCpuSpike ? 200 : 450),
        error_rate: Math.random() * (isStress ? 15 : 5),
        connections: 100 + Math.random() * 500,
    };
}

// ---------------------------------------------------------------------------
// Metric Card Rendering (source-aware)
// ---------------------------------------------------------------------------
function renderMetricCards(data) {
    if (!data) return;
    var localMetrics = data.local || {};
    var awsMetrics = data.aws || {};
    var simulated = generateSimulatedMetrics(state.activeScenario);

    // Merge simulated into AWS
    awsMetrics.response_latency = simulated.response_latency;
    awsMetrics.error_rate = simulated.error_rate;
    awsMetrics.connections = simulated.connections;
    // Simulate memory and disk for AWS (CloudWatch basic monitoring only provides CPU)
    if (awsMetrics.cpu_percent != null && !awsMetrics.memory_percent) {
        awsMetrics.memory_percent = 30 + Math.random() * 40;
        awsMetrics.disk_percent = 20 + Math.random() * 30;
    }

    var allSeverities = [];

    // Render local cards
    var localCards = document.querySelectorAll('.metric-card[data-source="local"]');
    localCards.forEach(function (card) {
        var key = card.getAttribute('data-metric');
        var value = localMetrics[key];
        updateCard(card, key, value, allSeverities, 'local');
    });

    // Render AWS cards
    var awsCards = document.querySelectorAll('.metric-card[data-source="aws"]');
    awsCards.forEach(function (card) {
        var key = card.getAttribute('data-metric');
        var value = awsMetrics[key];
        updateCard(card, key, value, allSeverities, 'aws');
    });

    // AWS instance label
    var label = document.getElementById('aws-instance-label');
    if (label && awsMetrics.instance_id) {
        label.textContent = '(' + awsMetrics.instance_id + ' / ' + (awsMetrics.region || '') + ')';
    }

    // AWS error banner
    var banner = document.getElementById('aws-error-banner');
    if (banner) {
        if (data.aws_error) {
            banner.textContent = '⚠ ' + data.aws_error;
            banner.style.display = '';
        } else {
            banner.style.display = 'none';
        }
    }

    // System status
    var systemSeverity = getMaxSeverity(allSeverities);
    var statusBadge = document.getElementById('system-status-badge');
    if (statusBadge) {
        statusBadge.textContent = systemSeverity.toUpperCase();
        statusBadge.className = 'severity-badge ' + systemSeverity;
    }
}

function updateCard(card, key, value, allSeverities, source) {
    if (value == null) return;
    var valueEl = card.querySelector('.metric-value');
    if (valueEl) valueEl.textContent = formatMetricValue(key, value);

    var severity = getSeverity(key, value);
    allSeverities.push(severity);

    var badge = card.querySelector('.severity-badge');
    if (badge) { badge.textContent = severity.toUpperCase(); badge.className = 'severity-badge ' + severity; }

    card.classList.remove('severity-normal', 'severity-warning', 'severity-critical');
    card.classList.add('severity-' + severity);

    updateSparkline(source + '_' + key, value);
}

// ---------------------------------------------------------------------------
// SparklineManager
// ---------------------------------------------------------------------------
var SPARKLINE_MAX_POINTS = 20;
var SEVERITY_COLORS = { normal: '#2ea043', warning: '#d29922', critical: '#f85149' };

function updateSparkline(historyKey, value) {
    if (value == null) return;
    var num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return;

    if (!state.sparklineHistory[historyKey]) state.sparklineHistory[historyKey] = [];
    var history = state.sparklineHistory[historyKey];
    history.push(num);
    if (history.length > SPARKLINE_MAX_POINTS) history.shift();

    // Find canvas by source + metric
    var parts = historyKey.split('_');
    var source = parts[0];
    var metricKey = parts.slice(1).join('_');
    var card = document.querySelector('.metric-card[data-source="' + source + '"][data-metric="' + metricKey + '"]');
    if (!card) return;
    var canvas = card.querySelector('.sparkline-canvas');
    if (!canvas) return;

    var metricSeverity = getSeverity(metricKey, num);
    var color = SEVERITY_COLORS[metricSeverity] || SEVERITY_COLORS.normal;
    var labels = history.map(function (_, i) { return i; });

    if (state.chartInstances[historyKey]) {
        var chart = state.chartInstances[historyKey];
        chart.data.labels = labels;
        chart.data.datasets[0].data = history.slice();
        chart.data.datasets[0].borderColor = color;
        chart.update('none');
    } else {
        try {
            state.chartInstances[historyKey] = new Chart(canvas, {
                type: 'line',
                data: { labels: labels, datasets: [{ data: history.slice(), borderColor: color, borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } }, animation: false },
            });
        } catch (err) { console.error('Sparkline init failed:', err); }
    }
}

// ---------------------------------------------------------------------------
// Timestamp
// ---------------------------------------------------------------------------
function updateTimestamp(data) {
    var el = document.getElementById('timestamp');
    if (el && data && data.timestamp) el.textContent = data.timestamp;
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------
async function fetchMetrics() {
    try {
        var url = '/api/metrics?scenario=' + encodeURIComponent(state.activeScenario);
        var resp = await fetch(url);
        if (!resp.ok) return;
        var data = await resp.json();
        state.latestMetrics = data;
        renderMetricCards(data);
        updateTimestamp(data);
    } catch (err) { console.error('Metrics fetch failed:', err); }
}

function startPolling() {
    if (pollingTimerId) return;
    fetchMetrics();
    pollingTimerId = setInterval(fetchMetrics, state.pollingInterval);
}
function stopPolling() {
    if (pollingTimerId) { clearInterval(pollingTimerId); pollingTimerId = null; }
}

// ---------------------------------------------------------------------------
// Pause / Resume
// ---------------------------------------------------------------------------
function initPauseResume() {
    var btn = document.getElementById('pause-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
        if (state.polling) { stopPolling(); state.polling = false; btn.textContent = 'Resume'; }
        else { startPolling(); state.polling = true; btn.textContent = 'Pause'; }
    });
}

// ---------------------------------------------------------------------------
// Scenario Tabs
// ---------------------------------------------------------------------------
function initScenarioTabs() {
    var tabs = document.querySelectorAll('.scenario-tab');
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            state.activeScenario = tab.getAttribute('data-scenario');
            tabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            fetchMetrics();
        });
    });
}

// ---------------------------------------------------------------------------
// Content Tabs
// ---------------------------------------------------------------------------
function initContentTabs() {
    var tabs = document.querySelectorAll('.content-tab');
    var metricsGrid = document.getElementById('metrics-grid');
    var logsPanel = document.getElementById('logs-panel');
    var analysisPanel = document.getElementById('analysis-panel');

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var tabName = tab.getAttribute('data-tab');
            state.activeContentTab = tabName;
            tabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');

            if (tabName === 'metrics') {
                if (metricsGrid) metricsGrid.style.display = '';
                if (logsPanel) logsPanel.style.display = 'none';
                if (analysisPanel) analysisPanel.style.display = 'none';
            } else if (tabName === 'logs') {
                if (metricsGrid) metricsGrid.style.display = 'none';
                if (logsPanel) logsPanel.style.display = '';
                if (analysisPanel) analysisPanel.style.display = 'none';
                fetchLogs();
            } else if (tabName === 'analysis') {
                if (metricsGrid) metricsGrid.style.display = 'none';
                if (logsPanel) logsPanel.style.display = 'none';
                if (analysisPanel) analysisPanel.style.display = '';
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------
async function fetchLogs() {
    try {
        var resp = await fetch('/api/logs?scenario=' + encodeURIComponent(state.activeScenario));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        state.latestLogs = data;
        var container = document.querySelector('.logs-container');
        if (!container) return;
        var logs = data.logs || [];
        container.innerHTML = '';
        logs.forEach(function (entry) {
            var div = document.createElement('div');
            div.className = 'log-entry';
            div.textContent = entry;
            container.appendChild(div);
        });
    } catch (err) {
        console.error('Logs fetch failed:', err);
        var c = document.querySelector('.logs-container');
        if (c) c.innerHTML = '<div class="log-entry">Failed to load logs</div>';
    }
}

// ---------------------------------------------------------------------------
// AI Analysis
// ---------------------------------------------------------------------------
function escapeHtml(str) {
    if (!str) return '';
    if (typeof str === 'object') {
        var text = str.issue || str.description || str.message || str.recommendation || str.title || str.text;
        if (text) return escapeHtml(text);
        return escapeHtml(JSON.stringify(str));
    }
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderAnalysis(data) {
    var container = document.querySelector('.analysis-container');
    if (!container) return;

    if (data.summary && !data.severity && !data.overall_health_score && !data.issues && !data.recommendations) {
        container.innerHTML = '<div class="analysis-section"><div class="analysis-section-title">Summary</div><div class="analysis-summary">' + escapeHtml(data.summary) + '</div></div>';
        return;
    }

    var html = '';
    if (data.severity || data.overall_health_score != null) {
        html += '<div class="analysis-section"><div class="analysis-section-title">Overall Health Score</div><div class="analysis-severity">';
        if (data.severity) {
            var sevClass = (data.severity || '').toLowerCase();
            if (sevClass === 'healthy') sevClass = 'normal';
            html += '<span class="severity-badge ' + sevClass + '">' + escapeHtml(data.severity) + '</span>';
        }
        if (data.overall_health_score != null) {
            html += '<span class="analysis-score">' + data.overall_health_score + '/100</span>';
        }
        html += '</div></div>';
    }
    if (data.summary) {
        html += '<div class="analysis-section"><div class="analysis-section-title">Summary</div><div class="analysis-summary">' + escapeHtml(data.summary) + '</div></div>';
    }
    if (data.issues && data.issues.length > 0) {
        html += '<div class="analysis-section"><div class="analysis-section-title">Issues</div><ul class="analysis-list issues">';
        data.issues.forEach(function (i) { html += '<li>' + escapeHtml(i) + '</li>'; });
        html += '</ul></div>';
    }
    if (data.recommendations && data.recommendations.length > 0) {
        html += '<div class="analysis-section"><div class="analysis-section-title">Recommendations</div><ul class="analysis-list recommendations">';
        data.recommendations.forEach(function (r) { html += '<li>' + escapeHtml(r) + '</li>'; });
        html += '</ul></div>';
    }
    container.innerHTML = html || '<div class="analysis-placeholder">No analysis data available.</div>';
}

async function handleAnalyze() {
    var btn = document.getElementById('analyze-btn');
    if (!btn) return;
    btn.classList.add('loading');
    btn.textContent = 'Analyzing...';

    try {
        var logsArray = (state.latestLogs && state.latestLogs.logs) ? state.latestLogs.logs : [];
        var resp = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metrics: state.latestMetrics, logs: logsArray }),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        state.latestAnalysis = data;
        var analysisTab = document.querySelector('.content-tab[data-tab="analysis"]');
        if (analysisTab) analysisTab.click();
        renderAnalysis(data);
    } catch (err) {
        console.error('Analysis failed:', err);
        var analysisTab = document.querySelector('.content-tab[data-tab="analysis"]');
        if (analysisTab) analysisTab.click();
        var c = document.querySelector('.analysis-container');
        if (c) c.innerHTML = '<div class="analysis-error">Analysis failed: ' + escapeHtml(err.message) + '</div>';
    } finally {
        btn.classList.remove('loading');
        btn.textContent = 'Analyze';
    }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
    initPauseResume();
    initScenarioTabs();
    initContentTabs();
    startPolling();
    document.getElementById('analyze-btn').addEventListener('click', handleAnalyze);
});
