import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import { z } from "zod";
import {
  attachSessionCookie,
  clearSessionCookie,
  getUserById,
  hashPassword,
  requireAuth,
  verifyPassword,
  createSessionToken,
  type AuthenticatedRequest,
} from "./auth.ts";
import { db } from "./db.ts";
import { parseUploadedDocument } from "./docParser.ts";
import {
  generateDocxBuffer,
  generatePdfBuffer,
  generateUtf8TxtBuffer,
} from "./exporters.ts";
import {
  countWords,
  getGlobalLeaderboard,
  getUserGamificationProfile,
  recordActivityAndEvaluateBadges,
} from "./gamification.ts";
import {
  evaluateShortAnswersAndFeedback,
  generateDocumentStudyPack,
  generateLearningExplanation,
  generateQuizQuestions,
  type QuizQuestion,
} from "./gemini.ts";
import { normalizeLanguageName } from "./languages.ts";

export const apiRouter = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function formatStructuredPlainText(s: any): string {
  if (!s) return "";
  return [
    `SIMPLE DEFINITION:\n${s.simpleDefinition || ""}`,
    `EASY EXPLANATION:\n${s.easyExplanation || ""}`,
    `STEP-BY-STEP EXPLANATION:\n${(s.detailedSteps || []).map((x: string, i: number) => `${i + 1}. ${x}`).join("\n")}`,
    `REAL-LIFE EXAMPLES:\n${(s.realLifeExamples || []).map((x: string) => `- ${x}`).join("\n")}`,
    `APPLICATIONS:\n${(s.applications || []).map((x: string) => `- ${x}`).join("\n")}`,
    `ADVANTAGES:\n${(s.advantages || []).map((x: string) => `+ ${x}`).join("\n")}`,
    `DISADVANTAGES:\n${(s.disadvantages || []).map((x: string) => `- ${x}`).join("\n")}`,
    `IMPORTANT POINTS:\n${(s.importantPoints || []).map((x: string) => `* ${x}`).join("\n")}`,
    `SUMMARY:\n${s.summary || ""}`,
    `KEY TERMS:\n${(s.keyTerms || []).map((k: any) => `${k.term}: ${k.meaning}`).join("\n")}`,
    `EXAM PREPARATION QUESTIONS:\n${(s.examQuestions || []).map((q: any) => `Q: ${q.question}\nHint: ${q.answerHint}`).join("\n\n")}`,
    `REVISION NOTES:\n${(s.revisionNotes || []).map((x: string) => `- ${x}`).join("\n")}`,
    `RELATED TOPICS:\n${(s.relatedTopics || []).join(", ")}`,
  ].join("\n\n");
}

/* ==================== AUTH ROUTES ==================== */

const signupSchema = z
  .object({
    username: z.string().trim().min(3, "Username must be at least 3 characters").max(30),
    email: z.string().trim().email("Please enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters").max(100),
    confirmPassword: z.string(),
    preferredLanguage: z.string().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

apiRouter.post("/auth/signup", async (req, res) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
      return;
    }
    const email = parsed.data.email.toLowerCase();
    const username = parsed.data.username;
    const preferredLanguage = normalizeLanguageName(parsed.data.preferredLanguage || "English");

    const existing = db
      .prepare("SELECT id FROM users WHERE lower(email) = ? OR lower(username) = ?")
      .get(email, username.toLowerCase());
    if (existing) {
      res.status(409).json({ error: "Username or email is already registered." });
      return;
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(parsed.data.password);

    db.prepare(
      `INSERT INTO users (id, username, email, password_hash, preferred_language, streak_days, longest_streak, last_active_date)
       VALUES (?, ?, ?, ?, ?, 0, 0, NULL)`
    ).run(id, username, email, passwordHash, preferredLanguage);

    db.prepare("INSERT OR IGNORE INTO user_languages_explored (user_id, language) VALUES (?, ?)").run(
      id,
      preferredLanguage
    );

    const token = await createSessionToken({ userId: id, email });
    attachSessionCookie(req, res, token);

    const user = getUserById(id);
    const gamification = getUserGamificationProfile(id);
    res.status(201).json({ user, gamification, token });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Signup failed" });
  }
});

apiRouter.post("/auth/login", async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().trim().min(1, "Email or username is required"),
      password: z.string().min(1, "Password required"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid credentials" });
      return;
    }

    const identifier = parsed.data.email.toLowerCase();
    const row = db
      .prepare("SELECT id, email, password_hash FROM users WHERE lower(email) = ? OR lower(username) = ?")
      .get(identifier, identifier) as
      | { id: string; email: string; password_hash: string }
      | undefined;

    if (!row || !(await verifyPassword(parsed.data.password, row.password_hash))) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const token = await createSessionToken({ userId: row.id, email: row.email });
    attachSessionCookie(req, res, token);
    const user = getUserById(row.id);
    const gamification = getUserGamificationProfile(row.id);
    res.json({ user, gamification, token });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Sign in failed" });
  }
});

