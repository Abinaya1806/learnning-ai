import { useEffect, useState } from "react";
import {
  Award,
  BookOpen,
  Brain,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Globe,
  Lock,
  Mic,
  Sparkles,
} from "lucide-react";
import {
  LEARNING_MODES,
  SUPPORTED_LANGUAGES,
  type GamificationProfile,
  type UserProfile,
} from "../types";
import { apiFetch } from "../utils/authToken";

function renderBadgeIcon(icon: string, unlocked: boolean) {
  const cls = `w-5 h-5 ${unlocked ? "text-white" : "text-slate-400"}`;
  switch (icon) {
    case "check-circle":
      return <CheckCircle2 className={cls} />;
    case "book-open":
      return <BookOpen className={cls} />;
    case "globe":
      return <Globe className={cls} />;
    case "file-text":
      return <FileText className={cls} />;
    case "mic":
      return <Mic className={cls} />;
    case "award":
      return <Award className={cls} />;
    case "brain":
      return <Brain className={cls} />;
    case "flame":
      return <Flame className={cls} />;
    default:
      return <Sparkles className={cls} />;
  }
}

export function SettingsProfileView({
  user,
  onUserUpdated,
  onToast,
}: {
  user: UserProfile;
  onUserUpdated: (u: UserProfile) => void;
  onToast: (type: "success" | "error" | "info" | "reward", msg: string) => void;
}) {
  const [profile, setProfile] = useState<GamificationProfile | null>(null);
  const [username, setUsername] = useState(user.username);
  const [preferredLanguage, setPreferredLanguage] = useState(user.preferredLanguage);
  const [defaultMode, setDefaultMode] = useState(user.defaultMode);
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [crestFailed, setCrestFailed] = useState(false);

  useEffect(() => {
    apiFetch("/api/gamification/profile")
      .then((r) => r.json())
      .then((d) => setProfile(d.profile || null))
      .catch(() => {});
  }, []);

  async function savePreferences(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, preferredLanguage, defaultMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save preferences.");
      onUserUpdated(data.user);
      onToast("success", "Profile settings updated!");
    } catch (err) {
      onToast("error", err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      onToast("error", "New passwords do not match.");
      return;
    }
    setChangingPass(true);
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Password change failed.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onToast("success", "Password updated securely!");
    } catch (err) {
      onToast("error", err instanceof Error ? err.message : "Password change failed.");
    } finally {
      setChangingPass(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Gamification Profile Overview */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-indigo-100/80 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden border border-indigo-100 bg-[#F7F6FF] shrink-0">
              {!crestFailed ? (
                <img
                  src="/src/assets/images/gamification_achievement_crest_1795010947291.jpg"
                  alt="Student achievement crest"
                  referrerPolicy="no-referrer"
                  onError={() => setCrestFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#6C63FF]">
                  <Award className="w-7 h-7" />
                </div>
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{user.username}</h1>
              <p className="text-xs text-slate-500">
                {user.email} · Level {profile?.levelInfo.level || 1}{" "}
                {profile?.levelInfo.title || "Curious Learner"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-xs text-slate-500">Daily Streak</p>
              <p className="text-lg font-bold font-mono-nums text-amber-600 flex items-center justify-center gap-1">
                <Flame className="w-4 h-4 shrink-0" />
                <span>{profile?.streakDays ?? user.streakDays}d</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">XP Points</p>
              <p className="text-lg font-bold font-mono-nums text-[#6C63FF]">
                {profile?.points ?? user.points}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Badges</p>
              <p className="text-lg font-bold font-mono-nums text-slate-900">
                {profile?.earnedCount ?? 0}/{profile?.totalBadges ?? 9}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Words Learned</p>
              <p className="text-lg font-bold font-mono-nums text-slate-900">
                {(profile?.wordsLearned ?? user.wordsLearned).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Languages</p>
              <p className="text-lg font-bold font-mono-nums text-slate-900">
                {profile?.languagesCount ?? 1}
              </p>
            </div>
          </div>
        </div>

        {profile && (
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="flex justify-between text-xs text-slate-600">
              <span>
                Level {profile.levelInfo.level} Progress ({profile.levelInfo.title})
              </span>
              <span className="font-mono-nums">
                {profile.points} / {profile.levelInfo.nextLevelMin} XP
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-[#F7F6FF] overflow-hidden">
              <div
                className="h-full gradient-brand transition-all"
                style={{ width: `${profile.levelInfo.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Badges Showcase */}
        {profile && (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Milestone Badges</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {profile.badges.map((b) => (
                <div
                  key={b.key}
                  className={`p-4 rounded-2xl border transition ${
                    b.unlocked
                      ? "bg-[#F7F6FF] border-indigo-200"
                      : "bg-slate-50/60 border-slate-200 opacity-85"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        b.unlocked ? "gradient-brand" : "bg-slate-200"
                      }`}
                    >
                      {renderBadgeIcon(b.icon, b.unlocked)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900">{b.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{b.description}</p>
                      <p className="text-[11px] font-mono-nums text-slate-500 mt-1.5">
                        {b.unlocked
                          ? `Unlocked ${b.awardedAt ? b.awardedAt.slice(0, 10) : ""}`
                          : `Progress: ${b.progress}/${b.target} (${b.progressPercent}%)`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {profile && profile.languagesList.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-600 mb-1">Languages Explored</p>
            <p className="text-sm text-slate-800">
              {profile.languagesList.map((l) => l.language).join(" · ")}
            </p>
          </div>
        )}
      </div>

      {/* Preferences & Security Forms */}
      <div className="grid lg:grid-cols-2 gap-6">
        <form
          onSubmit={savePreferences}
          className="bg-white rounded-3xl p-6 border border-indigo-100/80 shadow-xs space-y-4"
        >
          <h2 className="text-lg font-bold text-slate-900">Learning Preferences</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Username</label>
            <input
              required
              minLength={3}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Preferred Learning Language
            </label>
            <select
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
            >
              {SUPPORTED_LANGUAGES.filter((l) => l.name !== "Auto-Detect").map((l) => (
                <option key={l.name} value={l.name}>
                  {l.name} ({l.nativeLabel})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Default Learning Mode
            </label>
            <select
              value={defaultMode}
              onChange={(e) => setDefaultMode(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
            >
              {LEARNING_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <button
            disabled={saving}
            type="submit"
            className="px-5 py-2.5 rounded-xl gradient-brand text-white text-sm font-semibold cursor-pointer"
          >
            {saving ? "Saving..." : "Save Preferences"}
          </button>
        </form>

        <form
          onSubmit={changePassword}
          className="bg-white rounded-3xl p-6 border border-indigo-100/80 shadow-xs space-y-4"
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#6C63FF]" />
            <h2 className="text-lg font-bold text-slate-900">Account Security</h2>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Current Password
            </label>
            <div className="relative">
              <input
                required
                type={showPass ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-3 text-slate-400 cursor-pointer"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              New Password
            </label>
            <input
              required
              minLength={6}
              type={showPass ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Confirm New Password
            </label>
            <input
              required
              minLength={6}
              type={showPass ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <button
            disabled={changingPass}
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer"
          >
            {changingPass ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
