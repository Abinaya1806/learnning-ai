import { useEffect, useState } from "react";
import { Download, Trophy } from "lucide-react";
import { apiFetch } from "../utils/authToken";
import { triggerDownload } from "../utils/download";

export function ScoresView({
  onToast,
}: {
  onToast: (type: "success" | "error" | "info" | "reward", msg: string) => void;
}) {
  const [attempts, setAttempts] = useState<any[]>([]);

  useEffect(() => {
    apiFetch("/api/scores")
      .then((r) => r.json())
      .then((d) => setAttempts(d.attempts || []))
      .catch(() => {});
  }, []);

  async function downloadOverallProgress(fmt: "PDF" | "DOCX" | "TXT") {
    const content = attempts
      .map(
        (a, i) =>
          `${i + 1}. ${a.quizTitle} (${a.quizDifficulty}, ${a.quizLanguage}) — ${a.correctCount}/${a.totalMarks} (${a.percentage}%)`
      )
      .join("\n");
    await triggerDownload({
      title: "LearnMate_Overall_Progress_Report",
      category: "progress-report",
      format: fmt,
      language: "English",
      content: content || "No quiz attempts recorded yet.",
    });
    onToast("success", `Progress Report downloaded (${fmt})`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Scores & Progress Reports</h1>
          <p className="text-xs text-slate-500">All quiz attempts and score history.</p>
        </div>
        <div className="flex gap-2">
          {(["PDF", "DOCX", "TXT"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => downloadOverallProgress(fmt)}
              className="px-3.5 py-2 rounded-xl bg-white border border-indigo-100 text-xs font-semibold text-[#6C63FF] hover:bg-[#F7F6FF] cursor-pointer"
            >
              Export Progress ({fmt})
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-indigo-100/80 shadow-xs overflow-x-auto">
        {attempts.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No quiz attempts yet. Complete a quiz to track your scores here.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="py-3 px-4 font-semibold">Quiz</th>
                <th className="py-3 px-4 font-semibold">Details</th>
                <th className="py-3 px-4 font-semibold text-right">Marks</th>
                <th className="py-3 px-4 font-semibold text-right">Score</th>
                <th className="py-3 px-4 font-semibold text-right">Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attempts.map((a) => (
                <tr key={a.id} className="hover:bg-[#F7F6FF]/50">
                  <td className="py-3 px-4 font-semibold text-slate-900">{a.quizTitle}</td>
                  <td className="py-3 px-4 text-xs text-slate-500">
                    {a.quizDifficulty} · {a.quizLanguage} ·{" "}
                    <span className="font-mono-nums">{a.createdAt.slice(0, 10)}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono-nums text-slate-700">
                    {a.correctCount}/{a.totalMarks}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-nums font-bold text-[#6C63FF]">
                    {a.percentage}%
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        triggerDownload({
                          title: `${a.quizTitle}_Score_Report`,
                          category: "score-report",
                          format: "PDF",
                          language: a.quizLanguage,
                          content: `Quiz: ${a.quizTitle}\nDifficulty: ${a.quizDifficulty}\nLanguage: ${a.quizLanguage}\nMarks: ${a.correctCount}/${a.totalMarks} (${a.percentage}%)\nCorrect: ${a.correctCount}\nWrong: ${a.wrongCount}\nUnanswered: ${a.unanswered}`,
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function LeaderboardView() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/gamification/leaderboard")
      .then((r) => r.json())
      .then((d) => setRows(d.leaderboard || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl gradient-brand text-white flex items-center justify-center">
          <Trophy className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Global Leaderboard</h1>
          <p className="text-xs text-slate-500">
            Ranked by XP points earned from AI lessons, documents, voice sessions, quizzes, and milestone badges.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-indigo-100/80 shadow-xs overflow-x-auto">
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading leaderboard...</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No learners ranked yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="py-3 px-4 font-semibold">Rank</th>
                <th className="py-3 px-4 font-semibold">Learner</th>
                <th className="py-3 px-4 font-semibold">Level</th>
                <th className="py-3 px-4 font-semibold text-right">Badges</th>
                <th className="py-3 px-4 font-semibold text-right">Quizzes</th>
                <th className="py-3 px-4 font-semibold text-right">Words</th>
                <th className="py-3 px-4 font-semibold text-right">Languages</th>
                <th className="py-3 px-4 font-semibold text-right">XP Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr
                  key={r.username}
                  className={r.isCurrentUser ? "bg-[#F7F6FF] font-semibold" : "hover:bg-slate-50/70"}
                >
                  <td className="py-3 px-4 font-mono-nums text-slate-700">#{r.rank}</td>
                  <td className="py-3 px-4 text-slate-900">
                    {r.username} {r.isCurrentUser ? "(You)" : ""}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    Lvl {r.level} · {r.levelTitle}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-nums text-slate-700">{r.badgeCount}</td>
                  <td className="py-3 px-4 text-right font-mono-nums text-slate-700">{r.quizzesCompleted}</td>
                  <td className="py-3 px-4 text-right font-mono-nums text-slate-700">
                    {r.wordsLearned.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-nums text-slate-700">{r.languagesCount}</td>
                  <td className="py-3 px-4 text-right font-mono-nums font-bold text-[#6C63FF]">
                    {r.points.toLocaleString()} XP
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