apiRouter.post("/auth/logout", (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

apiRouter.get("/auth/me", requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const gamification = getUserGamificationProfile(user.id);
  res.json({ user, gamification });
});

apiRouter.patch("/auth/me", requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({
      username: z.string().trim().min(3).max(30).optional(),
      preferredLanguage: z.string().optional(),
      defaultMode: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid update" });
      return;
    }

    const user = req.user!;
    if (parsed.data.username && parsed.data.username.toLowerCase() !== user.username.toLowerCase()) {
      const taken = db
        .prepare("SELECT id FROM users WHERE lower(username) = ? AND id != ?")
        .get(parsed.data.username.toLowerCase(), user.id);
      if (taken) {
        res.status(409).json({ error: "Username is already taken." });
        return;
      }
    }

    const nextUsername = parsed.data.username || user.username;
    const nextLang = parsed.data.preferredLanguage
      ? normalizeLanguageName(parsed.data.preferredLanguage)
      : user.preferredLanguage;
    const nextMode = parsed.data.defaultMode || user.defaultMode;

    db.prepare(
      `UPDATE users SET username = ?, preferred_language = ?, default_mode = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(nextUsername, nextLang, nextMode, user.id);

    res.json({ user: getUserById(user.id) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

apiRouter.post("/auth/change-password", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6, "New password must be at least 6 characters"),
        confirmPassword: z.string(),
      })
      .refine((d) => d.newPassword === d.confirmPassword, {
        message: "New passwords do not match.",
        path: ["confirmPassword"],
      });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
      return;
    }

    const row = db
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(req.user!.id) as { password_hash: string };

    if (!(await verifyPassword(parsed.data.currentPassword, row.password_hash))) {
      res.status(400).json({ error: "Current password is incorrect." });
      return;
    }

    const nextHash = await hashPassword(parsed.data.newPassword);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
      nextHash,
      req.user!.id
    );
    res.json({ message: "Password updated successfully." });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Password change failed" });
  }
});

apiRouter.post("/auth/forgot-password", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  const user = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email) as
    | { id: string }
    | undefined;
  if (!user) {
    res.json({ message: "If an account exists for that email, a reset token has been created." });
    return;
  }

  const rawToken = crypto.randomBytes(20).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  db.prepare(
    "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
  ).run(crypto.randomUUID(), user.id, tokenHash, expiresAt);

  res.json({
    message: "Reset token generated (valid for 30 minutes). Copy and enter it below to set a new password.",
    resetToken: rawToken,
  });
});

apiRouter.post("/auth/reset-password", async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body || {};
  if (!token || !newPassword || String(newPassword).length < 6 || newPassword !== confirmPassword) {
    res.status(400).json({ error: "Valid token and matching passwords (min 6 chars) are required." });
    return;
  }

  const tokenHash = crypto.createHash("sha256").update(String(token).trim()).digest("hex");
  const record = db
    .prepare("SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token_hash = ?")
    .get(tokenHash) as { id: string; user_id: string; expires_at: string; used: number } | undefined;

  if (!record || record.used === 1 || new Date(record.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: "Reset token is invalid or expired." });
    return;
  }

  const passwordHash = await hashPassword(String(newPassword));
  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
      passwordHash,
      record.user_id
    );
    db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE id = ?").run(record.id);
  });
  tx();

  res.json({ message: "Password reset successful. You can now sign in." });
});

/* ==================== CHAT & AI LEARNING ROUTES ==================== */

apiRouter.get("/chat/sessions", requireAuth, (req: AuthenticatedRequest, res) => {
  const q = String(req.query.q || "").trim();
  const rows = q
    ? db
        .prepare(
          `SELECT id, title, language, mode, created_at as createdAt, updated_at as updatedAt
           FROM chat_sessions WHERE user_id = ? AND lower(title) LIKE ? ORDER BY updated_at DESC`
        )
        .all(req.user!.id, `%${q.toLowerCase()}%`)
    : db
        .prepare(
          `SELECT id, title, language, mode, created_at as createdAt, updated_at as updatedAt
           FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC`
        )
        .all(req.user!.id);

  res.json({ sessions: rows });
});

apiRouter.post("/chat/sessions", requireAuth, (req: AuthenticatedRequest, res) => {
  const id = crypto.randomUUID();
  const title = String(req.body?.title || "New Learning Session").trim().slice(0, 80);
  const language = req.body?.language || req.user!.preferredLanguage;
  const mode = req.body?.mode || req.user!.defaultMode;

  db.prepare(
    "INSERT INTO chat_sessions (id, user_id, title, language, mode) VALUES (?, ?, ?, ?, ?)"
  ).run(id, req.user!.id, title, language, mode);

  const session = db
    .prepare(
      "SELECT id, title, language, mode, created_at as createdAt, updated_at as updatedAt FROM chat_sessions WHERE id = ?"
    )
    .get(id);
  res.status(201).json({ session });
});

apiRouter.get("/chat/sessions/:id", requireAuth, (req: AuthenticatedRequest, res) => {
  const session = db
    .prepare(
      "SELECT id, title, language, mode, created_at as createdAt, updated_at as updatedAt FROM chat_sessions WHERE id = ? AND user_id = ?"
    )
    .get(req.params.id, req.user!.id);

  if (!session) {
    res.status(404).json({ error: "Chat session not found." });
    return;
  }

  const messages = db
    .prepare(
      `SELECT id, role, content, structured_json as structured, source_type as sourceType,
              language, mode, model_used as modelUsed, created_at as createdAt
       FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC`
    )
    .all(req.params.id);

  res.json({ session, messages });
});

apiRouter.patch("/chat/sessions/:id", requireAuth, (req: AuthenticatedRequest, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) {
    res.status(400).json({ error: "Conversation title cannot be empty." });
    return;
  }

  const existing = db
    .prepare("SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user!.id);
  if (!existing) {
    res.status(404).json({ error: "Chat session not found." });
    return;
  }

  db.prepare("UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?").run(
    title.slice(0, 100),
    req.params.id
  );
  res.json({ ok: true, title: title.slice(0, 100) });
});

apiRouter.delete("/chat/sessions/:id", requireAuth, (req: AuthenticatedRequest, res) => {
  const info = db
    .prepare("DELETE FROM chat_sessions WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: "Chat session not found." });
    return;
  }
  res.json({ ok: true });
});

apiRouter.post("/chat/ask", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      sessionId,
      prompt,
      language,
      mode,
      deepThinking,
      sourceType,
      documentId,
      followUpAction,
    } = req.body || {};

    if (!String(prompt || "").trim()) {
      res.status(400).json({ error: "Please enter a topic or question." });
      return;
    }

    const user = req.user!;
    const resolvedLang = language || user.preferredLanguage;
    const resolvedMode = mode || user.defaultMode;
    const resolvedSource = sourceType || "text";

    let activeSessionId = sessionId as string | undefined;
    let existingMessages: { role: string; content: string }[] = [];
    let currentTitle = String(prompt).trim().slice(0, 48);

    if (activeSessionId) {
      const sess = db
        .prepare("SELECT id, title FROM chat_sessions WHERE id = ? AND user_id = ?")
        .get(activeSessionId, user.id) as { id: string; title: string } | undefined;
      if (!sess) {
        activeSessionId = undefined;
      } else {
        currentTitle = sess.title;
        existingMessages = db
          .prepare("SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC")
          .all(activeSessionId) as { role: string; content: string }[];
      }
    }

    if (!activeSessionId) {
      activeSessionId = crypto.randomUUID();
      db.prepare(
        "INSERT INTO chat_sessions (id, user_id, title, language, mode) VALUES (?, ?, ?, ?, ?)"
      ).run(activeSessionId, user.id, currentTitle, resolvedLang, resolvedMode);
    }

    let documentContext: string | undefined;
    if (documentId) {
      const doc = db
        .prepare("SELECT extracted_text FROM documents WHERE id = ? AND user_id = ?")
        .get(documentId, user.id) as { extracted_text: string } | undefined;
      documentContext = doc?.extracted_text;
    }

    const userMsgId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, source_type, language, mode)
       VALUES (?, ?, 'user', ?, ?, ?, ?)`
    ).run(userMsgId, activeSessionId, String(prompt).trim(), resolvedSource, resolvedLang, resolvedMode);

    const { structured, modelUsed } = await generateLearningExplanation({
      prompt: String(prompt).trim(),
      language: resolvedLang,
      mode: resolvedMode,
      deepThinking: Boolean(deepThinking),
      history: existingMessages,
      documentContext,
      followUpAction,
    });

    const plainText = formatStructuredPlainText(structured);
    const detectedLang = normalizeLanguageName(
      structured.detectedLanguage || (resolvedLang === "Auto-Detect" ? "English" : resolvedLang)
    );

    const assistantMsgId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, structured_json, source_type, language, mode, model_used)
       VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)`
    ).run(
      assistantMsgId,
      activeSessionId,
      `${structured.simpleDefinition}\n\n${structured.summary}`,
      JSON.stringify(structured),
      resolvedSource,
      detectedLang,
      resolvedMode,
      modelUsed
    );

    const nextTitle =
      existingMessages.length === 0 && structured.chatTitle ? structured.chatTitle : currentTitle;

    db.prepare(
      "UPDATE chat_sessions SET title = ?, language = ?, mode = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(nextTitle, detectedLang, resolvedMode, activeSessionId);

    const wordsAdded = countWords(plainText);
    const basePoints = 25 + (modelUsed === "gemini-4-carbon" ? 15 : 0) + (resolvedSource === "voice" ? 5 : 0);
    const gamification = recordActivityAndEvaluateBadges({
      userId: user.id,
      action: resolvedSource === "voice" ? "voice_lesson" : "ai_lesson",
      points: basePoints,
      detail: `Learned: ${nextTitle}`,
      wordsAdded,
      languageUsed: detectedLang,
    });

    const userMessage = db
      .prepare(
        "SELECT id, role, content, structured_json as structured, source_type as sourceType, language, mode, created_at as createdAt FROM chat_messages WHERE id = ?"
      )
      .get(userMsgId);
    const assistantMessage = db
      .prepare(
        "SELECT id, role, content, structured_json as structured, source_type as sourceType, language, mode, model_used as modelUsed, created_at as createdAt FROM chat_messages WHERE id = ?"
      )
      .get(assistantMsgId);

    res.json({
      sessionId: activeSessionId,
      sessionTitle: nextTitle,
      userMessage,
      assistantMessage,
      structured,
      modelUsed,
      gamification,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate answer." });
  }
});

/* ==================== DOCUMENT UPLOAD ROUTES ==================== */

apiRouter.get("/documents", requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT id, file_name as fileName, file_type as fileType, file_size as fileSize,
              language, summary, chapters_json as chaptersJson, questions_json as questionsJson,
              short_notes as shortNotes, detailed_notes as detailedNotes, mcqs_json as mcqsJson,
              revision_points_json as revisionPoints, created_at as createdAt
       FROM documents WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(req.user!.id);
  res.json({ documents: rows });
});

apiRouter.post(
  "/documents",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "Please attach a PDF, DOCX, PPTX, or TXT file." });
        return;
      }

      const language = String(req.body?.language || req.user!.preferredLanguage);
      const { ext, text } = await parseUploadedDocument({
        originalname: file.originalname,
        size: file.size,
        buffer: file.buffer,
      });

      const pack = await generateDocumentStudyPack({
        fileName: file.originalname,
        text,
        language,
      });

      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO documents (
           id, user_id, file_name, file_type, file_size, extracted_text, language,
           summary, chapters_json, questions_json, short_notes, detailed_notes, mcqs_json, revision_points_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        req.user!.id,
        file.originalname,
        ext.toUpperCase(),
        file.size,
        text,
        language,
        pack.summary,
        JSON.stringify(pack.chapters || []),
        JSON.stringify(pack.importantQuestions || []),
        pack.shortNotes || "",
        pack.detailedNotes || "",
        JSON.stringify(pack.mcqs || []),
        JSON.stringify(pack.revisionPoints || [])
      );

      const studyWords = countWords(`${pack.summary} ${pack.shortNotes} ${pack.detailedNotes}`);
      const gamification = recordActivityAndEvaluateBadges({
        userId: req.user!.id,
        action: "document_upload",
        points: 40,
        detail: `Analyzed Document: ${file.originalname}`,
        wordsAdded: studyWords,
        languageUsed: language === "Auto-Detect" ? undefined : language,
      });

      const document = db
        .prepare(
          `SELECT id, file_name as fileName, file_type as fileType, file_size as fileSize,
                  language, summary, chapters_json as chaptersJson, questions_json as questionsJson,
                  short_notes as shortNotes, detailed_notes as detailedNotes, mcqs_json as mcqsJson,
                  revision_points_json as revisionPoints, created_at as createdAt
           FROM documents WHERE id = ?`
        )
        .get(id);

      res.status(201).json({ document, gamification });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Document processing failed." });
    }
  }
);

apiRouter.delete("/documents/:id", requireAuth, (req: AuthenticatedRequest, res) => {
  const info = db
    .prepare("DELETE FROM documents WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  res.json({ ok: true });
});

/* ==================== QUIZ & SCORES ROUTES ==================== */

apiRouter.get("/quizzes", requireAuth, (req: AuthenticatedRequest, res) => {
  const quizzes = db
    .prepare(
      `SELECT id, title, topic, difficulty, language, question_count as questionCount,
              timer_minutes as timerMinutes, questions_json as questionsJson,
              source_doc_id as sourceDocId, created_at as createdAt
       FROM quizzes WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(req.user!.id) as any[];

  const withAttempts = quizzes.map((q) => {
    const attempts = db
      .prepare(
        `SELECT id, total_marks as totalMarks, correct_count as correctCount,
                wrong_count as wrongCount, unanswered, percentage, created_at as createdAt
         FROM quiz_attempts WHERE quiz_id = ? AND user_id = ? ORDER BY created_at DESC`
      )
      .all(q.id, req.user!.id);
    return { ...q, attempts };
  });

  res.json({ quizzes: withAttempts });
});

