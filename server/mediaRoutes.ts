import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import multer from "multer";
import { requireAuth, type AuthenticatedRequest } from "./auth.ts";
import { db } from "./db.ts";
import { countWords, recordActivityAndEvaluateBadges } from "./gamification.ts";
import { generateOrEditStudyImage, generateStudyVideo } from "./gemini.ts";

export const mediaRouter = express.Router();

const MEDIA_DIR = path.resolve(process.cwd(), "generated_media");
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ALLOWED_IMAGE_RATIOS = new Set([
  "1:1",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "1:4",
  "1:8",
  "4:1",
  "8:1",
]);
const ALLOWED_IMAGE_SIZES = new Set(["1K", "2K", "4K"]);
const ALLOWED_VIDEO_RATIOS = new Set(["16:9", "9:16"]);
const ALLOWED_VIDEO_RESOLUTIONS = new Set(["360p", "720p", "1080p"]);

mediaRouter.use(requireAuth);

mediaRouter.get("/list", (req: AuthenticatedRequest, res) => {
  const kind = String(req.query.kind || "");
  const rows = kind
    ? db
        .prepare(
          `SELECT id, kind, title, prompt, aspect_ratio as aspectRatio, resolution, duration,
                  model_used as modelUsed, interaction_id as interactionId, mime_type as mimeType,
                  caption, created_at as createdAt
           FROM media_creations
           WHERE user_id = ? AND kind = ?
           ORDER BY created_at DESC`
        )
        .all(req.user!.id, kind)
    : db
        .prepare(
          `SELECT id, kind, title, prompt, aspect_ratio as aspectRatio, resolution, duration,
                  model_used as modelUsed, interaction_id as interactionId, mime_type as mimeType,
                  caption, created_at as createdAt
           FROM media_creations
           WHERE user_id = ?
           ORDER BY created_at DESC`
        )
        .all(req.user!.id);

  res.json({ items: rows });
});

mediaRouter.post("/image", upload.single("sourceImage"), async (req: AuthenticatedRequest, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) {
      res.status(400).json({ error: "Please enter a prompt to generate or edit an image." });
      return;
    }

    const rawRatio = String(req.body?.aspectRatio || "1:1");
    const aspectRatio = ALLOWED_IMAGE_RATIOS.has(rawRatio) ? rawRatio : "1:1";
    const rawSize = String(req.body?.imageSize || "1K");
    const imageSize = ALLOWED_IMAGE_SIZES.has(rawSize) ? rawSize : "1K";
    const useGoogleSearch =
      req.body?.useGoogleSearch === true || req.body?.useGoogleSearch === "true";

    let sourceImageBase64: string | undefined;
    let sourceImageMimeType: string | undefined;

    if (req.file) {
      if (!req.file.mimetype.startsWith("image/")) {
        res.status(400).json({ error: "Uploaded file must be a PNG, JPEG, or WebP image." });
        return;
      }
      sourceImageBase64 = req.file.buffer.toString("base64");
      sourceImageMimeType = req.file.mimetype;
    } else if (req.body?.sourceMediaId) {
      const existing = db
        .prepare(
          "SELECT file_name, mime_type FROM media_creations WHERE id = ? AND user_id = ? AND kind = 'image'"
        )
        .get(String(req.body.sourceMediaId), req.user!.id) as
        | { file_name: string; mime_type: string }
        | undefined;
      if (existing) {
        const fullPath = path.join(MEDIA_DIR, path.basename(existing.file_name));
        if (fs.existsSync(fullPath)) {
          sourceImageBase64 = fs.readFileSync(fullPath).toString("base64");
          sourceImageMimeType = existing.mime_type;
        }
      }
    }

    const result = await generateOrEditStudyImage({
      prompt,
      aspectRatio,
      imageSize,
      useGoogleSearch,
      sourceImageBase64,
      sourceImageMimeType,
    });

    const id = crypto.randomUUID();
    const ext = result.mimeType.includes("jpeg") ? "jpg" : result.mimeType.includes("webp") ? "webp" : "png";
    const fileName = `${id}.${ext}`;
    const filePath = path.join(MEDIA_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(result.imageBase64, "base64"));

    const title = prompt.slice(0, 64);
    db.prepare(
      `INSERT INTO media_creations
         (id, user_id, kind, title, prompt, aspect_ratio, resolution, model_used, file_name, mime_type, caption)
       VALUES (?, ?, 'image', ?, ?, ?, ?, 'gemini-nano-banana-2.1', ?, ?, ?)`
    ).run(id, req.user!.id, title, prompt, aspectRatio, imageSize, fileName, result.mimeType, result.caption);

    const gamification = recordActivityAndEvaluateBadges({
      userId: req.user!.id,
      action: sourceImageBase64 ? "image_edited" : "image_generated",
      points: 25,
      detail: `${sourceImageBase64 ? "Edited" : "Generated"} visual: ${title}`,
      wordsAdded: countWords(prompt) + countWords(result.caption),
      languageUsed: req.user!.preferredLanguage,
    });

    const item = db
      .prepare(
        `SELECT id, kind, title, prompt, aspect_ratio as aspectRatio, resolution, duration,
                model_used as modelUsed, interaction_id as interactionId, mime_type as mimeType,
                caption, created_at as createdAt
         FROM media_creations WHERE id = ?`
      )
      .get(id);

    res.status(201).json({ item, gamification });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Image generation failed." });
  }
});

