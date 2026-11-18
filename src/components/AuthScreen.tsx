import { useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, Mail, Sparkles, User } from "lucide-react";
import { SUPPORTED_LANGUAGES, type GamificationProfile, type UserProfile } from "../types";
import { apiFetch } from "../utils/authToken";

type AuthTab = "login" | "signup" | "forgot";

export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (
    user: UserProfile,
    token?: string,
    gamification?: GamificationProfile | null
  ) => void;
}) {
  const [tab, setTab] = useState<AuthTab>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("English");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [resetStep, setResetStep] = useState<"request" | "confirm">("request");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [imgFailed, setImgFailed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (tab === "login") {
        const res = await apiFetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Sign in failed.");
        onAuthenticated(data.user, data.token, data.gamification);
      } else if (tab === "signup") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        const res = await apiFetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            email,
            password,
            confirmPassword,
            preferredLanguage,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Sign up failed.");
        onAuthenticated(data.user, data.token, data.gamification);
      } else if (tab === "forgot" && resetStep === "request") {
        const res = await apiFetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Reset request failed.");
        setNotice(data.message);
        if (data.resetToken) {
          setResetToken(data.resetToken);
        }
        setResetStep("confirm");
      } else {
        if (newPassword !== confirmPassword) {
          throw new Error("New passwords do not match.");
        }
        const res = await apiFetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resetToken, newPassword, confirmPassword }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Password reset failed.");
        setNotice(data.message);
        setTab("login");
        setResetStep("request");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F6FF] flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl border border-indigo-100/80 overflow-hidden grid lg:grid-cols-2 items-stretch">
        <div className="hidden lg:flex flex-col justify-between p-8 gradient-soft border-r border-indigo-100/80">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl gradient-brand flex items-center justify-center text-white shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-xl font-bold text-slate-900 font-display">LearnMate AI</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 leading-tight max-w-md [text-wrap:balance]">
              Master any subject in 15+ languages with structured AI tutoring.
            </h1>
            <p className="text-sm text-slate-600 max-w-md">
              Ask by text or voice, upload PDF, DOCX, and PPTX notes, generate adaptive quizzes, earn XP badges, and export Unicode study guides.
            </p>
          </div>

          <div className="mt-6 rounded-2xl overflow-hidden border border-indigo-100 bg-white aspect-video">
            {!imgFailed ? (
              <img
                src="/src/assets/images/learnmate_hero_study_1795010947150.jpg"
                alt="Student learning with multilingual study materials"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full gradient-brand flex items-center justify-center text-white p-6 text-center">
                <span className="font-semibold">Multilingual AI Study Workspace</span>
              </div>
            )}
          </div>

          <div className="pt-6 flex items-center gap-2 text-xs text-slate-500">
            <span>15+ Languages</span>
            <span aria-hidden="true">·</span>
            <span>High-Thinking AI Mode</span>
            <span aria-hidden="true">·</span>
            <span>Private Student Library</span>
          </div>
        </div>

        <div className="p-6 sm:p-10 flex flex-col justify-center">
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold text-slate-900 font-display">LearnMate AI</span>
          </div>

          <div className="grid grid-cols-3 gap-1 bg-[#F7F6FF] p-1 rounded-xl mb-6 text-sm font-medium">
            {(
              [
                { key: "login", label: "Sign In" },
                { key: "signup", label: "Sign Up" },
                { key: "forgot", label: "Forgot Password" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTab(t.key);
                  setError("");
                  setNotice("");
                  setResetStep("request");
                }}
                className={`py-2 px-2 rounded-lg transition cursor-pointer whitespace-nowrap text-xs sm:text-sm ${
                  tab === t.key
                    ? "bg-white text-[#6C63FF] shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm space-y-1">
              <p>{notice}</p>
              {resetToken && tab === "forgot" && (
                <p className="font-mono-nums text-xs break-all">
                  Token: {resetToken}
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === "signup" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Username</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    required
                    minLength={3}
                    maxLength={30}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a display username"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#6C63FF]"
                  />
                </div>
              </div>
            )}

            {(tab !== "forgot" || resetStep === "request") && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {tab === "login" ? "Email or Username" : "Email Address"}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    required
                    type={tab === "login" ? "text" : "email"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tab === "login" ? "you@gmail.com or username" : "you@gmail.com"}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#6C63FF]"
                  />
                </div>
                {tab === "signup" && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Any email works — Gmail, Yahoo, Outlook, school, or personal.
                  </p>
                )}
              </div>
            )}

            {tab !== "forgot" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    required
                    minLength={6}
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#6C63FF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {tab === "signup" && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      required
                      minLength={6}
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#6C63FF]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 cursor-pointer"
                      aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Preferred Learning Language
                  </label>
                  <select
                    value={preferredLanguage}
                    onChange={(e) => setPreferredLanguage(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-[#6C63FF]"
                  >
                    {SUPPORTED_LANGUAGES.filter((l) => l.name !== "Auto-Detect").map((l) => (
                      <option key={l.name} value={l.name}>
                        {l.name} ({l.nativeLabel})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {tab === "forgot" && resetStep === "confirm" && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Reset Token
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Paste reset token"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono-nums"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      required
                      minLength={6}
                      type={showPass ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    required
                    minLength={6}
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </>
            )}

            <button
              disabled={loading}
              type="submit"
              className="w-full py-3 rounded-xl gradient-brand text-white font-semibold text-sm shadow-md hover:opacity-95 transition disabled:opacity-60 cursor-pointer"
            >
              {loading
                ? "Please wait..."
                : tab === "login"
                ? "Sign In to LearnMate"
                : tab === "signup"
                ? "Create Student Account"
                : resetStep === "request"
                ? "Generate Reset Token"
                : "Update Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
