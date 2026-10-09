# CareerPilot AI

A responsive career-prep app for students and early-career developers. It includes a resume analyzer, DSA problem tracker, mock interview coach, and internship application tracker.

## Run locally

Requires Node.js 20 or later. No package installation is needed.

```powershell
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

Import the GitHub repository into Vercel and set the project **Root Directory** to `careerpilot-ai`. Vercel serves the static frontend from `public/` and routes `/api/*` to the Node.js function in `api/[...path].js`.

Hosted DSA and application data is stored in that browser's local storage because this project does not include user accounts or a cloud database. Local development instead stores tracker data in `data/careerpilot.json`.

## Features

- **Overview:** progress metrics, recent activity, and a seven-day activity chart.
- **Resume studio:** resume readiness score, section checks, skill detection, and practical suggestions.
- **DSA tracker:** record problems, topics, difficulty and status; search, update, and remove entries.
- **Mock interview:** practice behavioral prompts and receive coaching feedback.
- **Applications:** track opportunities, update their status, and search your list.
- **Persistence:** local tracker data is stored in `data/careerpilot.json`; hosted tracker data stays in the current browser.

Resume and interview features work immediately with built-in demo feedback. For local development, set an OpenAI-compatible API key before starting the server:

```powershell
$env:OPENAI_API_KEY = "your-api-key"
npm start
```

For Vercel, add `OPENAI_API_KEY` under the project's Environment Variables and redeploy. Optionally set `OPENAI_API_URL` and `OPENAI_MODEL` for a compatible provider or model. Resume text and interview answers are sent to the configured provider when live AI is enabled; the app does not save resume text or interview answers.

## API

- `GET /api/dashboard`
- `GET`, `POST /api/problems`; `PATCH`, `DELETE /api/problems/:id`
- `GET`, `POST /api/internships`; `PATCH`, `DELETE /api/internships/:id`
- `POST /api/resume/analyze`
- `POST /api/interview`
