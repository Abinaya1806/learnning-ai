import type { Server as HttpServer } from "node:http";
import { Modality, type LiveServerMessage } from "@google/genai";
import { WebSocket, WebSocketServer } from "ws";
import { COOKIE_NAME, getUserById, verifySessionToken } from "./auth.ts";
import { getAIClient } from "./gemini.ts";
import { normalizeLanguageName } from "./languages.ts";

const ALLOWED_VOICES = new Set(["Puck", "Charon", "Kore", "Fenrir", "Zephyr"]);

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

export function attachLiveVoiceWebSocket(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/api/live-ws" });

  wss.on("connection", async (clientWs, req) => {
    try {
      const url = new URL(req.url || "/api/live-ws", "http://localhost");
      const cookies = parseCookies(req.headers.cookie);
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
      const token = cookies[COOKIE_NAME] || bearerToken || url.searchParams.get("token") || undefined;
      if (!token) {
        clientWs.send(JSON.stringify({ error: "Authentication required for Live Voice." }));
        clientWs.close(4401, "Unauthorized");
        return;
      }

      const decoded = await verifySessionToken(token);
      if (!decoded || !getUserById(decoded.userId)) {
        clientWs.send(JSON.stringify({ error: "Session expired. Please sign in again." }));
        clientWs.close(4401, "Unauthorized");
        return;
      }

      const rawLang = url.searchParams.get("language") || "English";
      const language = rawLang === "Auto-Detect" ? "Auto-Detect" : normalizeLanguageName(rawLang);
      const rawVoice = url.searchParams.get("voice") || "Zephyr";
      const voiceName = ALLOWED_VOICES.has(rawVoice) ? rawVoice : "Zephyr";
      const topic = (url.searchParams.get("topic") || "").trim().slice(0, 120);

      const langDirective =
        language === "Auto-Detect"
          ? "Respond naturally in the same language the student speaks (including English, Tamil, Tanglish, Hindi, Telugu, Malayalam, Kannada, Bengali, Marathi, French, Spanish, German, Arabic, Chinese, or Japanese)."
          : `Speak and respond strictly in ${language}. If Tanglish, use natural conversational Tamil mixed with English educational terms.`;

      const systemInstruction = `You are LearnMate AI Live Tutor, a warm, encouraging real-time voice tutor for students.
${langDirective}
${topic ? `Current study focus: ${topic}.` : ""}
Keep spoken answers clear, concise, interactive, and beginner-friendly—check understanding and invite follow-up questions.`;

      const ai = getAIClient();
      let closed = false;

      const sessionPromise = ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            if (!closed && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ ready: true, voice: voiceName, language }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (closed || clientWs.readyState !== WebSocket.OPEN) return;

            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ inputTranscript: content.inputTranscription.text })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ outputTranscript: content.outputTranscription.text })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (err: any) => {
            if (!closed && clientWs.readyState === WebSocket.OPEN) {
              const msg = err?.message || "Live voice connection error.";
              clientWs.send(JSON.stringify({ error: msg }));
            }
          },
          onclose: () => {
            if (!closed && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ closed: true }));
              clientWs.close();
            }
          },
        },
      });

      sessionPromise.catch((err) => {
        if (!closed && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Failed to start gemini-3.8-live session.",
            })
          );
          clientWs.close();
        }
      });

      clientWs.on("message", (raw) => {
        if (closed) return;
        let payload: { audio?: string; text?: string } | null = null;
        try {
          payload = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (!payload) return;

        sessionPromise
          .then((session) => {
            if (closed) return;
            if (payload?.audio) {
              session.sendRealtimeInput({
                audio: { data: payload.audio, mimeType: "audio/pcm;rate=16000" },
              });
            } else if (payload?.text && payload.text.trim()) {
              session.sendRealtimeInput({
                text: payload.text.trim(),
              });
            }
          })
          .catch(() => {});
      });

      clientWs.on("close", () => {
        closed = true;
        sessionPromise
          .then((session) => {
            try {
              session.close();
            } catch {}
          })
          .catch(() => {});
      });
    } catch (err) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            error: err instanceof Error ? err.message : "Unable to initialize live voice.",
          })
        );
        clientWs.close();
      }
    }
  });
}