apiRouter.post("/quizzes", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { topic, count, difficulty, language, questionTypes, timerMinutes, documentId } =
      req.body || {};

    let docText: string | undefined;
    let resolvedTopic = String(topic || "").trim();

    if (documentId) {
      const doc = db
        .prepare("SELECT file_name, extracted_text FROM documents WHERE id = ? AND user_id = ?")
        .get(documentId, req.user!.id) as { file_name: string; extracted_text: string } | undefined;
      if (!doc) {
        res.status(404).json({ error: "Selected document not found." });
        return;
      }
      docText = doc.extracted_text;
      if (!resolvedTopic) resolvedTopic = doc.file_name;
    }

    if (!resolvedTopic) {
      res.status(400).json({ error: "Enter a quiz topic or select an uploaded document." });
      return;
    }

    const qCount = Math.min(Math.max(Number(count) || 5, 1), 50);
    const resolvedLang = normalizeLanguageName(language || req.user!.preferredLanguage);
    const types =
      Array.isArray(questionTypes) && questionTypes.length > 0
        ? questionTypes
        : ["MCQ", "True or False"];

    const generated = await generateQuizQuestions({
      topic: resolvedTopic,
      count: qCount,
      difficulty: difficulty || "Medium",
      language: resolvedLang,
      questionTypes: types,
      documentText: docText,
    });

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO quizzes (id, user_id, title, topic, difficulty, language, question_count, timer_minutes, questions_json, source_doc_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      req.user!.id,
      generated.title,
      resolvedTopic,
      difficulty || "Medium",
      resolvedLang,
      generated.questions.length,
      timerMinutes ? Number(timerMinutes) : null,
      JSON.stringify(generated.questions),
      documentId || null
    );

    const quiz = db
      .prepare(
        `SELECT id, title, topic, difficulty, language, question_count as questionCount,
                timer_minutes as timerMinutes, questions_json as questionsJson,
                source_doc_id as sourceDocId, created_at as createdAt
         FROM quizzes WHERE id = ?`
      )
      .get(id);

    res.status(201).json({ quiz });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Quiz generation failed." });
  }
});

