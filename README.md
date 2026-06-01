# agency-saas-backend monorepo

Ce depot contient maintenant deux parties :

- `backend/` : l'API deployable sur Vercel
- `frontend/` : l'application React protegee par Basic Auth

## Structure

```text
backend/
  api/llm.js
  env.example
  vercel.json
frontend/
  src/
  package.json
  server.js
```

## Backend

Variables attendues :

```bash
OPENAI_API_KEY=your_key_here
```

Le backend historique utilise `backend/api/llm.js`.

## Frontend

Pour lancer le frontend en local :

```bash
cd frontend
npm install
npm run build
BASIC_AUTH_USER=admin BASIC_AUTH_PASSWORD=change-me-now npm start
```

Puis ouvrir `http://127.0.0.1:3000`.
