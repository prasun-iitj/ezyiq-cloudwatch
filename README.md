# EzyIQ CloudWatch — AI-Powered Cloud Infrastructure Troubleshooting Assistant

A real-time web dashboard that monitors cloud infrastructure health by combining local system metrics, AWS CloudWatch data, and AI-powered analysis via Groq's LLaMA 3.1 model.

🔗 **Live Demo:** [https://ezyiq-cloudwatch.onrender.com/](https://ezyiq-cloudwatch.onrender.com/)

**Video Explaination:** https://youtu.be/UbTLdNNomeY?si=dUShbQ2Szi5fH1_k

---

## What It Does

EzyIQ CloudWatch collects real-time infrastructure metrics and uses AI to identify potential issues, suggest root causes, and recommend solutions — helping administrators quickly diagnose and fix cloud performance problems.

- **Local System Monitoring** — CPU, Memory, Disk, Network via psutil
- **AWS CloudWatch Integration** — Fetches EC2 metrics (CPUUtilization) from AWS
- **AI-Powered Analysis** — Sends metrics + logs to Groq LLaMA 3.1 for intelligent troubleshooting
- **Scenario Simulation** — Simulate CPU spikes, memory leaks, network floods, and disk pressure
- **Real-Time Dashboard** — Auto-refreshes every 5 seconds with sparkline charts and severity badges

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, Flask |
| Frontend | Vanilla JavaScript, Chart.js |
| AI/LLM | Groq API (LLaMA 3.1 8B Instant) |
| Cloud | AWS CloudWatch, boto3 |
| Metrics | psutil |
| Deployment | Render |

---

## Features

### Dashboard Metrics (Real-Time)
- CPU Usage, Memory, Disk I/O, Network In/Out (Local)
- CPU Usage, Memory, Disk, Latency, Error Rate, Connections (AWS)
- Color-coded severity badges: 🟢 NORMAL, 🟡 WARNING, 🔴 CRITICAL
- Sparkline trend charts for each metric

### Scenario Simulation Tabs
| Tab | What It Simulates |
|-----|-------------------|
| Normal | Real unmodified metrics |
| CPU Spike | CPU forced to 85–99% |
| Memory Leak | Memory forced to 80–95% |
| Network Flood | Network I/O above 500 MB |
| Disk Pressure | Disk usage forced to 90–99% |

### AI Analysis (Groq LLaMA 3.1)
Click "Analyze" to get:
- Overall Health Score (out of 100)
- Severity classification
- Summary of system state
- Detected issues
- Recommended actions

---

## Project Structure

```
├── app.py                  # Flask backend (APIs + metrics + AI)
├── requirements.txt        # Python dependencies
├── templates/
│   └── index.html          # Dashboard HTML
├── static/
│   ├── css/style.css       # Dark theme styles
│   └── js/dashboard.js     # Frontend logic (polling, charts, tabs)
├── .env                    # Local credentials (not in repo)
└── README.md
```

---

## Run Locally

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/ezyiq-cloudwatch.git
cd ezyiq-cloudwatch

# Install dependencies
pip install -r requirements.txt

# Set environment variables (Windows PowerShell)
$env:GROQ_API_KEY="your_groq_api_key"
$env:AWS_ACCESS_KEY_ID="your_aws_key"
$env:AWS_SECRET_ACCESS_KEY="your_aws_secret"
$env:AWS_REGION="eu-north-1"
$env:EC2_INSTANCE_ID="your_instance_id"

# Run
python app.py
```

Open [http://localhost:5000](http://localhost:5000)

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | API key from [Groq Console](https://console.groq.com/) |
| `AWS_ACCESS_KEY_ID` | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key |
| `AWS_REGION` | AWS region (e.g., `eu-north-1`) |
| `EC2_INSTANCE_ID` | EC2 instance to monitor |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serves the dashboard |
| `/api/metrics?scenario=X` | GET | Returns local + AWS metrics |
| `/api/logs?scenario=X` | GET | Returns simulated log entries |
| `/api/analyze` | POST | AI-powered analysis via Groq |

---

## Deployment (Render)

1. Push code to GitHub
2. Create a Web Service on [Render](https://render.com)
3. Set Build Command: `pip install -r requirements.txt`
4. Set Start Command: `gunicorn app:app`
5. Add environment variables in Render dashboard
6. Deploy — get a public URL

---

## Course Context

This project was developed as part of a Virtual Cloud Computing (VCC) course to demonstrate how AI can assist in managing cloud infrastructure effectively and reduce troubleshooting time.

---

## License

MIT
