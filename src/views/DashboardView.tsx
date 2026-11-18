import { useEffect, useState } from "react";
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  Flame,
  Loader2,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { DailyActivityDay, UserProfile, ViewKey } from "../types";
import { apiFetch } from "../utils/authToken";

export function DashboardView({
  user,
  onNavigate,
  onOpenSession,
  onLearnTopic,
}: {
  user: UserProfile;
  onNavigate: (v: ViewKey) => void;
  onOpenSession: (sessionId: string) => void;
  onLearnTopic: (topic: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [crestFailed, setCrestFailed] = useState(false);

  useEffect(() => {
    apiFetch("/api/dashboard")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load dashboard");
        return d;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2.5 text-[#6C63FF] py-12 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-medium">Loading your learning dashboard...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-rose-200 text-rose-800 text-sm">
        {error || "Unable to load dashboard data."}
      </div>
    );
  }

  const gam = data.gamification;
  const activityDays: DailyActivityDay[] = gam.recentActivityDays || [];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-3xl gradient-brand p-6 md:p-8 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-indigo-100">
            Level {gam.levelInfo.level} {gam.levelInfo.title} · {gam.streakDays}-day streak ·{" "}
            {user.preferredLanguage}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold [text-wrap:balance]">
            Welcome back, {user.username}
          </h1>
          <p className="text-sm text-indigo-100 max-w-xl">
            Track your progress across lessons, quizzes, multilingual exploration, and earned badges.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate("learn")}
            className="px-5 py-2.5 rounded-xl bg-white text-[#6C63FF] text-sm font-semibold shadow-sm hover:bg-indigo-50 transition cursor-pointer whitespace-nowrap"
          >
            Start AI Learning
          </button>
          <button
            type="button"
            onClick={() => onNavigate("quizzes")}
            className="px-5 py-2.5 rounded-xl bg-white/15 text-white border border-white/25 text-sm font-semibold hover:bg-white/25 transition cursor-pointer whitespace-nowrap"
          >
            Take a Quiz
          </button>
        </div>
      </div>

      {/* Daily Streak Counter + KPI Strip */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div
          className="xl:col-span-5 bg-white rounded-2xl p-5 md:p-6 border border-indigo-100/80 shadow-xs flex flex-col justify-between gap-4"
          aria-label="Daily Streak Tracker"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  gam.streakDays > 0
                    ? "bg-amber-50 text-amber-600 border border-amber-200"
                    : "bg-[#F7F6FF] text-slate-400 border border-indigo-100"
                }`}
              >
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Daily Streak</p>
                <p className="text-3xl font-bold text-slate-900 font-mono-nums leading-tight">
                  {gam.streakDays} {gam.streakDays === 1 ? "Day" : "Days"}
                </p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-xs text-slate-500">Best Streak</p>
              <p className="text-sm font-bold text-slate-900 font-mono-nums">
                {gam.longestStreak ?? gam.streakDays} {(gam.longestStreak ?? gam.streakDays) === 1 ? "day" : "days"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {gam.activeToday ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium text-emerald-700">
                  Active today · +15 XP streak bonus unlocked on consecutive days
                </span>
              </>
            ) : (
              <>
                <Flame className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-medium text-slate-600">
                  Complete a lesson, quiz, or document study today to{" "}
                  {gam.streakDays > 0 ? "extend" : "start"} your streak
                </span>
              </>
            )}
          </div>

          {activityDays.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                <span>Last 7 Days</span>
                <span className="font-mono-nums">
                  {activityDays.filter((d) => d.active).length}/7 days active
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {activityDays.map((day) => (
                  <div key={day.date} className="flex flex-col items-center gap-1">
                    <div
                      title={`${day.date}: ${day.actionsCount} learning ${day.actionsCount === 1 ? "activity" : "activities"}`}
                      className={`w-full h-8 rounded-lg flex items-center justify-center text-xs font-semibold transition ${
                        day.active
                          ? "gradient-brand text-white"
                          : day.isToday
                            ? "bg-[#F7F6FF] border border-dashed border-[#6C63FF]/50 text-[#6C63FF]"
                            : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {day.active ? <Check className="w-3.5 h-3.5" /> : "·"}
                    </div>
                    <span
                      className={`text-[11px] font-mono-nums ${
                        day.isToday ? "font-bold text-[#6C63FF]" : "text-slate-500"
                      }`}
                    >
                      {day.isToday ? "Today" : day.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="xl:col-span-7 grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-indigo-100/80 shadow-xs flex flex-col justify-between">
            <p className="text-xs font-medium text-slate-500">Total Learning Sessions</p>
            <p className="text-2xl font-bold text-slate-900 mt-1.5 font-mono-nums">
              {data.stats.totalSessions}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {data.stats.totalDocuments} uploaded docs
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-indigo-100/80 shadow-xs flex flex-col justify-between">
            <p className="text-xs font-medium text-slate-500">Quizzes Completed</p>
            <p className="text-2xl font-bold text-slate-900 mt-1.5 font-mono-nums">
              {data.stats.totalQuizzes}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Avg Score <span className="font-mono-nums font-semibold text-[#6C63FF]">{data.stats.averageScore}%</span>
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-indigo-100/80 shadow-xs flex flex-col justify-between">
            <p className="text-xs font-medium text-slate-500">Words Learned</p>
            <p className="text-2xl font-bold text-slate-900 mt-1.5 font-mono-nums">
              {gam.wordsLearned.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {gam.languagesCount} languages explored
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-indigo-100/80 shadow-xs flex flex-col justify-between">
            <p className="text-xs font-medium text-slate-500">XP Points & Badges</p>
            <p className="text-2xl font-bold text-[#6C63FF] mt-1.5 font-mono-nums">
              {gam.points} XP
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {gam.earnedCount} of {gam.totalBadges} badges unlocked
            </p>
          </div>
        </div>
      </div>

      {/* Progress Chart + Gamification Achievement Card */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-indigo-100/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Quiz Score Progression</h2>
              <p className="text-xs text-slate-500">Recent quiz percentage scores over time</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("scores")}
              className="text-xs font-semibold text-[#6C63FF] hover:underline cursor-pointer whitespace-nowrap"
            >
              View All Scores
            </button>
          </div>

          {data.chartData.length === 0 ? (
            <div className="py-10 text-center space-y-2 border-t border-slate-100">
              <p className="text-sm text-slate-600">No quiz attempts recorded yet.</p>
              <button
                type="button"
                onClick={() => onNavigate("quizzes")}
                className="px-4 py-2 rounded-xl gradient-brand text-white text-xs font-semibold cursor-pointer"
              >
                Generate Your First Quiz
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-3 h-48 pt-6 border-t border-slate-100">
              {data.chartData.map((pt: any, idx: number) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end min-w-0">
                  <span className="text-[11px] font-semibold text-[#6C63FF] font-mono-nums">
                    {pt.score}%
                  </span>
                  <div
                    className="w-full max-w-12 rounded-t-xl gradient-brand transition-all"
                    style={{ height: `${Math.max(pt.score, 6)}%` }}
                  />
                  <span className="text-[11px] text-slate-500 truncate w-full text-center">
                    {pt.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Profile Badges Summary */}
        <div className="bg-white rounded-2xl p-6 border border-indigo-100/80 shadow-xs flex flex-col justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl overflow-hidden border border-indigo-100 bg-[#F7F6FF] shrink-0">
              {!crestFailed ? (
                <img
                  src="/src/assets/images/gamification_achievement_crest_1795010947291.jpg"
                  alt="Academic achievement crest"
                  referrerPolicy="no-referrer"
                  onError={() => setCrestFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#6C63FF]">
                  <Award className="w-6 h-6" />
                </div>
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Achievements</h2>
              <p className="text-xs text-slate-500 font-mono-nums">
                {gam.levelInfo.progressPercent}% to Level {gam.levelInfo.level + 1}
              </p>
            </div>
          </div>

          <div className="w-full h-2 rounded-full bg-[#F7F6FF] overflow-hidden">
            <div
              className="h-full gradient-brand transition-all"
              style={{ width: `${gam.levelInfo.progressPercent}%` }}
            />
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-3">
            {gam.badges.slice(0, 3).map((b: any) => (
              <div key={b.key} className="flex items-center justify-between text-xs">
                <span className={b.unlocked ? "font-semibold text-slate-900" : "text-slate-500"}>
                  {b.title}
                </span>
                <span className="font-mono-nums text-slate-500">
                  {b.unlocked ? "Unlocked" : `${b.progress}/${b.target}`}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onNavigate("settings")}
            className="w-full py-2.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold hover:bg-indigo-100/70 transition cursor-pointer"
          >
            View All Badges on Profile
          </button>
        </div>
      </div>

      {/* Weak & Recommended Topics + Global Leaderboard Preview */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-indigo-100/80 shadow-xs space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-2">Weak Topics</h2>
            {data.weakTopics.length === 0 ? (
              <p className="text-sm text-slate-500">
                No weak topics identified yet. Complete quizzes to surface targeted revision areas.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.weakTopics.map((wt: string) => (
                  <div key={wt} className="py-2.5 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{wt}</span>
                    <button
                      type="button"
                      onClick={() => onLearnTopic(wt)}
                      className="text-xs font-semibold text-[#6C63FF] hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <span>Revise Now</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h2 className="text-base font-bold text-slate-900 mb-2">Recommended Topics</h2>
            <div className="divide-y divide-slate-100">
              {data.recommendedTopics.map((rt: string) => (
                <div key={rt} className="py-2.5 flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-700">{rt}</span>
                  <button
                    type="button"
                    onClick={() => onLearnTopic(rt.replace(/^Master\s+/i, ""))}
                    className="text-xs font-semibold text-[#6C63FF] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Learn
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-indigo-100/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#6C63FF]" />
              <h2 className="text-base font-bold text-slate-900">Global Leaderboard</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("leaderboard")}
              className="text-xs font-semibold text-[#6C63FF] hover:underline cursor-pointer"
            >
              Full Rankings
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {data.topLeaderboard.map((entry: any) => (
              <div
                key={entry.username}
                className={`py-2.5 px-2 rounded-lg flex items-center justify-between text-sm ${
                  entry.isCurrentUser ? "bg-[#F7F6FF] font-semibold" : ""
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono-nums text-xs text-slate-500 w-5">#{entry.rank}</span>
                  <span className="truncate text-slate-900">
                    {entry.username} {entry.isCurrentUser ? "(You)" : ""}
                  </span>
                </div>
                <span className="font-mono-nums text-xs font-semibold text-[#6C63FF] shrink-0">
                  {entry.points} XP · {entry.badgeCount} badges
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activities & Downloads */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-indigo-100/80 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#6C63FF]" />
              <h2 className="text-base font-bold text-slate-900">Recent Learning Activities</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("history")}
              className="text-xs font-semibold text-[#6C63FF] hover:underline cursor-pointer"
            >
              All History
            </button>
          </div>
          {data.recentSessions.length === 0 ? (
            <p className="text-sm text-slate-500">No learning sessions yet. Start your first AI topic!</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentSessions.map((s: any) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenSession(s.id)}
                  className="w-full py-3 text-left flex items-center justify-between gap-3 hover:bg-[#F7F6FF]/60 px-2 rounded-lg transition cursor-pointer"
                >
                  <span className="text-sm font-medium text-slate-800 truncate">{s.title}</span>
                  <span className="text-xs text-slate-500 shrink-0">
                    {s.language} · {s.mode}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-indigo-100/80 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-[#6C63FF]" />
              <h2 className="text-base font-bold text-slate-900">Recent Downloads</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("downloads")}
              className="text-xs font-semibold text-[#6C63FF] hover:underline cursor-pointer"
            >
              Download Center
            </button>
          </div>
          {data.recentDownloads.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <span>Export explanations, notes, or score reports in PDF, DOCX, or TXT.</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentDownloads.map((d: any) => (
                <div key={d.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-slate-800">{d.title}</span>
                  <span className="text-xs text-slate-500 font-mono-nums shrink-0">
                    {d.format} · {d.language}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