mediaRouter.post("/video", upload.single("referenceImage"), async (req: AuthenticatedRequest, res) => {
  req.setTimeout(360000);
  res.setTimeout(360000);
  try {
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) {
      res.status(400).json({ error: "Please enter a prompt describing the study video." });
      return;
    }

    const rawRatio = String(req.body?.aspectRatio || "16:9");
    if (!ALLOWED_VIDEO_RATIOS.has(rawRatio)) {
      res.status(400).json({ error: "Video aspect ratio must be 16:9 or 9:16." });
      return;
    }
    const aspectRatio = rawRatio as "16:9" | "9:16";

    const rawRes = String(req.body?.resolution || "720p");
    const resolution = (ALLOWED_VIDEO_RESOLUTIONS.has(rawRes) ? rawRes : "720p") as
      | "360p"
      | "720p"
      | "1080p";

    const rawDurNum = Number.parseInt(String(req.body?.duration || "8").replace(/s$/i, ""), 10);
    const clampedDur = Number.isFinite(rawDurNum) ? Math.min(Math.max(rawDurNum, 3), 15) : 8;
    const duration = `${clampedDur}s`;
    const previousInteractionId = req.body?.previousInteractionId
      ? String(req.body.previousInteractionId)
      : undefined;

    let referenceImageBase64: string | undefined;
    let referenceImageMimeType: string | undefined;
    if (req.file && req.file.mimetype.startsWith("image/")) {
      referenceImageBase64 = req.file.buffer.toString("base64");
      referenceImageMimeType = req.file.mimetype;
    } else if (req.body?.sourceMediaId) {
      const existing = db
        .prepare(
          "SELECT file_name, mime_type FROM media_creations WHERE id = ? AND user_id = ? AND kind = 'image'"
        )
        .get(String(req.body.sourceMediaId), req.user!.id) as
        | { file_name: string; mime_type: string }
        | undefined;
      if (existing) {
        const fullPath = path.join(MEDIA_DIR, path.basename(existing.file_name));
        if (fs.existsSync(fullPath)) {
          referenceImageBase64 = fs.readFileSync(fullPath).toString("base64");
          referenceImageMimeType = existing.mime_type;
        }
      }
    }

    const result = await generateStudyVideo({
      prompt,
      aspectRatio,
      duration,
      resolution,
      previousInteractionId,
      referenceImageBase64,
      referenceImageMimeType,
    });

    const id = crypto.randomUUID();
    const fileName = `${id}.mp4`;
    const filePath = path.join(MEDIA_DIR, fileName);
    fs.writeFileSync(filePath, result.videoBuffer);

    const title = prompt.slice(0, 64);
    db.prepare(
      `INSERT INTO media_creations
         (id, user_id, kind, title, prompt, aspect_ratio, resolution, duration, model_used, interaction_id, file_name, mime_type)
       VALUES (?, ?, 'video', ?, ?, ?, ?, ?, 'gemini-omni-1.2-flash', ?, ?, ?)`
    ).run(
      id,
      req.user!.id,
      title,
      prompt,
      aspectRatio,
      resolution,
      duration,
      result.interactionId,
      fileName,
      result.mimeType
    );

    const gamification = recordActivityAndEvaluateBadges({
      userId: req.user!.id,
      action: "video_generated",
      points: 35,
      detail: `Generated study video: ${title}`,
      wordsAdded: countWords(prompt) + 30,
      languageUsed: req.user!.preferredLanguage,
    });

    const item = db
      .prepare(
        `SELECT id, kind, title, prompt, aspect_ratio as aspectRatio, resolution, duration,
                model_used as modelUsed, interaction_id as interactionId, mime_type as mimeType,
                caption, created_at as createdAt
         FROM media_creations WHERE id = ?`
      )
      .get(id);

    res.status(201).json({ item, gamification });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Video generation failed." });
  }
});

