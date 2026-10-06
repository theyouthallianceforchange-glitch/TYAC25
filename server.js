import "dotenv/config";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

app.disable("x-powered-by");
app.set("trust proxy", isProduction ? 1 : false);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"]
    }
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: false, limit: "50kb" }));

const PgSession = connectPgSimple(session);
app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || (() => {
    if (isProduction) throw new Error("SESSION_SECRET is required in production.");
    return "development-only-change-me";
  })(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." }
});

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

const clean = (value, max = 255) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

const email = value => {
  const v = clean(value, 160).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : "";
};

const csrf = req => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  return req.session.csrfToken;
};

const requireCsrf = (req, res, next) => {
  const supplied = req.get("x-csrf-token");
  if (!supplied || !req.session.csrfToken ||
      supplied.length !== req.session.csrfToken.length ||
      !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(req.session.csrfToken))) {
    return res.status(403).json({ message: "Security token invalid or expired." });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.adminId) return res.status(401).json({ message: "Administrator login required." });
  next();
};

const audit = async (adminId, action, req) => {
  await pool.query(
    `INSERT INTO audit_logs (admin_user_id, action, ip_address, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [adminId, action, req.ip, clean(req.get("user-agent"), 500)]
  );
};

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch {
    res.status(503).json({ ok: false, database: "unavailable" });
  }
});

app.get("/api/csrf", (req, res) => {
  if (!req.session.adminId) return res.status(401).json({ message: "Login required." });
  res.json({ token: csrf(req) });
});

app.post("/api/members", publicLimiter, async (req, res) => {
  const website = clean(req.body.website, 120);
  if (website) return res.status(400).json({ message: "Registration rejected." });

  const name = clean(req.body.name, 120);
  const memberEmail = email(req.body.email);
  const phone = clean(req.body.phone, 30);
  const community = clean(req.body.community, 120);
  const interest = clean(req.body.interest, 80);

  if (!name || name.length < 2 || !memberEmail || !interest) {
    return res.status(400).json({ message: "Please provide a valid name, email and area of interest." });
  }

  try {
    const existing = await pool.query("SELECT id FROM members WHERE email = $1", [memberEmail]);
    if (existing.rowCount) {
      return res.status(409).json({ message: "That email is already registered." });
    }

    await pool.query(
      `INSERT INTO members (full_name, email, phone, community, interest)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, memberEmail, phone || null, community || null, interest]
    );
    res.status(201).json({ message: "Thank you. Your TYAC membership interest has been received." });
  } catch (err) {
    console.error("member registration error", err);
    res.status(500).json({ message: "The registration service is temporarily unavailable." });
  }
});

app.post("/api/contact", publicLimiter, async (req, res) => {
  const website = clean(req.body.website, 120);
  if (website) return res.status(400).json({ message: "Message rejected." });

  const name = clean(req.body.name, 120);
  const contactEmail = email(req.body.email);
  const subject = clean(req.body.subject, 180);
  const message = typeof req.body.message === "string" ? req.body.message.trim().slice(0, 5000) : "";

  if (!name || !contactEmail || !subject || !message) {
    return res.status(400).json({ message: "Please complete all contact fields." });
  }

  try {
    await pool.query(
      `INSERT INTO contact_messages (full_name, email, subject, message)
       VALUES ($1, $2, $3, $4)`,
      [name, contactEmail, subject, message]
    );
    res.status(201).json({ message: "Your message has been received by TYAC." });
  } catch (err) {
    console.error("contact error", err);
    res.status(500).json({ message: "The message service is temporarily unavailable." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const adminEmail = email(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!adminEmail || password.length < 8) {
    return res.status(400).json({ message: "Enter a valid administrator email and password." });
  }

  try {
    const result = await pool.query(
      "SELECT id, email, password_hash, role, is_active FROM admin_users WHERE email = $1",
      [adminEmail]
    );
    const user = result.rows[0];
    const valid = user && user.is_active && await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ message: "Invalid administrator credentials." });
    }

    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.adminId = user.id;
    req.session.role = user.role;
    req.session.email = user.email;
    csrf(req);

    await audit(user.id, "ADMIN_LOGIN", req);
    res.json({ authenticated: true, email: user.email, role: user.role });
  } catch (err) {
    console.error("login error", err);
    res.status(500).json({ message: "Login service is temporarily unavailable." });
  }
});

app.post("/api/auth/logout", requireAdmin, requireCsrf, async (req, res) => {
  const id = req.session.adminId;
  await audit(id, "ADMIN_LOGOUT", req);
  req.session.destroy(() => res.json({ authenticated: false }));
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.adminId) return res.json({ authenticated: false });
  res.json({ authenticated: true, email: req.session.email, role: req.session.role });
});

app.get("/api/admin/members", requireAdmin, requireCsrf, async (_req, res) => {
  const result = await pool.query(
    `SELECT id, full_name, email, phone, community, interest, status, created_at
     FROM members ORDER BY created_at DESC LIMIT 100`
  );
  res.json({ members: result.rows });
});

app.get("/api/admin/messages", requireAdmin, requireCsrf, async (_req, res) => {
  const result = await pool.query(
    `SELECT id, full_name, email, subject, message, status, created_at
     FROM contact_messages ORDER BY created_at DESC LIMIT 100`
  );
  res.json({ messages: result.rows });
});

app.patch("/api/admin/members/:id/status", requireAdmin, requireCsrf, async (req, res) => {
  const id = Number(req.params.id);
  const status = clean(req.body.status, 20);
  if (!Number.isInteger(id) || !["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid member status." });
  }
  await pool.query("UPDATE members SET status = $1, updated_at = NOW() WHERE id = $2", [status, id]);
  await audit(req.session.adminId, `MEMBER_STATUS_${status.toUpperCase()}_${id}`, req);
  res.json({ message: "Member status updated." });
});

app.patch("/api/admin/messages/:id/status", requireAdmin, requireCsrf, async (req, res) => {
  const id = Number(req.params.id);
  const status = clean(req.body.status, 20);
  if (!Number.isInteger(id) || !["new", "read", "resolved"].includes(status)) {
    return res.status(400).json({ message: "Invalid message status." });
  }
  await pool.query("UPDATE contact_messages SET status = $1, updated_at = NOW() WHERE id = $2", [status, id]);
  await audit(req.session.adminId, `MESSAGE_STATUS_${status.toUpperCase()}_${id}`, req);
  res.json({ message: "Message status updated." });
});

app.use(express.static(__dirname, {
  extensions: ["html"],
  maxAge: isProduction ? "1h" : 0
}));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ message: "API route not found." });
  res.sendFile(path.join(__dirname, "index.html"));
});

const start = async () => {
  await pool.query("SELECT 1");
  app.listen(PORT, "0.0.0.0", () => console.log(`TYAC portal running on http://localhost:${PORT}`));
};

start().catch(err => {
  console.error("Unable to start TYAC server:", err);
  process.exit(1);
});