apiRouter.post("/quizzes/:id/submit", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const quiz = db
      .prepare("SELECT * FROM quizzes WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.user!.id) as any;
    if (!quiz) {
      res.status(404).json({ error: "Quiz not found." });
      return;
    }

    const { answers, durationSec } = req.body || {};
    const questions: QuizQuestion[] = JSON.parse(quiz.questions_json);
    const shortToGrade: { id: string; question: string; expected: string; userAnswer: string }[] = [];
    const wrongTopicsSet = new Set<string>();

    const tempResults = questions.map((q) => {
      const userAns = answers?.[q.id];
      const isEmpty =
        userAns === undefined ||
        userAns === null ||
        (typeof userAns === "string" && userAns.trim() === "") ||
        (typeof userAns === "object" && Object.keys(userAns).length === 0);

      if (isEmpty) {
        wrongTopicsSet.add(q.topicTag || quiz.topic);
        return { q, userAns, status: "unanswered" as const, isCorrect: false };
      }

      if (q.type === "Short Answer") {
        shortToGrade.push({
          id: q.id,
          question: q.question,
          expected: String(q.correctAnswer),
          userAnswer: String(userAns),
        });
        return { q, userAns, status: "pending" as const, isCorrect: false };
      }

      let isCorrect = false;
      if (q.type === "Match the Following" && typeof q.correctAnswer === "object" && !Array.isArray(q.correctAnswer)) {
        const expectedMap = q.correctAnswer as Record<string, string>;
        const userMap = (typeof userAns === "object" ? userAns : {}) as Record<string, string>;
        const keys = Object.keys(expectedMap);
        isCorrect =
          keys.length > 0 &&
          keys.every(
            (k) =>
              String(userMap[k] || "").trim().toLowerCase() ===
              String(expectedMap[k] || "").trim().toLowerCase()
          );
      } else {
        isCorrect =
          String(userAns).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase();
      }

      if (!isCorrect) wrongTopicsSet.add(q.topicTag || quiz.topic);
      return {
        q,
        userAns,
        status: isCorrect ? ("correct" as const) : ("wrong" as const),
        isCorrect,
      };
    });

    const partialCorrect = tempResults.filter((r) => r.isCorrect).length;
    const aiEval = await evaluateShortAnswersAndFeedback({
      topic: quiz.topic,
      language: quiz.language,
      shortAnswers: shortToGrade,
      wrongTopics: [...wrongTopicsSet],
      percentage: Math.round((partialCorrect / Math.max(questions.length, 1)) * 100),
    });

    const shortMap = new Map((aiEval.shortResults || []).map((s) => [s.id, s.isCorrect]));

    const questionResults = tempResults.map((r) => {
      let isCorrect = r.isCorrect;
      let status = r.status;
      if (r.status === "pending") {
        isCorrect = Boolean(shortMap.get(r.q.id));
        status = isCorrect ? "correct" : "wrong";
        if (!isCorrect) wrongTopicsSet.add(r.q.topicTag || quiz.topic);
      }
      return {
        id: r.q.id,
        question: r.q.question,
        type: r.q.type,
        topicTag: r.q.topicTag,
        userAnswer: r.userAns ?? "",
        correctAnswer: r.q.correctAnswer,
        explanation: r.q.explanation,
        status,
        isCorrect,
      };
    });

    const correctCount = questionResults.filter((r) => r.status === "correct").length;
    const unanswered = questionResults.filter((r) => r.status === "unanswered").length;
    const wrongCount = questions.length - correctCount - unanswered;
    const percentage = Math.round((correctCount / Math.max(questions.length, 1)) * 1000) / 10;

    const feedback = {
      weakTopics: [...wrongTopicsSet],
      improvementSuggestions: aiEval.improvementSuggestions || [],
      questionResults,
    };

    const attemptId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO quiz_attempts (
         id, quiz_id, user_id, total_marks, correct_count, wrong_count, unanswered,
         percentage, answers_json, feedback_json, duration_sec
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      attemptId,
      quiz.id,
      req.user!.id,
      questions.length,
      correctCount,
      wrongCount,
      unanswered,
      percentage,
      JSON.stringify(answers || {}),
      JSON.stringify(feedback),
      Number(durationSec) || 0
    );

    const quizPoints = 30 + correctCount * 5 + (percentage >= 80 ? 25 : 0);
    const gamification = recordActivityAndEvaluateBadges({
      userId: req.user!.id,
      action: "quiz_completed",
      points: quizPoints,
      detail: `Quiz: ${quiz.title} (${percentage}%)`,
      wordsAdded: questions.length * 18,
      languageUsed: quiz.language,
    });

    const attempt = db
      .prepare(
        `SELECT id, quiz_id as quizId, total_marks as totalMarks, correct_count as correctCount,
                wrong_count as wrongCount, unanswered, percentage, duration_sec as durationSec,
                created_at as createdAt
         FROM quiz_attempts WHERE id = ?`
      )
      .get(attemptId);

    res.json({ attempt, feedback, gamification });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to score quiz." });
  }
});

