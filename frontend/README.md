# React + TypeScript + Vite
# Frontend

## Run with backend
1. Start backend API server on `http://localhost:8000`.
2. Start frontend dev server:

```bash
npm install
npm run dev
```

The frontend uses `/api/*` routes. In development, Vite proxies them to `http://localhost:8000`.

## Optional API base URL override

You can set `VITE_API_BASE_URL` when your backend is not on the same origin in production:
```bash
VITE_API_BASE_URL=https://your-api.example.com npm run build
```
