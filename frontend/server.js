import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const username = process.env.BASIC_AUTH_USER || "admin";
const password = process.env.BASIC_AUTH_PASSWORD || "changeme";

function unauthorized(res) {
  res.set("WWW-Authenticate", 'Basic realm="Agency Agents"');
  res.status(401).send("Authentification requise.");
}

app.use((req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Basic ")) {
    return unauthorized(res);
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  const providedUser = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : "";
  const providedPassword = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

  if (providedUser !== username || providedPassword !== password) {
    return unauthorized(res);
  }

  next();
});

app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, host, () => {
  console.log(`Agency Agents disponible sur http://${host}:${port}`);
  console.log(`Identifiant Basic Auth: ${username}`);
});
