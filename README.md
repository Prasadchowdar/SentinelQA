# SentinelQA

A web application testing platform that uses GPT-4 Vision to automate browser testing. It analyzes screenshots and executes actions like a real user would.

## What it does

- Uses AI to analyze page screenshots and decide what to click/type
- Records test sessions as videos
- Supports natural language test instructions
- Self-heals when selectors break
- Multi-tenant: orgs, projects, team members

## Project Structure

```
├── backend/          Python API (FastAPI)
│   ├── server.py     Main server
│   ├── worker.py     AI test runner
│   └── videos/       Recorded sessions
│
├── frontend/         React app
│   └── src/
│       ├── pages/
│       └── components/
│
└── chrome-extension/ Action recorder
```

## Getting Started

### Requirements

- Python 3.10+
- Node.js 18+
- OpenAI API key

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

pip install -r requirements.txt
playwright install chromium

cp .env.example .env
# add your OPENAI_API_KEY to .env
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

### Running

Terminal 1:
```bash
cd backend
python -m uvicorn server:app --port 8000 --reload
```

Terminal 2:
```bash
cd frontend
npm start
```

Open http://localhost:3000

## API Docs

Once the backend is running: http://localhost:8000/docs

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT
