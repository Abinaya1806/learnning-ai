import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Download, Loader2, XCircle } from "lucide-react";
import {
  SUPPORTED_LANGUAGES,
  type GamificationReward,
  type UserProfile,
} from "../types";
import { RewardSummaryBanner } from "../components/UiFeedback";
import { apiFetch } from "../utils/authToken";
import { triggerDownload } from "../utils/download";

export function QuizzesView({
  user,
  initialTopic,
  initialDocId,
  onClearInitial,
  onGamificationUpdate,
  onToast,
}: {
  user: UserProfile;
  initialTopic: string;
  initialDocId: string;
  onClearInitial: () => void;
  onGamificationUpdate: () => void;
  onToast: (type: "success" | "error" | "info" | "reward", msg: string, sub?: string) => void;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [docId, setDocId] = useState(initialDocId);
  const [docs, setDocs] = useState<{ id: string; fileName: string }[]>([]);
  const [countPreset, setCountPreset] = useState<string>("5");
  const [customCount, setCustomCount] = useState<number>(12);
  const [difficulty, setDifficulty] = useState("Medium");
  const [language, setLanguage] = useState(user.preferredLanguage || "English");
  const [timerMinutes, setTimerMinutes] = useState(0);
  const [showAnswersAfter, setShowAnswersAfter] = useState(true);
  const [types, setTypes] = useState<string[]>([
    "MCQ",
    "True or False",
    "Fill in the Blanks",
    "Short Answer",
    "Match the Following",
  ]);

  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [result, setResult] = useState<any>(null);
  const [lastReward, setLastReward] = useState<GamificationReward | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/quizzes")
      .then((r) => r.json())
      .then((d) => setQuizzes(d.quizzes || []))
      .catch(() => {});
    apiFetch("/api/documents")
      .then((r) => r.json())
      .then((d) => setDocs(d.documents || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialTopic) setTopic(initialTopic);
    if (initialDocId) setDocId(initialDocId);
  }, [initialTopic, initialDocId]);

  useEffect(() => {
    if (secondsLeft === null || result || !activeQuiz) return;
    if (secondsLeft <= 0) {
      submitQuiz();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => (s !== null ? s - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, result, activeQuiz]);

  const finalCount = countPreset === "custom" ? customCount : Number(countPreset);

  async function createQuiz(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          documentId: docId || undefined,
          count: finalCount,
          difficulty,
          language,
          questionTypes: types,
          timerMinutes: timerMinutes > 0 ? timerMinutes : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Quiz generation failed.");

      setQuizzes((prev) => [{ ...data.quiz, attempts: [] }, ...prev]);
      onClearInitial();
      startQuiz(data.quiz);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Quiz generation failed.";
      setError(msg);
      onToast("error", msg);
    } finally {
      setLoading(false);
    }
  }

  function startQuiz(q: any) {
    setActiveQuiz(q);
    setAnswers({});
    setResult(null);
    setLastReward(null);
    setStartTime(Date.now());
    setSecondsLeft(q.timerMinutes ? q.timerMinutes * 60 : null);
  }

  async function submitQuiz() {
    if (!activeQuiz || loading) return;
    setLoading(true);
    setError("");
    const durationSec = Math.round((Date.now() - startTime) / 1000);
    try {
      const res = await apiFetch(`/api/quizzes/${activeQuiz.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, durationSec }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Grading failed.");
      setResult(data);
      if (data.gamification) {
        setLastReward(data.gamification);
        onGamificationUpdate();
        if (data.gamification.newlyAwardedBadges?.length > 0) {
          onToast(
            "reward",
            `Badge Unlocked: ${data.gamification.newlyAwardedBadges[0].title}`,
            `+${data.gamification.pointsEarned} XP earned!`
          );
        } else {
          onToast("success", "Quiz Graded!", `+${data.gamification.pointsEarned} XP earned.`);
        }
      }
      apiFetch("/api/quizzes")
        .then((r) => r.json())
        .then((d) => setQuizzes(d.quizzes || []))
        .catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed.";
      setError(msg);
      onToast("error", msg);
    } finally {
      setLoading(false);
    }
  }

  function toggleType(t: string) {
    setTypes((prev) =>
      prev.includes(t) ? (prev.length > 1 ? prev.filter((x) => x !== t) : prev) : [...prev, t]
    );
  }

  async function exportQuizQuestions(qz: any, fmt: "PDF" | "DOCX" | "TXT") {
    const qs = JSON.parse(qz.questionsJson || "[]");
    const content = qs
      .map(
        (q: any, i: number) =>
          `${i + 1}. (${q.type}) ${q.question}${
            q.options ? `\n   Options: ${q.options.join(" | ")}` : ""
          }`
      )
      .join("\n\n");
    await triggerDownload({
      title: `${qz.title}_Questions`,
      category: "quiz",
      format: fmt,
      language: qz.language,
      content,
    });
    onToast("success", `Quiz exported as ${fmt}`);
  }

  if (activeQuiz) {
    const questions = JSON.parse(activeQuiz.questionsJson || "[]");
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-2xl p-5 border border-indigo-100/80 shadow-xs flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{activeQuiz.title}</h1>
            <p className="text-xs text-slate-500">
              {activeQuiz.difficulty} · {activeQuiz.language} ·{" "}
              <span className="font-mono-nums">{questions.length}</span> Questions
            </p>
          </div>
          <div className="flex items-center gap-3">
            {secondsLeft !== null && !result && (
              <span className="px-3.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold text-sm font-mono-nums flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
              </span>
            )}
            <button
              type="button"
              onClick={() => exportQuizQuestions(activeQuiz, "PDF")}
              className="px-3 py-2 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold cursor-pointer"
            >
              Download Quiz PDF
            </button>
            <button
              type="button"
              onClick={() => setActiveQuiz(null)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Back to Quizzes
            </button>
          </div>
        </div>

        <RewardSummaryBanner reward={lastReward} />

        {result ? (
          <div className="bg-white rounded-3xl p-6 border border-indigo-100/80 shadow-xs space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
              <div className="p-3.5 rounded-2xl bg-[#F7F6FF]">
                <p className="text-xs text-slate-500">Total Marks</p>
                <p className="text-xl font-bold font-mono-nums text-slate-900">
                  {result.attempt.correctCount}/{result.attempt.totalMarks}
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-50">
                <p className="text-xs text-emerald-800">Correct</p>
                <p className="text-xl font-bold font-mono-nums text-emerald-700">
                  {result.attempt.correctCount}
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-rose-50">
                <p className="text-xs text-rose-800">Wrong</p>
                <p className="text-xl font-bold font-mono-nums text-rose-700">
                  {result.attempt.wrongCount}
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-100">
                <p className="text-xs text-slate-600">Unanswered</p>
                <p className="text-xl font-bold font-mono-nums text-slate-800">
                  {result.attempt.unanswered}
                </p>
              </div>
              <div className="p-3.5 rounded-2xl gradient-brand text-white">
                <p className="text-xs text-indigo-100">Percentage</p>
                <p className="text-xl font-bold font-mono-nums">{result.attempt.percentage}%</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-sm space-y-1.5">
              <p className="font-bold text-amber-900">
                Weak Topics: {(result.feedback.weakTopics || []).join(", ") || "None — Great mastery!"}
              </p>
              <ul className="list-disc ml-5 text-amber-900 space-y-1">
                {(result.feedback.improvementSuggestions || []).map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["PDF", "DOCX", "TXT"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() =>
                    triggerDownload({
                      title: `${activeQuiz.title}_Answer_Key`,
                      category: "answer-key",
                      format: fmt,
                      language: activeQuiz.language,
                      content: result.feedback.questionResults
                        .map(
                          (r: any, i: number) =>
                            `${i + 1}. ${r.question}\nYour Answer: ${
                              typeof r.userAnswer === "object"
                                ? JSON.stringify(r.userAnswer)
                                : r.userAnswer || "Unanswered"
                            }\nCorrect Answer: ${
                              typeof r.correctAnswer === "object"
                                ? JSON.stringify(r.correctAnswer)
                                : r.correctAnswer
                            }\nExplanation: ${r.explanation}`
                        )
                        .join("\n\n"),
                    })
                  }
                  className="px-4 py-2 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Answer Key ({fmt})</span>
                </button>
              ))}
            </div>

            {showAnswersAfter && (
              <div className="divide-y divide-slate-100">
                {result.feedback.questionResults.map((r: any, i: number) => (
                  <div key={r.id} className="py-4 space-y-1.5">
                    <div className="flex items-start gap-2 font-semibold text-sm text-slate-900">
                      {r.isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <span>
                        Q{i + 1}. {r.question}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700">
                      <strong>Your Answer:</strong>{" "}
                      {typeof r.userAnswer === "object"
                        ? JSON.stringify(r.userAnswer)
                        : String(r.userAnswer || "Unanswered")}
                    </p>
                    <p className="text-xs text-emerald-800">
                      <strong>Correct Answer:</strong>{" "}
                      {typeof r.correctAnswer === "object"
                        ? JSON.stringify(r.correctAnswer)
                        : String(r.correctAnswer)}
                    </p>
                    <p className="text-xs text-slate-600">{r.explanation}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q: any, idx: number) => (
              <div
                key={q.id}
                className="bg-white rounded-2xl p-5 border border-indigo-100/80 shadow-xs space-y-3"
              >
                <p className="font-semibold text-slate-900 text-sm">
                  Q{idx + 1}. {q.question}{" "}
                  <span className="text-xs font-normal text-slate-500">· {q.type}</span>
                </p>

                {(q.type === "MCQ" || q.type === "True or False") && (
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    {(q.options || ["True", "False"]).map((opt: string) => (
                      <label
                        key={opt}
                        className={`p-3 rounded-xl border text-sm flex items-center gap-2.5 cursor-pointer transition ${
                          answers[q.id] === opt
                            ? "border-[#6C63FF] bg-[#F7F6FF]"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          checked={answers[q.id] === opt}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {(q.type === "Fill in the Blanks" || q.type === "Short Answer") && (
                  <input
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    placeholder="Type your answer here..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                )}

                {q.type === "Match the Following" && (
                  <div className="space-y-2.5">
                    {(q.leftItems || []).map((left: string) => (
                      <div key={left} className="grid sm:grid-cols-2 gap-2 items-center text-sm">
                        <span className="font-medium text-slate-800">{left}</span>
                        <select
                          value={answers[q.id]?.[left] || ""}
                          onChange={(e) =>
                            setAnswers((a) => ({
                              ...a,
                              [q.id]: { ...(a[q.id] || {}), [left]: e.target.value },
                            }))
                          }
                          className="px-3 py-2 rounded-xl border border-slate-200 bg-white"
                        >
                          <option value="">Select match...</option>
                          {(q.rightItems || []).map((rOpt: string) => (
                            <option key={rOpt} value={rOpt}>
                              {rOpt}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <button
              disabled={loading}
              type="button"
              onClick={submitQuiz}
              className="w-full py-3.5 rounded-2xl gradient-brand text-white font-bold shadow-md hover:opacity-95 cursor-pointer"
            >
              {loading ? "Evaluating Answers..." : "Submit Quiz & View Results"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={createQuiz}
        className="bg-white rounded-3xl p-6 border border-indigo-100/80 shadow-xs space-y-4"
      >
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI Quiz Generator</h1>
          <p className="text-xs text-slate-500">
            Generate custom quizzes from any topic or uploaded document in 15+ languages.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter topic (e.g., Quantum Mechanics, Tamil Grammar)"
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
          />
          <select
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
          >
            <option value="">Or select an uploaded document</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fileName}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Questions</label>
            <select
              value={countPreset}
              onChange={(e) => setCountPreset(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
            >
              <option value="5">5 Questions</option>
              <option value="10">10 Questions</option>
              <option value="20">20 Questions</option>
              <option value="30">30 Questions</option>
              <option value="50">50 Questions</option>
              <option value="custom">Custom Count</option>
            </select>
            {countPreset === "custom" && (
              <input
                type="number"
                min={1}
                max={50}
                value={customCount}
                onChange={(e) => setCustomCount(Number(e.target.value))}
                className="w-full mt-2 px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-mono-nums"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
            >
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
            >
              {SUPPORTED_LANGUAGES.filter((l) => l.name !== "Auto-Detect").map((l) => (
                <option key={l.name} value={l.name}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Timer (mins, 0=off)
            </label>
            <input
              type="number"
              min={0}
              max={120}
              value={timerMinutes}
              onChange={(e) => setTimerMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono-nums"
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600">Question Types</p>
          <div className="flex flex-wrap gap-2">
            {["MCQ", "True or False", "Fill in the Blanks", "Short Answer", "Match the Following"].map(
              (t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    types.includes(t)
                      ? "gradient-brand text-white"
                      : "bg-[#F7F6FF] text-slate-700 hover:bg-indigo-100/70"
                  }`}
                >
                  {t}
                </button>
              )
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={showAnswersAfter}
            onChange={(e) => setShowAnswersAfter(e.target.checked)}
          />
          <span>Show detailed answers and explanations after submission</span>
        </label>

        <button
          disabled={loading}
          type="submit"
          className="px-6 py-3 rounded-xl gradient-brand text-white font-semibold text-sm flex items-center gap-2 cursor-pointer"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{loading ? "Generating Quiz..." : "Generate AI Quiz"}</span>
        </button>
      </form>

      <div className="bg-white rounded-2xl p-6 border border-indigo-100/80 shadow-xs space-y-3">
        <h2 className="text-base font-bold text-slate-900">Your Generated Quizzes ({quizzes.length})</h2>
        {quizzes.length === 0 ? (
          <p className="text-sm text-slate-500">No quizzes created yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {quizzes.map((qz) => (
              <div key={qz.id} className="py-3.5 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <p className="font-semibold text-sm text-slate-900">{qz.title}</p>
                  <p className="text-xs text-slate-500 font-mono-nums">
                    {qz.questionCount} questions · {qz.difficulty} · {qz.language}
                    {qz.attempts?.length ? ` · Best: ${Math.max(...qz.attempts.map((a: any) => a.percentage))}%` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => exportQuizQuestions(qz, "PDF")}
                    className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold cursor-pointer"
                  >
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => startQuiz(qz)}
                    className="px-4 py-1.5 rounded-xl gradient-brand text-white text-xs font-semibold cursor-pointer"
                  >
                    Start Quiz
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
