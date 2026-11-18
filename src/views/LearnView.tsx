import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  Brain,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Volume2,
} from "lucide-react";
import {
  FOLLOW_UP_ACTIONS,
  formatStructuredText,
  getSpeechLocale,
  LEARNING_MODES,
  SUPPORTED_LANGUAGES,
  type GamificationReward,
  type StructuredExplanation,
  type UserProfile,
} from "../types";
import { RewardSummaryBanner } from "../components/UiFeedback";
import { apiFetch } from "../utils/authToken";
import { triggerDownload } from "../utils/download";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  structured?: string | null;
  sourceType?: string;
  language: string;
  mode: string;
  modelUsed?: string;
}

export function LearnView({
  user,
  initialSessionId,
  initialTopic,
  onClearInitial,
  onGenerateQuizForTopic,
  onGamificationUpdate,
  onToast,
}: {
  user: UserProfile;
  initialSessionId: string | null;
  initialTopic: string;
  onClearInitial: () => void;
  onGenerateQuizForTopic: (topic: string) => void;
  onGamificationUpdate: () => void;
  onToast: (type: "success" | "error" | "info" | "reward", msg: string, sub?: string) => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [sessionTitle, setSessionTitle] = useState<string>("New AI Learning Session");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [prompt, setPrompt] = useState(initialTopic);
  const [language, setLanguage] = useState<string>(user.preferredLanguage || "Auto-Detect");
  const [mode, setMode] = useState<string>(user.defaultMode || "Beginner");
  const [deepThinking, setDeepThinking] = useState(false);
  const [docs, setDocs] = useState<{ id: string; fileName: string }[]>([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [exportFormat, setExportFormat] = useState<"PDF" | "DOCX" | "TXT">("PDF");
  const [translateTarget, setTranslateTarget] = useState<string>("Tamil");
  const [showTranslatePicker, setShowTranslatePicker] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [lastReward, setLastReward] = useState<GamificationReward | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    apiFetch("/api/documents")
      .then((r) => r.json())
      .then((d) => setDocs(d.documents || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialSessionId) {
      setSessionId(initialSessionId);
      apiFetch(`/api/chat/sessions/${initialSessionId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.session) {
            setSessionTitle(d.session.title);
            setLanguage(d.session.language || user.preferredLanguage);
            setMode(d.session.mode || user.defaultMode);
            setMessages(d.messages || []);
          }
        })
        .catch(() => {});
    }
  }, [initialSessionId, user.defaultMode, user.preferredLanguage]);

  useEffect(() => {
    if (initialTopic) {
      setPrompt(initialTopic);
    }
  }, [initialTopic]);

  async function sendQuestion(customPrompt?: string, followUpAction?: string, overrideLang?: string) {
    const text = (customPrompt ?? prompt).trim();
    if (!text) return;

    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          prompt: text,
          language: overrideLang || language,
          mode,
          deepThinking,
          documentId: selectedDocId || undefined,
          followUpAction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get AI explanation.");

      setSessionId(data.sessionId);
      setSessionTitle(data.sessionTitle);
      setMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);
      if (!customPrompt) setPrompt("");
      onClearInitial();

      if (data.gamification) {
        setLastReward(data.gamification);
        onGamificationUpdate();
        if (data.gamification.newlyAwardedBadges?.length > 0) {
          onToast(
            "reward",
            `Badge Unlocked: ${data.gamification.newlyAwardedBadges[0].title}`,
            `+${data.gamification.pointsEarned} XP earned!`
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate explanation.";
      setError(msg);
      onToast("error", msg);
    } finally {
      setLoading(false);
    }
  }

  function startMic() {
    setError("");
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      const msg = "Speech recognition is not supported in this browser. Please use Chrome or Edge.";
      setError(msg);
      onToast("error", msg);
      return;
    }
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = getSpeechLocale(language);
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onerror = (e: any) => {
      setListening(false);
      setError(`Microphone error (${e.error}). Please allow microphone permission in your browser.`);
    };
    rec.onend = () => setListening(false);
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setPrompt((p) => (p ? `${p} ${transcript}` : transcript));
    };
    rec.start();
  }

  function speakText(text: string, lang: string) {
    if (!("speechSynthesis" in window)) {
      onToast("info", "Text-to-speech is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.slice(0, 1400));
    utter.lang = getSpeechLocale(lang);
    window.speechSynthesis.speak(utter);
  }

  async function saveToNotes(s: StructuredExplanation) {
    try {
      const res = await apiFetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "note",
          title: `${s.chatTitle || "Study"} Notes`,
          language: s.detectedLanguage || language,
          content: formatStructuredText(s),
        }),
      });
      if (!res.ok) throw new Error("Failed to save notes.");
      onToast("success", "Saved to My Materials", "Study notes added to your personal library.");
    } catch (err) {
      onToast("error", err instanceof Error ? err.message : "Could not save notes.");
    }
  }

  async function bookmarkTopic(s: StructuredExplanation) {
    try {
      const res = await apiFetch("/api/saved-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: s.chatTitle || "Saved Topic",
          language: s.detectedLanguage || language,
          mode,
          content: formatStructuredText(s),
        }),
      });
      if (!res.ok) throw new Error("Failed to bookmark topic.");
      onToast("success", "Bookmarked!", "Topic saved to Saved Topics.");
    } catch (err) {
      onToast("error", err instanceof Error ? err.message : "Could not bookmark.");
    }
  }

  async function handleFollowUp(action: string, msgId: string, s: StructuredExplanation) {
    if (action === "Download Explanation") {
      try {
        await triggerDownload({
          title: s.chatTitle || "AI_Explanation",
          category: "explanation",
          format: exportFormat,
          language: s.detectedLanguage || language,
          content: formatStructuredText(s),
        });
        onToast("success", `Downloaded as ${exportFormat}`);
      } catch (err) {
        onToast("error", err instanceof Error ? err.message : "Download failed.");
      }
      return;
    }
    if (action === "Generate Quiz") {
      onGenerateQuizForTopic(s.chatTitle || "Current Topic");
      return;
    }
    if (action === "Generate Notes") {
      await saveToNotes(s);
      return;
    }
    if (action === "Translate") {
      setShowTranslatePicker((prev) => (prev === msgId ? null : msgId));
      return;
    }
    await sendQuestion(`${action}: ${s.chatTitle}`, action);
  }

  return (
    <div className="space-y-4">
      {/* Control Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-indigo-100/80 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900 truncate max-w-md">{sessionTitle}</h1>
            <p className="text-xs text-slate-500">
              {language} · {mode} Mode · {deepThinking || mode === "Advanced" || mode === "Exam Preparation" ? "High Thinking (gemini-4-carbon)" : "Fast Tutor (gemini-4-hydrogen)"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSessionId(null);
              setSessionTitle("New AI Learning Session");
              setMessages([]);
              setLastReward(null);
              onClearInitial();
            }}
            className="px-4 py-2 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold hover:bg-indigo-100/70 transition cursor-pointer whitespace-nowrap"
          >
            New Chat
          </button>
        </div>

        <div className="flex flex-wrap gap-2.5 items-center pt-2 border-t border-slate-100">
          <select
            aria-label="Select language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:outline-none focus:border-[#6C63FF]"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.name} value={l.name}>
                {l.name} ({l.nativeLabel})
              </option>
            ))}
          </select>

          <select
            aria-label="Select learning mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:outline-none focus:border-[#6C63FF]"
          >
            {LEARNING_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            aria-label="Attach uploaded document"
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-white max-w-52 focus:outline-none focus:border-[#6C63FF]"
          >
            <option value="">No Document Attached</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fileName}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setDeepThinking((d) => !d)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer whitespace-nowrap ${
              deepThinking
                ? "gradient-brand text-white border-transparent shadow-xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-[#F7F6FF]"
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>Deep Thinking {deepThinking ? "On" : "Off"}</span>
          </button>

          <select
            aria-label="Export format"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as "PDF" | "DOCX" | "TXT")}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-white ml-auto"
          >
            <option value="PDF">Export: PDF</option>
            <option value="DOCX">Export: DOCX</option>
            <option value="TXT">Export: TXT</option>
          </select>
        </div>
      </div>

      <RewardSummaryBanner reward={lastReward} />

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      {/* Conversation Thread */}
      <div className="space-y-4 min-h-[380px]">
        {messages.length === 0 && (
          <div className="bg-white rounded-3xl p-8 md:p-12 text-center border border-indigo-100/80 space-y-4">
            <div className="w-12 h-12 rounded-2xl gradient-brand text-white flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">What would you like to master today?</h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto">
              Ask any question in English, Tamil, Tanglish, Hindi, or 11 other languages. Enable{" "}
              <strong>Deep Thinking</strong> for complex STEM, proofs, or exam essays.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {[
                "Explain Photosynthesis step by step",
                "Newton's Laws in Tanglish",
                "How do Neural Networks learn?",
                "Explain Trigonometry in Tamil",
              ].map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => sendQuestion(starter)}
                  className="px-3.5 py-2 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold hover:bg-indigo-100/80 transition cursor-pointer"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-xl px-4 py-3 rounded-2xl gradient-brand text-white text-sm shadow-xs">
                  {m.content}
                </div>
              </div>
            );
          }

          let s: StructuredExplanation | null = null;
          try {
            s = m.structured ? (JSON.parse(m.structured) as StructuredExplanation) : null;
          } catch {}

          if (!s) {
            return (
              <div key={m.id} className="bg-white rounded-2xl p-5 border border-indigo-100/80 text-sm">
                {m.content}
              </div>
            );
          }

          return (
            <div
              key={m.id}
              className="bg-white rounded-3xl p-6 md:p-7 border border-indigo-100/80 shadow-xs space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{s.chatTitle}</h3>
                  <p className="text-xs text-slate-500">
                    {s.detectedLanguage} · {m.mode} ·{" "}
                    {m.modelUsed === "gemini-4-carbon" ? "High Thinking Mode" : "Standard Mode"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      speakText(
                        `${s!.simpleDefinition}. ${s!.easyExplanation}`,
                        s!.detectedLanguage || language
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold flex items-center gap-1.5 hover:bg-indigo-100/70 cursor-pointer whitespace-nowrap"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Listen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => bookmarkTopic(s!)}
                    className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold flex items-center gap-1.5 hover:bg-indigo-100/70 cursor-pointer whitespace-nowrap"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Bookmark</span>
                  </button>
                </div>
              </div>

              {/* Definition & Easy Explanation */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-[#6C63FF] uppercase tracking-wide">
                    Simple Definition
                  </h4>
                  <p className="text-sm text-slate-800">{s.simpleDefinition}</p>
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-[#0284C7] uppercase tracking-wide">
                    Easy Explanation
                  </h4>
                  <p className="text-sm text-slate-800">{s.easyExplanation}</p>
                </div>
              </div>

              {/* Step-by-Step */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <h4 className="text-sm font-bold text-slate-900">Detailed Step-by-Step Explanation</h4>
                <ol className="list-decimal ml-5 space-y-1.5 text-sm text-slate-700">
                  {(s.detailedSteps || []).map((st, i) => (
                    <li key={i}>{st}</li>
                  ))}
                </ol>
              </div>

              {/* Examples & Applications */}
              <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-slate-100 text-sm">
                <div>
                  <h4 className="font-bold text-slate-900 mb-1.5">Real-Life Examples</h4>
                  <ul className="list-disc ml-5 space-y-1 text-slate-700">
                    {(s.realLifeExamples || []).map((ex, i) => (
                      <li key={i}>{ex}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-1.5">Applications</h4>
                  <ul className="list-disc ml-5 space-y-1 text-slate-700">
                    {(s.applications || []).map((ap, i) => (
                      <li key={i}>{ap}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Advantages & Disadvantages */}
              <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-slate-100 text-sm">
                <div>
                  <h4 className="font-bold text-emerald-800 mb-1.5">Advantages</h4>
                  <ul className="list-disc ml-5 space-y-1 text-slate-700">
                    {(s.advantages || []).map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-rose-800 mb-1.5">Disadvantages</h4>
                  <ul className="list-disc ml-5 space-y-1 text-slate-700">
                    {(s.disadvantages || []).map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Important Points & Summary */}
              <div className="pt-4 border-t border-slate-100 text-sm space-y-3">
                <div>
                  <h4 className="font-bold text-slate-900 mb-1.5">Important Points</h4>
                  <ul className="list-disc ml-5 space-y-1 text-slate-700">
                    {(s.importantPoints || []).map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-slate-800 bg-[#F7F6FF] p-3.5 rounded-xl">
                  <strong>Summary:</strong> {s.summary}
                </p>
              </div>

              {/* Key Terms & Revision Notes */}
              <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-slate-100 text-sm">
                <div>
                  <h4 className="font-bold text-slate-900 mb-1.5">Key Terms</h4>
                  <dl className="space-y-1.5 text-slate-700">
                    {(s.keyTerms || []).map((k, i) => (
                      <div key={i}>
                        <dt className="font-semibold text-slate-900 inline">{k.term}: </dt>
                        <dd className="inline">{k.meaning}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-1.5">Revision Notes</h4>
                  <ul className="list-disc ml-5 space-y-1 text-slate-700">
                    {(s.revisionNotes || []).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Exam Prep Questions */}
              <div className="pt-4 border-t border-slate-100 text-sm space-y-2">
                <h4 className="font-bold text-slate-900">Exam Preparation Questions</h4>
                <div className="divide-y divide-slate-100">
                  {(s.examQuestions || []).map((q, i) => (
                    <div key={i} className="py-2.5">
                      <p className="font-medium text-slate-900">
                        {i + 1}. {q.question}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">Answer Hint: {q.answerHint}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Related Topics */}
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  Related Topics
                </h4>
                <div className="flex flex-wrap gap-2">
                  {(s.relatedTopics || []).map((rt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => sendQuestion(`Explain ${rt}`)}
                      className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold hover:bg-indigo-100/80 cursor-pointer"
                    >
                      {rt}
                    </button>
                  ))}
                </div>
              </div>

              {/* 7 Follow-up Actions */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {FOLLOW_UP_ACTIONS.map((act) => (
                    <button
                      key={act}
                      type="button"
                      disabled={loading}
                      onClick={() => handleFollowUp(act, m.id, s!)}
                      className="px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-semibold text-[#6C63FF] hover:bg-[#F7F6FF] transition cursor-pointer whitespace-nowrap"
                    >
                      {act}
                    </button>
                  ))}
                </div>

                {showTranslatePicker === m.id && (
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <span className="text-xs font-medium text-slate-600">Translate to:</span>
                    <select
                      value={translateTarget}
                      onChange={(e) => setTranslateTarget(e.target.value)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
                    >
                      {SUPPORTED_LANGUAGES.filter((l) => l.name !== "Auto-Detect").map((l) => (
                        <option key={l.name} value={l.name}>
                          {l.name} ({l.nativeLabel})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setShowTranslatePicker(null);
                        sendQuestion(
                          `Translate and explain "${s!.chatTitle}" clearly in ${translateTarget}`,
                          "Translate",
                          translateTarget
                        );
                      }}
                      className="px-3.5 py-1.5 rounded-xl gradient-brand text-white text-xs font-semibold cursor-pointer"
                    >
                      Translate Now
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Prompt Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion();
        }}
        className="sticky bottom-3 bg-white rounded-2xl shadow-lg border border-indigo-100 p-2.5 flex items-center gap-2"
      >
        <button
          type="button"
          onClick={startMic}
          className={`p-3 rounded-xl transition cursor-pointer shrink-0 ${
            listening
              ? "bg-rose-600 text-white"
              : "bg-[#F7F6FF] text-[#6C63FF] hover:bg-indigo-100/70"
          }`}
          title="Record voice question"
          aria-label="Record voice question"
        >
          {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Type any topic or question in English, Tamil, Tanglish, Hindi, Japanese..."
          className="flex-1 px-3 py-2 text-sm focus:outline-none min-w-0"
        />

        <button
          disabled={loading || !prompt.trim()}
          type="submit"
          className="px-5 py-2.5 rounded-xl gradient-brand text-white font-semibold text-sm flex items-center gap-2 disabled:opacity-55 cursor-pointer whitespace-nowrap shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span>{loading ? "Thinking..." : "Ask AI"}</span>
        </button>
      </form>
    </div>
  );
}
