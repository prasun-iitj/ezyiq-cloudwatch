import os
import socket
import random
import json
from datetime import datetime, timezone, timedelta

import psutil
import boto3
import requests as http_requests
from flask import Flask, request, jsonify, render_template

app = Flask(__name__, static_folder='static', template_folder='templates')

# ---------------------------------------------------------------------------
# Configuration from environment variables
# ---------------------------------------------------------------------------
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')
AWS_REGION = os.environ.get('AWS_REGION', 'eu-north-1')
EC2_INSTANCE_ID = os.environ.get('EC2_INSTANCE_ID', '')
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')


# ---------------------------------------------------------------------------
# Metrics Collection
# ---------------------------------------------------------------------------

def collect_local_metrics():
    """Collect local system metrics using psutil."""
    cpu = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    net = psutil.net_io_counters()

    return {
        "cpu_percent": cpu,
        "memory_percent": memory.percent,
        "disk_percent": disk.percent,
        "memory_used_gb": round(memory.used / (1024 ** 3), 2),
        "disk_used_gb": round(disk.used / (1024 ** 3), 2),
        "net_sent_mb": round(net.bytes_sent / (1024 ** 2), 2),
        "net_recv_mb": round(net.bytes_recv / (1024 ** 2), 2),
        "hostname": socket.gethostname(),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "source": "local",
    }


def collect_aws_cloudwatch_metrics(instance_id, region):
    """Fetch CPUUtilization from AWS CloudWatch for the given EC2 instance.

    Returns a dict with cpu_percent and source on success, or an empty dict
    on failure.  The caller is responsible for merging the result and
    populating the ``aws_error`` field when this returns ``{}``.
    """
    try:
        cw = boto3.client(
            "cloudwatch",
            region_name=region,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        )

        end = datetime.now(timezone.utc)
        start = end - timedelta(minutes=10)

        resp = cw.get_metric_statistics(
            Namespace="AWS/EC2",
            MetricName="CPUUtilization",
            Dimensions=[{"Name": "InstanceId", "Value": instance_id}],
            StartTime=start,
            EndTime=end,
            Period=300,
            Statistics=["Average"],
        )

        datapoints = resp.get("Datapoints", [])
        if datapoints:
            cpu = datapoints[-1]["Average"]
            return {"cpu_percent": round(cpu, 2), "source": "aws_cloudwatch"}
        return {}

    except Exception as e:
        print(f"⚠ CloudWatch fetch failed: {e}")
        return {}


# ---------------------------------------------------------------------------
# Scenario Simulation
# ---------------------------------------------------------------------------

def apply_scenario(metrics, scenario):
    """Apply simulated metric adjustments for the given scenario.

    Returns a modified copy of *metrics*.  Unknown scenario values are
    treated as ``"normal"`` (no adjustments).
    """
    result = dict(metrics)

    if scenario == "cpu_spike":
        result["cpu_percent"] = random.uniform(85, 99)
    elif scenario == "memory_leak":
        result["memory_percent"] = random.uniform(80, 95)
    elif scenario == "network_flood":
        result["net_sent_mb"] = random.uniform(500, 1000)
        result["net_recv_mb"] = random.uniform(500, 1000)
    elif scenario == "disk_pressure":
        result["disk_percent"] = random.uniform(90, 99)

    return result


# ---------------------------------------------------------------------------
# Log Generation
# ---------------------------------------------------------------------------

_SCENARIO_LOG_EVENTS = {
    "cpu_spike": [
        "CPU usage spike detected — utilization above 85%",
        "High CPU load observed on primary core",
        "CPU throttling triggered due to sustained spike",
        "Process scheduler under heavy CPU contention",
        "CPU temperature elevated during spike event",
        "Runaway process consuming excessive CPU cycles",
    ],
    "memory_leak": [
        "Memory utilization climbing — possible leak detected",
        "Heap allocation growing without release",
        "Out-of-memory killer threshold approaching",
        "Memory fragmentation increasing steadily",
        "Swap usage rising due to memory pressure",
        "Resident set size of worker process expanding",
    ],
    "network_flood": [
        "Network traffic flood detected on eth0",
        "Inbound packet rate exceeding normal baseline",
        "Outbound bandwidth saturated by bulk transfer",
        "TCP connection backlog growing rapidly",
        "Network interface dropping packets under load",
        "Unusual surge in DNS query volume",
    ],
    "disk_pressure": [
        "Disk usage critical — partition above 90%",
        "I/O wait time spiking on root volume",
        "Write latency increased due to disk pressure",
        "Disk space running low on /var/log",
        "Filesystem approaching capacity limit",
        "Disk throughput degraded under heavy writes",
    ],
}

_DEFAULT_LOG_EVENTS = [
    "CPU usage spike detected",
    "Memory utilization stable",
    "Disk IO stable",
    "Network traffic increased",
    "System health check passed",
    "Background process restarted",
]


def collect_logs(scenario=None):
    """Return a list of 5 timestamped log strings.

    When *scenario* names a known stress scenario the log entries are
    relevant to that scenario.  Otherwise generic events are used.
    """
    events = _SCENARIO_LOG_EVENTS.get(scenario, _DEFAULT_LOG_EVENTS)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    return [
        f"{now} : {random.choice(events)}"
        for _ in range(5)
    ]


# ---------------------------------------------------------------------------
# AI Analysis
# ---------------------------------------------------------------------------

