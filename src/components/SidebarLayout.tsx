import { useState } from "react";
import {
  Award,
  Bookmark,
  Box,
  ClipboardCheck,
  Download,
  Film,
  Flame,
  FolderOpen,
  History,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Settings,
  Sparkles,
  Trophy,
  Upload,
  X,
} from "lucide-react";
import type { GamificationProfile, UserProfile, ViewKey } from "../types";

const NAV_ITEMS: { key: ViewKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "learn", label: "New AI Learning", icon: Sparkles },
  { key: "documents", label: "Upload Documents", icon: Upload },
  { key: "voice", label: "Voice Learning", icon: Mic },
  { key: "images", label: "Image Studio", icon: ImagePlus },
  { key: "videos", label: "Video Studio", icon: Film },
  { key: "lab3d", label: "3D Learning Lab", icon: Box },
  { key: "history", label: "Chat History", icon: History },
  { key: "quizzes", label: "My Quizzes", icon: ClipboardCheck },
  { key: "scores", label: "My Scores", icon: Award },
  { key: "leaderboard", label: "Leaderboard", icon: Trophy },
  { key: "materials", label: "My Materials", icon: FolderOpen },
  { key: "downloads", label: "Download History", icon: Download },
  { key: "saved", label: "Saved Topics", icon: Bookmark },
  { key: "settings", label: "Settings", icon: Settings },
];

export function SidebarLayout({
  user,
  gamification,
  activeView,
  onNavigate,
  onLogout,
  children,
}: {
  user: UserProfile;
  gamification: GamificationProfile | null;
  activeView: ViewKey;
  onNavigate: (view: ViewKey) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeLabel = NAV_ITEMS.find((n) => n.key === activeView)?.label || "Dashboard";

  const sidebarBody = (
    <div className="flex flex-col h-full bg-white border-r border-indigo-100/80 w-64">
      <div className="px-5 py-4 flex items-center justify-between border-b border-indigo-50">
        <button
          type="button"
          onClick={() => {
            onNavigate("dashboard");
            setMobileOpen(false);
          }}
          className="flex items-center gap-2.5 text-left cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center text-white shadow-sm shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="font-bold text-slate-900 font-display text-base whitespace-nowrap">
            LearnMate AI
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-slate-500 p-1 cursor-pointer"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onNavigate(item.key);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer whitespace-nowrap ${
                active
                  ? "gradient-brand text-white shadow-sm"
                  : "text-slate-600 hover:bg-[#F7F6FF] hover:text-[#6C63FF]"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-indigo-50 space-y-2">
        <button
          type="button"
          onClick={() => {
            onNavigate("settings");
            setMobileOpen(false);
          }}
          className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#F7F6FF] hover:bg-indigo-50/80 transition cursor-pointer"
        >
          <p className="text-xs font-semibold text-slate-900 truncate">{user.username}</p>
          <p className="text-[11px] text-slate-500 truncate font-mono-nums">
            Lvl {gamification?.levelInfo.level || 1} · {gamification?.points ?? user.points} XP ·{" "}
            {user.preferredLanguage}
          </p>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition cursor-pointer whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F7F6FF]">
      <aside className="hidden lg:block sticky top-0 h-screen shrink-0">{sidebarBody}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full">{sidebarBody}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white/95 backdrop-blur border-b border-indigo-100/80 px-4 md:px-7 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-[#F7F6FF] text-[#6C63FF] cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-base md:text-lg font-bold text-slate-900 truncate font-display">
              {activeLabel}
            </h2>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate("settings")}
              className="hidden sm:flex items-center gap-2 text-xs text-slate-600 hover:text-[#6C63FF] transition cursor-pointer whitespace-nowrap"
            >
              <span className="inline-flex items-center gap-1 font-mono-nums font-semibold text-amber-600">
                <Flame className="w-3.5 h-3.5" />
                {gamification?.streakDays ?? user.streakDays}d streak
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-nums font-semibold text-slate-900">
                {gamification?.points ?? user.points} XP
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {gamification?.earnedCount ?? 0}/{gamification?.totalBadges ?? 9} Badges
              </span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate("learn")}
              className="px-4 py-2 rounded-xl gradient-brand text-white text-xs md:text-sm font-semibold shadow-sm hover:opacity-95 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              New AI Learning
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-7 max-w-6xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
