# BuildCliff Frontend

The web UI for **BuildCliff**, an observability tool that detects CI/CD performance cliffs, attributes them to the culprit commit, and models developer waiting cost in hours and dollars.

Built with **Vite**, **React 18**, **TypeScript (strict)**, **Tailwind CSS v3**, **Recharts**, **React Router v6**, **@tanstack/react-query v5**, and **Framer Motion**.

---

## Getting Started

### 1. Install Dependencies
From the repository root:
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run frontend
# or directly from frontend/
cd frontend && npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Configuration

Create a `.env` in `frontend/` (or copy from `.env.example`):

```bash
VITE_API_BASE=/api
VITE_USE_MOCKS=true
VITE_PROJECT_ID=demo-app
VITE_PROXY_TARGET=http://localhost:4000
```

| Variable | Description | Default |
|---|---|---|
| `VITE_API_BASE` | Base URL path for all API endpoints | `/api` |
| `VITE_USE_MOCKS` | If `true`, runs with mock data adapter & SSE simulator | `true` |
| `VITE_PROJECT_ID` | Default project identifier | `demo-app` |
| `VITE_PROXY_TARGET` | Backend API server target in Vite dev mode | `http://localhost:4000` |

---

## Mock / Live Switch

- **Floating Dev Switch:** A floating badge appears in the bottom-left corner of the screen (`MODE: MOCK` / `MODE: LIVE`).
- Click it at any time to toggle between the in-memory mock simulator and the live backend API (`http://localhost:4000/api`).
- In Mock mode, you can toggle between:
  - **High:** Planted Puppeteer cliff (`+3m20s`, High confidence attribution to `a3f9c1d`).
  - **Low:** 3-commit window (`+40s`, Low confidence showing ranked suspect candidates).
  - **Clean:** Empty healthy baseline (0 regressions).

---

## The Demo Experience ("Replay the Cliff")

1. Open the UI in Clean state or baseline.
2. Click **Replay the cliff** in the top navigation bar.
3. The segmented progress bar tracks 1 commit + 5 incoming runs arriving ~1.5s apart through the event stream.
4. The timeline grows smoothly run-by-run.
5. After run 5, the cliff marker appears and the Culprit Panel slides in automatically with no page refresh.
6. Toggle **Auto-revert preview** to project the baseline line and view the time won back and recovered cost.
7. Click **Reset** to return to the healthy clean baseline.

---

## Running Tests & Production Build

### Unit & Component Tests
```bash
npm --prefix frontend test
```

### Production Build
```bash
npm run frontend:build
```