apiRouter.get("/scores", requireAuth, (req: AuthenticatedRequest, res) => {
  const attempts = db
    .prepare(
      `SELECT qa.id, qa.quiz_id as quizId, qa.total_marks as totalMarks,
              qa.correct_count as correctCount, qa.wrong_count as wrongCount,
              qa.unanswered, qa.percentage, qa.feedback_json as feedbackJson,
              qa.duration_sec as durationSec, qa.created_at as createdAt,
              q.title as quizTitle, q.topic as quizTopic, q.difficulty as quizDifficulty,
              q.language as quizLanguage
       FROM quiz_attempts qa
       JOIN quizzes q ON q.id = qa.quiz_id
       WHERE qa.user_id = ?
       ORDER BY qa.created_at DESC`
    )
    .all(req.user!.id);
  res.json({ attempts });
});

/* ==================== MATERIALS, SAVED TOPICS, DOWNLOADS, DASHBOARD & GAMIFICATION ==================== */

apiRouter.get("/materials", requireAuth, (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const documents = db
    .prepare(
      `SELECT id, file_name as fileName, file_type as fileType, language, summary,
              detailed_notes as detailedNotes, extracted_text as extractedText, created_at as createdAt
       FROM documents WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(uid);

  const notes = db
    .prepare(
      `SELECT id, category, title, language, content, created_at as createdAt
       FROM material_notes WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(uid);

  const quizzes = db
    .prepare(
      `SELECT id, title, topic, difficulty, language, question_count as questionCount,
              questions_json as questionsJson, created_at as createdAt
       FROM quizzes WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(uid);

  const attempts = db
    .prepare(
      `SELECT qa.id, qa.total_marks as totalMarks, qa.correct_count as correctCount,
              qa.percentage, qa.created_at as createdAt, q.title as quizTitle, q.language as quizLanguage
       FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
       WHERE qa.user_id = ? ORDER BY qa.created_at DESC`
    )
    .all(uid);

  const downloads = db
    .prepare(
      `SELECT id, title, category, format, language, content, created_at as createdAt
       FROM download_records WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(uid);

  res.json({ documents, notes, quizzes, attempts, downloads });
});

apiRouter.post("/materials", requireAuth, (req: AuthenticatedRequest, res) => {
  const { category, title, language, content } = req.body || {};
  if (!String(title || "").trim() || !String(content || "").trim()) {
    res.status(400).json({ error: "Title and content are required." });
    return;
  }

  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO material_notes (id, user_id, category, title, language, content) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    req.user!.id,
    category || "note",
    String(title).trim(),
    language || req.user!.preferredLanguage,
    String(content)
  );

  const note = db
    .prepare(
      "SELECT id, category, title, language, content, created_at as createdAt FROM material_notes WHERE id = ?"
    )
    .get(id);
  res.status(201).json({ note });
});

apiRouter.delete("/materials", requireAuth, (req: AuthenticatedRequest, res) => {
  const { type, id } = req.body || {};
  const uid = req.user!.id;
  if (type === "document") db.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").run(id, uid);
  else if (type === "note") db.prepare("DELETE FROM material_notes WHERE id = ? AND user_id = ?").run(id, uid);
  else if (type === "quiz") db.prepare("DELETE FROM quizzes WHERE id = ? AND user_id = ?").run(id, uid);
  else if (type === "download") db.prepare("DELETE FROM download_records WHERE id = ? AND user_id = ?").run(id, uid);
  res.json({ ok: true });
});

apiRouter.get("/saved-topics", requireAuth, (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const collections = db
    .prepare(
      "SELECT id, name, description, created_at as createdAt FROM collections WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(uid);

  const topics = db
    .prepare(
      `SELECT st.id, st.collection_id as collectionId, st.title, st.language, st.mode,
              st.content, st.created_at as createdAt, c.name as collectionName
       FROM saved_topics st
       LEFT JOIN collections c ON c.id = st.collection_id
       WHERE st.user_id = ? ORDER BY st.created_at DESC`
    )
    .all(uid);

  res.json({ collections, topics });
});

apiRouter.post("/saved-topics", requireAuth, (req: AuthenticatedRequest, res) => {
  const body = req.body || {};
  const uid = req.user!.id;

  if (body.kind === "collection") {
    if (!String(body.name || "").trim()) {
      res.status(400).json({ error: "Collection name is required." });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO collections (id, user_id, name, description) VALUES (?, ?, ?, ?)").run(
      id,
      uid,
      String(body.name).trim(),
      String(body.description || "")
    );
    const collection = db
      .prepare("SELECT id, name, description, created_at as createdAt FROM collections WHERE id = ?")
      .get(id);
    res.status(201).json({ collection });
    return;
  }

  if (!String(body.title || "").trim() || !String(body.content || "").trim()) {
    res.status(400).json({ error: "Title and content are required." });
    return;
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO saved_topics (id, user_id, collection_id, title, language, mode, content)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    uid,
    body.collectionId || null,
    String(body.title).trim(),
    body.language || req.user!.preferredLanguage,
    body.mode || req.user!.defaultMode,
    String(body.content)
  );

  const topic = db
    .prepare(
      "SELECT id, collection_id as collectionId, title, language, mode, content, created_at as createdAt FROM saved_topics WHERE id = ?"
    )
    .get(id);
  res.status(201).json({ topic });
});

apiRouter.patch("/saved-topics/:id", requireAuth, (req: AuthenticatedRequest, res) => {
  const { collectionId } = req.body || {};
  db.prepare("UPDATE saved_topics SET collection_id = ? WHERE id = ? AND user_id = ?").run(
    collectionId || null,
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true });
});

apiRouter.delete("/saved-topics", requireAuth, (req: AuthenticatedRequest, res) => {
  const { kind, id } = req.body || {};
  const uid = req.user!.id;
  if (kind === "collection") {
    db.prepare("DELETE FROM collections WHERE id = ? AND user_id = ?").run(id, uid);
  } else {
    db.prepare("DELETE FROM saved_topics WHERE id = ? AND user_id = ?").run(id, uid);
  }
  res.json({ ok: true });
});

apiRouter.get("/downloads", requireAuth, (req: AuthenticatedRequest, res) => {
  const downloads = db
    .prepare(
      `SELECT id, title, category, format, language, content, created_at as createdAt
       FROM download_records WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(req.user!.id);
  res.json({ downloads });
});

apiRouter.post("/downloads", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { title, category, format, language, content } = req.body || {};
    if (!String(title || "").trim() || !String(content || "").trim()) {
      res.status(400).json({ error: "Title and content are required for export." });
      return;
    }

    const fmt = String(format || "TXT").toUpperCase();
    const lang = language || req.user!.preferredLanguage;
    const cat = category || "explanation";
    const dateStr = new Date().toLocaleDateString("en-IN", { dateStyle: "medium" });

    db.prepare(
      `INSERT INTO download_records (id, user_id, title, category, format, language, content)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), req.user!.id, String(title).trim(), cat, fmt, lang, String(content));

    const safeName =
      String(title)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 48) || "LearnMate_Export";
    const subtitle = `${cat} · ${lang} · ${dateStr}`;

    if (fmt === "PRINT_PDF") {
      res.json({ mode: "print-pdf", title, subtitle, dateStr, content });
      return;
    }

    if (fmt === "PDF") {
      const pdfBuf = await generatePdfBuffer({ title, subtitle, content });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
      res.send(pdfBuf);
      return;
    }

    if (fmt === "DOCX") {
      const docxBuf = await generateDocxBuffer({ title, subtitle, content });
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.docx"`);
      res.send(docxBuf);
      return;
    }

    const txtBuf = generateUtf8TxtBuffer({ title, subtitle, content });
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.txt"`);
    res.send(txtBuf);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Download failed." });
  }
});