def analyze_with_ai(metrics, logs):
    """Send metrics and logs to Groq LLaMA 3.1 API for analysis.

    Returns a dict with severity, overall_health_score, summary, issues,
    and recommendations.  Falls back to rule-based analysis when
    GROQ_API_KEY is not configured.  Returns an error response dict when
    the Groq API call fails.
    """

    # ---- Rule-based fallback when no API key ----
    if not GROQ_API_KEY:
        issues = []
        recommendations = []
        score = 100
        severity = "HEALTHY"

        if metrics.get("cpu_percent", 0) > 80:
            issues.append("High CPU usage")
            recommendations.append("Investigate CPU-bound processes")
            severity = "WARNING"
            score -= 20

        if metrics.get("memory_percent", 0) > 80:
            issues.append("High memory usage")
            recommendations.append("Check for memory leaks or increase instance memory")
            severity = "WARNING"
            score -= 20

        if metrics.get("disk_percent", 0) > 90:
            issues.append("Disk almost full")
            recommendations.append("Free disk space or expand volume")
            severity = "CRITICAL"
            score -= 40

        return {
            "severity": severity,
            "overall_health_score": score,
            "summary": "Local rule-based fallback analysis",
            "issues": issues,
            "recommendations": recommendations,
        }

    # ---- Call Groq API ----
    prompt = f"""
You are a cloud infrastructure troubleshooting assistant.

Metrics:
{metrics}

Logs:
{logs}

Analyze the above and respond with ONLY a JSON object (no markdown, no code fences) with these exact fields:
- "severity": one of "CRITICAL", "WARNING", "INFO", "HEALTHY"
- "overall_health_score": integer 0-100
- "summary": a string describing overall health
- "issues": an array of strings, each describing one issue
- "recommendations": an array of strings, each describing one recommendation
"""

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    data = {
        "model": "llama-3.1-8b-instant",
        "messages": [
            {"role": "system", "content": "You are a cloud troubleshooting AI. Always respond with ONLY raw JSON. No markdown, no code fences, no explanation. Issues and recommendations must be arrays of plain strings."},
            {"role": "user", "content": prompt},
        ],
    }

    try:
        r = http_requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=data,
            timeout=30,
        )

        resp = r.json()

        if "choices" not in resp:
            return {"summary": "AI request failed", "error": str(resp)}

        content = resp["choices"][0]["message"]["content"]

        # Strip markdown code fences if present
        cleaned = content.strip()
        if cleaned.startswith("```"):
            # Remove opening fence (```json or ```)
            cleaned = cleaned.split("\n", 1)[-1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

        try:
            parsed = json.loads(cleaned)

            # Normalize issues/recommendations to plain string arrays
            if "issues" in parsed and isinstance(parsed["issues"], list):
                parsed["issues"] = [
                    item if isinstance(item, str)
                    else (item.get("message") or item.get("issue") or item.get("description") or json.dumps(item))
                    for item in parsed["issues"]
                ]
            if "recommendations" in parsed and isinstance(parsed["recommendations"], list):
                parsed["recommendations"] = [
                    item if isinstance(item, str)
                    else (item.get("message") or item.get("recommendation") or item.get("description") or json.dumps(item))
                    for item in parsed["recommendations"]
                ]

            return parsed
        except (json.JSONDecodeError, ValueError):
            return {"summary": content}

    except Exception as e:
        return {"summary": "AI request failed", "error": str(e)}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/metrics')
def api_metrics():
    """Return system metrics as JSON with separate local and AWS sections."""
    try:
        local_metrics = collect_local_metrics()
        scenario = request.args.get('scenario')

        # AWS CloudWatch metrics
        aws_metrics = {}
        aws_error = None
        instance_id = EC2_INSTANCE_ID
        region = AWS_REGION

        if instance_id:
            aws_raw = collect_aws_cloudwatch_metrics(instance_id, region)
            if aws_raw:
                aws_metrics = {
                    "cpu_percent": aws_raw.get("cpu_percent", 0),
                    "instance_id": instance_id,
                    "region": region,
                    "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
                    "source": "aws_cloudwatch",
                }
            else:
                aws_error = "No CloudWatch datapoints available (instance may be stopped)"
        else:
            aws_error = "EC2_INSTANCE_ID not configured"

        # Apply scenario adjustments to both
        local_adjusted = apply_scenario(local_metrics, scenario)
        aws_adjusted = apply_scenario(aws_metrics, scenario) if aws_metrics else aws_metrics

        return jsonify({
            "local": local_adjusted,
            "aws": aws_adjusted,
            "aws_error": aws_error,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/logs')
def api_logs():
    """Return simulated infrastructure log entries as JSON.

    Accepts an optional ``scenario`` query parameter to generate
    scenario-relevant log entries.
    """
    scenario = request.args.get('scenario')
    logs = collect_logs(scenario)
    return jsonify({"logs": logs})


@app.route('/api/analyze', methods=['POST'])
def api_analyze():
    """Run AI-powered analysis on the provided metrics and logs.

    Expects a JSON body with ``metrics`` (dict) and ``logs`` (list of
    strings).  Returns the analysis result from ``analyze_with_ai``.
    """
    body = request.get_json(force=True)
    metrics = body.get("metrics", {})
    logs = body.get("logs", [])
    result = analyze_with_ai(metrics, logs)
    return jsonify(result)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
