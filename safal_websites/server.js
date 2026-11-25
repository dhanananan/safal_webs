/* Local server for the Gunjana & Safal site.
 *
 *   node server.js        ->  http://localhost:3000
 *
 * - Serves the public site (index.html, styles.css, script.js) — an explicit allowlist,
 *   so server.js and .env can never be downloaded.
 * - /admin and /api/leads are protected with HTTP Basic auth (ADMIN_USER / ADMIN_PASSWORD).
 *   If ADMIN_PASSWORD is empty they are disabled.
 * - /api/leads calls the leads API from the server, so LEADS_API_KEY never reaches the browser.
 *
 * No dependencies. Needs Node 18+.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* ---- tiny .env loader (real environment variables win) ---- */
try {
  const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
} catch { /* no .env — fine */ }

const {
  PORT = "3000",
  HOST = "127.0.0.1",
  ADMIN_USER = "admin",
  ADMIN_PASSWORD = "",
  LEADS_API_URL = "",
  LEADS_API_KEY = "",
  LEADS_API_AUTH = "bearer", // bearer | x-api-key | header:<Name> | query:<param>
} = process.env;

const PUBLIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/script.js": ["script.js", "text/javascript; charset=utf-8"],
};

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

function authorised(req) {
  if (!ADMIN_PASSWORD) return false;
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  const userOk = safeEqual(decoded.slice(0, i), ADMIN_USER);
  const passOk = safeEqual(decoded.slice(i + 1), ADMIN_PASSWORD);
  return userOk && passOk;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "X-Content-Type-Options": "nosniff", ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) =>
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json", "Cache-Control": "no-store" });

function requireAdmin(req, res) {
  if (!ADMIN_PASSWORD) {
    send(res, 503, "Admin is disabled. Set ADMIN_PASSWORD in .env and restart the server.", { "Content-Type": "text/plain" });
    return false;
  }
  if (!authorised(req)) {
    send(res, 401, "Authentication required", {
      "WWW-Authenticate": 'Basic realm="Leads", charset="UTF-8"',
      "Content-Type": "text/plain",
    });
    return false;
  }
  return true;
}

async function handleLeads(res) {
  if (!LEADS_API_URL || !LEADS_API_KEY) {
    return sendJson(res, 501, { error: "Leads API is not configured. Set LEADS_API_URL and LEADS_API_KEY in .env." });
  }

  let url;
  try { url = new URL(LEADS_API_URL); } catch { return sendJson(res, 500, { error: "LEADS_API_URL is not a valid URL." }); }

  const headers = { Accept: "application/json" };
  const style = LEADS_API_AUTH.toLowerCase();
  if (style === "bearer") headers.Authorization = `Bearer ${LEADS_API_KEY}`;
  else if (style === "x-api-key") headers["X-API-Key"] = LEADS_API_KEY;
  else if (style.startsWith("header:")) headers[LEADS_API_AUTH.slice(7)] = LEADS_API_KEY;
  else if (style.startsWith("query:")) url.searchParams.set(LEADS_API_AUTH.slice(6), LEADS_API_KEY);
  else return sendJson(res, 500, { error: `Unknown LEADS_API_AUTH "${LEADS_API_AUTH}".` });

  try {
    const upstream = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    const text = await upstream.text();
    if (!upstream.ok) {
      return sendJson(res, 502, { error: `Leads API responded ${upstream.status} ${upstream.statusText}`, detail: text.slice(0, 300) });
    }
    let data;
    try { data = JSON.parse(text); } catch { return sendJson(res, 502, { error: "Leads API did not return JSON.", detail: text.slice(0, 300) }); }
    return sendJson(res, 200, data);
  } catch (err) {
    return sendJson(res, 502, { error: `Could not reach the leads API: ${err.name === "TimeoutError" ? "timed out" : err.message}` });
  }
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");

  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", { Allow: "GET, HEAD" });

  if (pathname === "/admin" || pathname === "/admin/") {
    if (!requireAdmin(req, res)) return;
    return fs.readFile(path.join(__dirname, "admin.html"), (err, buf) =>
      err ? send(res, 500, "admin.html missing") : send(res, 200, buf, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }));
  }

  if (pathname === "/api/leads") {
    if (!requireAdmin(req, res)) return;
    return handleLeads(res);
  }

  const file = PUBLIC_FILES[pathname];
  if (file) {
    return fs.readFile(path.join(__dirname, file[0]), (err, buf) =>
      err ? send(res, 404, "Not found") : send(res, 200, buf, { "Content-Type": file[1] }));
  }

  send(res, 404, "Not found", { "Content-Type": "text/plain" });
});

server.listen(Number(PORT), HOST, () => {
  console.log(`Site:   http://localhost:${PORT}/`);
  console.log(`Leads:  http://localhost:${PORT}/admin  ${ADMIN_PASSWORD ? "" : "(disabled — set ADMIN_PASSWORD in .env)"}`);
  if (!LEADS_API_URL) console.log("Note:   LEADS_API_URL is not set yet, so /admin will show a configuration message.");
});
