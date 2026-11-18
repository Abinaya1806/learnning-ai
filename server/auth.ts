import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db.ts";

export const COOKIE_NAME = "learnmate_session";

function getJwtSecret(): Uint8Array {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.length >= 16) {
    return new TextEncoder().encode(envSecret);
  }
  const secretFile = path.resolve(process.cwd(), ".learnmate_jwt_secret");
  let stored = "";
  if (fs.existsSync(secretFile)) {
    stored = fs.readFileSync(secretFile, "utf-8").trim();
  }
  if (!stored || stored.length < 32) {
    stored = crypto.randomBytes(48).toString("hex");
    fs.writeFileSync(secretFile, stored, { mode: 0o600 });
  }
  return new TextEncoder().encode(stored);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: { userId: string; email: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (typeof payload.userId === "string" && typeof payload.email === "string") {
      return { userId: payload.userId, email: payload.email };
    }
    return null;
  } catch {
    return null;
  }
}

function appendPartitionedAttribute(res: Response): void {
  const existing = res.getHeader("Set-Cookie");
  const list = Array.isArray(existing)
    ? existing.map(String)
    : existing
    ? [String(existing)]
    : [];
  res.setHeader(
    "Set-Cookie",
    list.map((cookie) =>
      cookie.startsWith(`${COOKIE_NAME}=`) && !/;\s*Partitioned\b/i.test(cookie)
        ? `${cookie}; Partitioned`
        : cookie
    )
  );
}

export function attachSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers["x-forwarded-proto"] === "https" ||
    process.env.NODE_ENV === "production";

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? "none" : "lax",
    secure: isHttps,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  if (isHttps) {
    appendPartitionedAttribute(res);
  }
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    req.headers["x-forwarded-proto"] === "https" ||
    process.env.NODE_ENV === "production";

  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: isHttps ? "none" : "lax",
    secure: isHttps,
    path: "/",
  });

  if (isHttps) {
    appendPartitionedAttribute(res);
  }
}

export interface SafeUser {
  id: string;
  username: string;
  email: string;
  preferredLanguage: string;
  defaultMode: string;
  points: number;
  wordsLearned: number;
  streakDays: number;
  longestStreak: number;
  createdAt: string;
}

export interface AuthenticatedRequest extends Request {
  user?: SafeUser;
}

export function getUserById(userId: string): SafeUser | null {
  const row = db
    .prepare(
      `SELECT id, username, email, preferred_language as preferredLanguage,
              default_mode as defaultMode, points, words_learned as wordsLearned,
              CASE
                WHEN last_active_date IS NOT NULL AND last_active_date >= date('now', '-1 day')
                THEN streak_days
                ELSE 0
              END as streakDays,
              longest_streak as longestStreak,
              created_at as createdAt
       FROM users WHERE id = ?`
    )
    .get(userId) as SafeUser | undefined;
  return row || null;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cookieToken = req.cookies?.[COOKIE_NAME];
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const queryToken =
      req.method === "GET" && typeof req.query.token === "string" ? req.query.token : undefined;
    const token = cookieToken || bearerToken || queryToken;

    if (!token) {
      res.status(401).json({ error: "Authentication required. Please sign in." });
      return;
    }

    const decoded = await verifySessionToken(token);
    if (!decoded) {
      res.status(401).json({ error: "Session expired. Please sign in again." });
      return;
    }

    const user = getUserById(decoded.userId);
    if (!user) {
      res.status(401).json({ error: "Account not found." });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid authentication session." });
  }
}