apiRouter.get("/dashboard", requireAuth, (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;

  const sessions = db
    .prepare(
      `SELECT id, title, language, mode, updated_at as updatedAt
       FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(uid) as any[];

  const attempts = db
    .prepare(
      `SELECT qa.id, qa.percentage, qa.feedback_json as feedbackJson, qa.created_at as createdAt,
              q.title as quizTitle, q.topic as quizTopic
       FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
       WHERE qa.user_id = ? ORDER BY qa.created_at ASC`
    )
    .all(uid) as any[];

  const totalDocs = (
    db.prepare("SELECT COUNT(*) as cnt FROM documents WHERE user_id = ?").get(uid) as { cnt: number }
  ).cnt;
  const savedTopicsCount = (
    db.prepare("SELECT COUNT(*) as cnt FROM saved_topics WHERE user_id = ?").get(uid) as {
      cnt: number;
    }
  ).cnt;
  const recentDownloads = db
    .prepare(
      `SELECT id, title, category, format, language, created_at as createdAt
       FROM download_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`
    )
    .all(uid);

  const totalQuizzes = attempts.length;
  const averageScore =
    totalQuizzes > 0
      ? Math.round((attempts.reduce((sum, a) => sum + a.percentage, 0) / totalQuizzes) * 10) / 10
      : 0;

  const weakMap = new Map<string, number>();
  for (const a of attempts) {
    try {
      const fb = JSON.parse(a.feedbackJson || "{}");
      for (const wt of fb.weakTopics || []) {
        weakMap.set(wt, (weakMap.get(wt) || 0) + 1);
      }
    } catch {}
  }

  const weakTopics = [...weakMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  const recommendedTopics =
    weakTopics.length > 0
      ? weakTopics.map((t) => `Master ${t}`)
      : ["Photosynthesis & Cellular Respiration", "Binary Search & Time Complexity", "World Constitutional History"];

  const gamification = getUserGamificationProfile(uid);
  const topLeaderboard = getGlobalLeaderboard(uid).slice(0, 5);

  res.json({
    stats: {
      totalSessions: sessions.length,
      totalQuizzes,
      averageScore,
      totalDocuments: totalDocs,
      savedTopicsCount,
    },
    chartData: attempts.slice(-8).map((a, idx) => ({
      label: String(a.quizTopic || `Quiz ${idx + 1}`).slice(0, 14),
      score: a.percentage,
    })),
    weakTopics,
    recommendedTopics,
    recentSessions: sessions.slice(0, 5),
    recentDownloads,
    gamification,
    topLeaderboard,
  });
});

apiRouter.get("/gamification/profile", requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ profile: getUserGamificationProfile(req.user!.id) });
});

apiRouter.get("/gamification/leaderboard", requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ leaderboard: getGlobalLeaderboard(req.user!.id) });
});