mediaRouter.get("/file/:id", (req: AuthenticatedRequest, res) => {
  const row = db
    .prepare("SELECT file_name, mime_type, title FROM media_creations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user!.id) as
    | { file_name: string; mime_type: string; title: string }
    | undefined;

  if (!row) {
    res.status(404).json({ error: "Media file not found." });
    return;
  }

  const filePath = path.join(MEDIA_DIR, path.basename(row.file_name));
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Media file missing on disk." });
    return;
  }

  const stat = fs.statSync(filePath);
  const range = req.headers.range;

  if (range && row.mime_type.startsWith("video/")) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = Number.parseInt(parts[0], 10);
    const end = parts[1] ? Number.parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": row.mime_type,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.setHeader("Content-Type", row.mime_type);
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Accept-Ranges", "bytes");
  fs.createReadStream(filePath).pipe(res);
});

mediaRouter.delete("/:id", (req: AuthenticatedRequest, res) => {
  const row = db
    .prepare("SELECT file_name FROM media_creations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user!.id) as { file_name: string } | undefined;

  if (!row) {
    res.status(404).json({ error: "Media item not found." });
    return;
  }

  const filePath = path.join(MEDIA_DIR, path.basename(row.file_name));
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }

  db.prepare("DELETE FROM media_creations WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true });
});

mediaRouter.post("/live-session", (req: AuthenticatedRequest, res) => {
  try {
    const { language, transcriptText, topic } = req.body || {};
    const words = countWords(String(transcriptText || ""));
    const sessionTitle = String(topic || "Live Voice Conversation").trim().slice(0, 80);

    if (String(transcriptText || "").trim().length > 0) {
      const sid = crypto.randomUUID();
      db.prepare(
        "INSERT INTO chat_sessions (id, user_id, title, language, mode) VALUES (?, ?, ?, ?, 'Live Voice')"
      ).run(sid, req.user!.id, sessionTitle || "Live Voice Session", language || req.user!.preferredLanguage);

      db.prepare(
        `INSERT INTO chat_messages (id, session_id, role, content, source_type, language, mode, model_used)
         VALUES (?, ?, 'assistant', ?, 'voice', ?, 'Live Voice', 'gemini-3.8-live')`
      ).run(
        crypto.randomUUID(),
        sid,
        String(transcriptText).slice(0, 12000),
        language || req.user!.preferredLanguage
      );
    }

    const gamification = recordActivityAndEvaluateBadges({
      userId: req.user!.id,
      action: "live_voice_conversation",
      points: 25,
      detail: `Live voice session: ${sessionTitle}`,
      wordsAdded: Math.max(words, 20),
      languageUsed: language || req.user!.preferredLanguage,
    });

    res.json({ ok: true, gamification });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to save live session." });
  }
});
