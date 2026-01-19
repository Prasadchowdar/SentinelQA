# SentinelQA – AI-Powered Autonomous Web Testing Agent

SentinelQA is an **agentic AI testing platform** that uses GPT-4 Vision and browser automation to test web applications like a human QA engineer.  
Instead of brittle selectors and hard-coded scripts, it understands screens visually and decides the next action dynamically.

---

## What Problem It Solves

Traditional automation tests break whenever UI changes.  
SentinelQA replaces static scripts with an **AI decision loop** that:

- Looks at the page screenshot  
- Understands UI context  
- Decides what to click or type  
- Executes actions via Playwright  
- Verifies outcomes  
- Self-heals when flows change  

It enables natural-language testing instead of fragile automation code.

---

## Core Features

- **Natural Language Test Instructions**  
  "Login and create a new project named Demo" – no code required

- **GPT-4 Vision Decision Engine**  
  Screenshots are analyzed to determine next action

- **Autonomous Action Execution**  
  Clicks, typing, scrolling handled via Playwright

- **Self-Healing Tests**  
  Adapts when selectors or layouts change

- **Session Recording**  
  Every run is saved as a video for debugging

- **Multi-Tenant Architecture**  
  Organizations → Projects → Team Members

- **API + UI Platform**  
  Full-stack system with dashboard and backend

---

## How It Works (Architecture)

1. User submits a test in natural language  
2. Worker launches a browser session  
3. Screenshot is captured  
4. GPT-4 Vision analyzes UI and intent  
5. AI returns next action  
6. Playwright executes action  
7. Loop continues until goal is reached  
8. Entire session is recorded as video  

This creates a true **agentic workflow for QA automation**.

---

## Tech Stack

**AI & Automation**
- OpenAI GPT-4 Vision  
- Playwright  
- FastAPI  
- Python AsyncIO  

**Backend**
- FastAPI REST APIs  
- Background workers  
- Video processing  
- Session orchestration  

**Frontend**
- React  
- Real-time test dashboard  

---

## Project Structure

```
├── backend/          Python API (FastAPI)
│   ├── server.py     Main API server
│   ├── worker.py     AI test runner & decision loop
│   └── videos/       Recorded test sessions
│
├── frontend/         React application
│   └── src/
│       ├── pages/
│       └── components/
│
└── chrome-extension/ Action recorder utility
```

---

## Getting Started

### Requirements

- Python 3.10+
- Node.js 18+
- OpenAI API Key

---

### Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

pip install -r requirements.txt
playwright install chromium

cp .env.example .env
# Add OPENAI_API_KEY to .env
```

Run server:

```bash
python -m uvicorn server:app --port 8000 --reload
```

---

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

Open: **http://localhost:3000**

---

## API Documentation

Once running: http://localhost:8000/docs

---

## What I Built End-to-End

I owned and implemented the entire platform:

* Designed the **AI decision loop architecture**
* Built FastAPI backend and worker orchestration
* Integrated GPT-4 Vision with Playwright automation
* Developed React frontend dashboard
* Implemented video recording and session tracking
* Created API contracts and multi-tenant structure
* Shipped a working local demo system

**Tradeoffs Made:**

* Chose visual AI over DOM selectors for resilience
* Used async workers to balance latency vs cost
* Modularized backend for future CI/CD integration

This is a fully functional demo that can be extended to real QA pipelines.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

---

## License

MIT
