import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Radio,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { RewardSummaryBanner } from "../components/UiFeedback";
import {
  formatStructuredText,
  getSpeechLocale,
  SUPPORTED_LANGUAGES,
  type GamificationReward,
  type UserProfile,
} from "../types";
import { apiFetch, getStoredAuthToken } from "../utils/authToken";

const LIVE_VOICES = [
  { id: "Zephyr", label: "Zephyr (Balanced Tutor)" },
  { id: "Puck", label: "Puck (Upbeat & Friendly)" },
  { id: "Kore", label: "Kore (Calm & Clear)" },
  { id: "Charon", label: "Charon (Deep & Steady)" },
  { id: "Fenrir", label: "Fenrir (Energetic)" },
] as const;

interface LiveMessageItem {
  id: string;
  role: "student" | "tutor";
  text: string;
}

function floatTo16BitPcmBase64(float32Array: Float32Array): string {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

export function VoiceView({
  user,
  onGamificationUpdate,
  onToast,
}: {
  user: UserProfile;
  onGamificationUpdate: () => void;
  onToast: (type: "success" | "error" | "info" | "reward", msg: string, sub?: string) => void;
}) {
  const [modeTab, setModeTab] = useState<"live" | "notes">("live");
  const [language, setLanguage] = useState(user.preferredLanguage || "English");
  const [voiceName, setVoiceName] = useState<string>("Zephyr");
  const [liveTopic, setLiveTopic] = useState("");

  // Live API (gemini-3.8-live) state
  const [liveStatus, setLiveStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [liveError, setLiveError] = useState("");
  const [liveMessages, setLiveMessages] = useState<LiveMessageItem[]>([]);
  const [liveTextInput, setLiveTextInput] = useState("");
  const [savingLive, setSavingLive] = useState(false);

  // Refs for stable audio/WebSocket callbacks
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isLiveRef = useRef<boolean>(false);

  // Structured Push-to-Ask fallback state
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [lastReward, setLastReward] = useState<GamificationReward | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      cleanupLiveResources();
    };
  }, []);

  function stopQueuedOutputAudio() {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {}
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  }

  function cleanupLiveResources() {
    isLiveRef.current = false;
    stopQueuedOutputAudio();

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
  }

  function playPcm24kChunk(base64Audio: string) {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const float32 = base64PcmToFloat32(base64Audio);
    if (float32.length === 0) return;

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(new Float32Array(float32), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startTime = Math.max(nextStartTimeRef.current, ctx.currentTime + 0.02);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  }

  function appendTranscript(role: "student" | "tutor", delta: string) {
    if (!delta) return;
    setLiveMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text}${last.text && !last.text.endsWith(" ") && !delta.startsWith(" ") ? " " : ""}${delta}` },
        ];
      }
      return [...prev, { id: `${Date.now()}-${Math.random()}`, role, text: delta }];
    });
  }

  async function startLiveConversation() {
    setLiveError("");
    setLiveStatus("connecting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setLiveStatus("idle");
      setLiveError(
        "Microphone access is required for real-time voice conversations. Please allow mic access in browser settings."
      );
      return;
    }

    try {
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      await inputCtx.resume();
      await outputCtx.resume();

      streamRef.current = stream;
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const params = new URLSearchParams({
        language,
        voice: voiceName,
        topic: liveTopic.trim(),
      });
      const authToken = getStoredAuthToken();
      if (authToken) {
        params.set("token", authToken);
      }
      const ws = new WebSocket(`${proto}//${window.location.host}/api/live-ws?${params.toString()}`);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (!isLiveRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
          }
          const samples = e.inputBuffer.getChannelData(0);
          const base64 = floatTo16BitPcmBase64(samples);
          wsRef.current.send(JSON.stringify({ audio: base64 }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.ready) {
            isLiveRef.current = true;
            setLiveStatus("connected");
            onToast("info", "Connected to LearnMate Live Voice (gemini-3.8-live)");
          } else if (msg.error) {
            setLiveError(msg.error);
            stopLiveConversation(false);
          } else if (msg.audio) {
            playPcm24kChunk(msg.audio);
          } else if (msg.interrupted) {
            stopQueuedOutputAudio();
          } else if (msg.inputTranscript) {
            appendTranscript("student", msg.inputTranscript);
          } else if (msg.outputTranscript) {
            appendTranscript("tutor", msg.outputTranscript);
          } else if (msg.closed) {
            cleanupLiveResources();
            setLiveStatus("idle");
          }
        } catch {}
      };

      ws.onerror = () => {
        setLiveError("Live WebSocket connection encountered an error.");
        cleanupLiveResources();
        setLiveStatus("idle");
      };

      ws.onclose = () => {
        if (isLiveRef.current) {
          cleanupLiveResources();
          setLiveStatus("idle");
        }
      };
    } catch (err) {
      cleanupLiveResources();
      setLiveStatus("idle");
      setLiveError(err instanceof Error ? err.message : "Failed to initialize live audio.");
    }
  }

  async function stopLiveConversation(saveRewards = true) {
    cleanupLiveResources();
    setLiveStatus("idle");

    if (saveRewards && liveMessages.length > 0) {
      await saveLiveConversationSummary();
    }
  }

  async function saveLiveConversationSummary() {
    if (savingLive) return;
    setSavingLive(true);
    try {
      const combined = liveMessages
        .map((m) => `${m.role === "student" ? "Student" : "LearnMate Live"}: ${m.text}`)
        .join("\n\n");
      const res = await apiFetch("/api/media/live-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          topic: liveTopic.trim() || "Real-Time Live Voice Session",
          transcriptText: combined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.gamification) {
        setLastReward(data.gamification);
        onGamificationUpdate();
        onToast("success", "Live voice session saved (+25 XP)");
        if (data.gamification.newlyAwardedBadges?.length > 0) {
          onToast("reward", `Badge Unlocked: ${data.gamification.newlyAwardedBadges[0].title}`);
        }
      }
    } catch {} finally {
      setSavingLive(false);
    }
  }

  function sendLiveTextPrompt(e: React.FormEvent) {
    e.preventDefault();
    const text = liveTextInput.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ text }));
    appendTranscript("student", text);
    setLiveTextInput("");
  }

  // Push-to-Ask Structured Notes mode
  async function toggleRecord() {
    setError("");
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError(
        "Speech recognition is not supported in this browser. Please use Live Voice Mode or Google Chrome."
      );
      return;
    }

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {
      setError(
        "Microphone permission was denied. Please allow microphone access in your browser site settings and try again."
      );
      return;
    }

    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = getSpeechLocale(language);
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onerror = (e: any) => {
      setListening(false);
      setError(
        e.error === "not-allowed"
          ? "Microphone access blocked. Enable microphone permission in your browser."
          : `Speech recognition error: ${e.error}`
      );
    };
    rec.onend = () => setListening(false);
    rec.onresult = (e: any) => {
      const spokenText = e.results[0][0].transcript;
      setTranscript(spokenText);
      askAI(spokenText);
    };
    rec.start();
  }

  async function askAI(questionText: string) {
    if (!questionText.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: questionText,
          language,
          mode: "Beginner",
          sourceType: "voice",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Voice AI request failed.");

      const formatted = formatStructuredText(data.structured);
      setAnswer(formatted);

      if (data.gamification) {
        setLastReward(data.gamification);
        onGamificationUpdate();
        if (data.gamification.newlyAwardedBadges?.length > 0) {
          onToast("reward", `Badge Unlocked: ${data.gamification.newlyAwardedBadges[0].title}`);
        }
      }

      speakReply(
        `${data.structured.simpleDefinition}. ${data.structured.easyExplanation}`,
        data.structured.detectedLanguage || language
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process voice query.");
    } finally {
      setLoading(false);
    }
  }

  function speakReply(text: string, lang: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.slice(0, 1400));
    utter.lang = getSpeechLocale(lang);
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  }

  function stopSpeaking() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Mode Switcher */}
      <div className="bg-white rounded-2xl p-2 border border-indigo-100/80 shadow-xs flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setModeTab("live")}
          className={`flex-1 min-w-[200px] py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
            modeTab === "live"
              ? "gradient-brand text-white shadow-sm"
              : "text-slate-600 hover:bg-[#F7F6FF]"
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Live Voice Conversation (gemini-3.8-live)</span>
        </button>
        <button
          type="button"
          onClick={() => setModeTab("notes")}
          className={`flex-1 min-w-[200px] py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
            modeTab === "notes"
              ? "gradient-brand text-white shadow-sm"
              : "text-slate-600 hover:bg-[#F7F6FF]"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Voice-to-Structured Notes</span>
        </button>
      </div>

      {modeTab === "live" ? (
        <div className="bg-white rounded-3xl p-6 md:p-8 border border-indigo-100/80 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Real-Time Live Voice Tutor</h1>
              <p className="text-sm text-slate-600 mt-1">
                Speak naturally with <span className="font-semibold text-[#6C63FF]">gemini-3.8-live</span> for low-latency bidirectional voice tutoring. You can interrupt anytime.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold shrink-0">
              {liveStatus === "connected" ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Live Audio Active</span>
                </span>
              ) : liveStatus === "connecting" ? (
                <span className="inline-flex items-center gap-1.5 text-[#6C63FF] bg-[#F7F6FF] border border-indigo-200 px-3 py-1.5 rounded-xl">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </span>
              ) : (
                <span className="text-slate-500">Ready to connect</span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Language</label>
              <select
                disabled={liveStatus !== "idle"}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white disabled:bg-slate-50"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name} ({l.nativeLabel})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">AI Tutor Voice</label>
              <select
                disabled={liveStatus !== "idle"}
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white disabled:bg-slate-50"
              >
                {LIVE_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Study Topic (Optional)
              </label>
              <input
                disabled={liveStatus !== "idle"}
                value={liveTopic}
                onChange={(e) => setLiveTopic(e.target.value)}
                placeholder="e.g., Newton's Laws, Tamil Grammar..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm disabled:bg-slate-50"
              />
            </div>
          </div>

          <div className="flex flex-col items-center justify-center py-4 gap-3">
            {liveStatus === "idle" ? (
              <button
                type="button"
                onClick={startLiveConversation}
                className="px-7 py-4 rounded-2xl gradient-brand text-white text-sm font-semibold shadow-md hover:opacity-95 transition flex items-center gap-2.5 cursor-pointer"
              >
                <Phone className="w-5 h-5" />
                <span>Start Live Voice Conversation</span>
              </button>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => stopLiveConversation(true)}
                  className="px-6 py-3.5 rounded-2xl bg-rose-600 text-white text-sm font-semibold shadow-sm hover:bg-rose-700 transition flex items-center gap-2 cursor-pointer"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>End Conversation & Claim XP</span>
                </button>
                <button
                  type="button"
                  onClick={stopQueuedOutputAudio}
                  className="px-4 py-3.5 rounded-2xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold hover:bg-indigo-100/70 transition cursor-pointer"
                >
                  Interrupt / Mute Current Reply
                </button>
              </div>
            )}
            <p className="text-xs text-slate-500">
              Streams 16kHz PCM mic input & plays 24kHz real-time AI audio output
            </p>
          </div>

          {liveError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              {liveError}
            </div>
          )}

          {/* Live Transcript & Optional Text Nudge */}
          <div className="border-t border-slate-100 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Live Conversation Transcript</h2>
              {liveMessages.length > 0 && liveStatus === "idle" && (
                <button
                  type="button"
                  disabled={savingLive}
                  onClick={saveLiveConversationSummary}
                  className="text-xs font-semibold text-[#6C63FF] hover:underline cursor-pointer"
                >
                  {savingLive ? "Saving..." : "Save Transcript to History"}
                </button>
              )}
            </div>

            {liveMessages.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center bg-[#F7F6FF]/60 rounded-2xl">
                Connect above and start speaking—both your voice and the AI tutor&apos;s spoken replies transcribe here live.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {liveMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-3.5 rounded-2xl text-sm ${
                      m.role === "student"
                        ? "bg-[#F7F6FF] text-slate-900 ml-8"
                        : "bg-slate-50 border border-slate-200/70 text-slate-800 mr-8"
                    }`}
                  >
                    <p className="text-[11px] font-semibold text-slate-500 mb-0.5">
                      {m.role === "student" ? user.username : "LearnMate Live Tutor"}
                    </p>
                    <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                  </div>
                ))}
              </div>
            )}

            {liveStatus === "connected" && (
              <form onSubmit={sendLiveTextPrompt} className="flex gap-2 pt-2">
                <input
                  value={liveTextInput}
                  onChange={(e) => setLiveTextInput(e.target.value)}
                  placeholder="Optional: type a formula, spelling, or follow-up during the call..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
                <button
                  type="submit"
                  disabled={!liveTextInput.trim()}
                  className="px-4 py-2.5 rounded-xl gradient-brand text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-8 border border-indigo-100/80 shadow-xs text-center space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Voice-to-Structured Notes</h1>
            <p className="text-sm text-slate-600 mt-1">
              Record a spoken study question to receive full structured revision notes and read-aloud narration.
            </p>
          </div>

          <div className="flex justify-center">
            <select
              aria-label="Voice language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.name} value={l.name}>
                  {l.name} ({l.nativeLabel})
                </option>
              ))}
            </select>
          </div>

          <div className="py-2">
            <button
              type="button"
              onClick={toggleRecord}
              className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center text-white shadow-lg transition cursor-pointer ${
                listening ? "bg-rose-600 scale-105" : "gradient-brand hover:scale-105"
              }`}
              aria-label={listening ? "Stop recording" : "Start voice recording"}
            >
              {listening ? <MicOff className="w-9 h-9" /> : <Mic className="w-9 h-9" />}
            </button>
            <p className="text-xs font-medium text-slate-500 mt-3">
              {listening ? "Listening... tap again to stop" : "Tap microphone to speak your question"}
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm text-left">
              {error}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              askAI(transcript);
            }}
            className="flex gap-2 pt-2 border-t border-slate-100"
          >
            <input
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Your speech transcript appears here (you can also edit or type)..."
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
            <button
              disabled={loading || !transcript.trim()}
              type="submit"
              className="px-4 py-2.5 rounded-xl gradient-brand text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>Ask AI</span>
            </button>
          </form>
        </div>
      )}

      <RewardSummaryBanner reward={lastReward} />

      {modeTab === "notes" && answer && (
        <div className="bg-white rounded-3xl p-6 border border-indigo-100/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="font-bold text-slate-900">Voice Answer & Structured Notes</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => speakReply(answer, language)}
                className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Read Aloud</span>
              </button>
              {speaking && (
                <button
                  type="button"
                  onClick={stopSpeaking}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Stop Audio</span>
                </button>
              )}
            </div>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800 leading-relaxed">
            {answer}
          </pre>
        </div>
      )}
    </div>
  );
}
