# Agency Agents

App React emballée avec Vite et protégée par une Basic Auth HTTP.

## Installation

```bash
npm install
```

## Lancer en local

```bash
cp .env.example .env
npm run build
BASIC_AUTH_USER=admin BASIC_AUTH_PASSWORD=change-me-now npm start
```

Puis ouvrir `http://127.0.0.1:3000`.

## Développement

```bash
npm run dev
```

## GitHub

```bash
git init
git add .
git commit -m "Initial app setup with basic auth"
git branch -M main
git remote add origin <VOTRE_URL_GITHUB>
git push -u origin main
```
