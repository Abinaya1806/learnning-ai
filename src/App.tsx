import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthScreen } from "./components/AuthScreen";
import { SidebarLayout } from "./components/SidebarLayout";
import { ToastStack, type ToastItem } from "./components/UiFeedback";
import type { GamificationProfile, MediaCreationItem, UserProfile, ViewKey } from "./types";
import { apiFetch, clearStoredAuthToken, setStoredAuthToken } from "./utils/authToken";
import { DashboardView } from "./views/DashboardView";
import { DocumentsView } from "./views/DocumentsView";
import { HistoryView } from "./views/HistoryView";
import { ImageStudioView } from "./views/ImageStudioView";
import { LearnView } from "./views/LearnView";
import { DownloadsView, MaterialsView, SavedView } from "./views/LibraryViews";
import { QuizzesView } from "./views/QuizzesView";
import { LeaderboardView, ScoresView } from "./views/ScoresAndLeaderboardView";
import { SettingsProfileView } from "./views/SettingsProfileView";
import { ThreeLabView } from "./views/ThreeLabView";
import { VideoStudioView } from "./views/VideoStudioView";
import { VoiceView } from "./views/VoiceView";

function syncUrlToDashboard() {
  try {
    if (window.location.pathname !== "/dashboard") {
      window.history.replaceState(null, "", "/dashboard");
    }
  } catch {
    // Ignore restricted history API errors
  }
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [gamification, setGamification] = useState<GamificationProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");

  const [learnSessionId, setLearnSessionId] = useState<string | null>(null);
  const [learnTopic, setLearnTopic] = useState<string>("");
  const [quizTopic, setQuizTopic] = useState<string>("");
  const [quizDocId, setQuizDocId] = useState<string>("");
  const [videoRefImage, setVideoRefImage] = useState<MediaCreationItem | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback(
    (type: ToastItem["type"], message: string, subtext?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, message, subtext }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const refreshProfile = useCallback(async () => {
    try {
      const res = await apiFetch("/api/auth/me");
      if (res.status === 401) {
        clearStoredAuthToken();
        setUser(null);
        setGamification(null);
        return;
      }
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setGamification(data.gamification || null);
      if (
        window.location.pathname === "/" ||
        window.location.pathname === "/signin" ||
        window.location.pathname === "/login" ||
        window.location.pathname === "/signup"
      ) {
        syncUrlToDashboard();
      }
    } catch {
      // Preserve current signed-in state if offline/transient network error occurs
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors during logout
    }
    clearStoredAuthToken();
    setUser(null);
    setGamification(null);
    setActiveView("dashboard");
    setLearnSessionId(null);
    setLearnTopic("");
    try {
      window.history.replaceState(null, "", "/");
    } catch {}
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F7F6FF] flex items-center justify-center gap-2.5 text-[#6C63FF]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-semibold">Loading LearnMate AI...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthScreen
          onAuthenticated={(loggedInUser, token, initialGamification) => {
            if (token) {
              setStoredAuthToken(token);
            }
            setUser(loggedInUser);
            if (initialGamification !== undefined) {
              setGamification(initialGamification);
            }
            setActiveView("dashboard");
            syncUrlToDashboard();
            refreshProfile();
          }}
        />
        <ToastStack
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      </>
    );
  }

  if (activeView === "lab3d") {
    return (
      <>
        <ThreeLabView onExit={() => setActiveView("dashboard")} />
        <ToastStack
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      </>
    );
  }

  return (
    <>
      <SidebarLayout
        user={user}
        gamification={gamification}
        activeView={activeView}
        onNavigate={(v) => {
          if (v === "learn") {
            setLearnSessionId(null);
            setLearnTopic("");
          }
          setActiveView(v);
        }}
        onLogout={handleLogout}
      >
        {activeView === "dashboard" && (
          <DashboardView
            user={user}
            onNavigate={(v) => setActiveView(v)}
            onOpenSession={(sid) => {
              setLearnSessionId(sid);
              setLearnTopic("");
              setActiveView("learn");
            }}
            onLearnTopic={(topic) => {
              setLearnSessionId(null);
              setLearnTopic(topic);
              setActiveView("learn");
            }}
          />
        )}

        {activeView === "learn" && (
          <LearnView
            user={user}
            initialSessionId={learnSessionId}
            initialTopic={learnTopic}
            onClearInitial={() => {
              setLearnTopic("");
            }}
            onGenerateQuizForTopic={(topic) => {
              setQuizTopic(topic);
              setQuizDocId("");
              setActiveView("quizzes");
            }}
            onGamificationUpdate={refreshProfile}
            onToast={pushToast}
          />
        )}

        {activeView === "documents" && (
          <DocumentsView
            user={user}
            onCreateQuizFromDoc={(docId, topic) => {
              setQuizDocId(docId);
              setQuizTopic(topic);
              setActiveView("quizzes");
            }}
            onGamificationUpdate={refreshProfile}
            onToast={pushToast}
          />
        )}

        {activeView === "voice" && (
          <VoiceView user={user} onGamificationUpdate={refreshProfile} onToast={pushToast} />
        )}

        {activeView === "images" && (
          <ImageStudioView
            onGamificationUpdate={refreshProfile}
            onAnimateImageInVideo={(item) => {
              setVideoRefImage(item);
              setActiveView("videos");
            }}
            onToast={pushToast}
          />
        )}

        {activeView === "videos" && (
          <VideoStudioView
            initialReferenceImage={videoRefImage}
            onClearReferenceImage={() => setVideoRefImage(null)}
            onGamificationUpdate={refreshProfile}
            onToast={pushToast}
          />
        )}

        {activeView === "history" && (
          <HistoryView
            onOpenSession={(sid) => {
              setLearnSessionId(sid);
              setLearnTopic("");
              setActiveView("learn");
            }}
            onNewChat={() => {
              setLearnSessionId(null);
              setLearnTopic("");
              setActiveView("learn");
            }}
            onToast={pushToast}
          />
        )}

        {activeView === "quizzes" && (
          <QuizzesView
            user={user}
            initialTopic={quizTopic}
            initialDocId={quizDocId}
            onClearInitial={() => {
              setQuizTopic("");
              setQuizDocId("");
            }}
            onGamificationUpdate={refreshProfile}
            onToast={pushToast}
          />
        )}

        {activeView === "scores" && <ScoresView onToast={pushToast} />}

        {activeView === "leaderboard" && <LeaderboardView />}

        {activeView === "materials" && <MaterialsView onToast={pushToast} />}

        {activeView === "downloads" && <DownloadsView onToast={pushToast} />}

        {activeView === "saved" && (
          <SavedView
            onOpenTopicInLearn={(topic) => {
              setLearnSessionId(null);
              setLearnTopic(`Explain ${topic}`);
              setActiveView("learn");
            }}
            onToast={pushToast}
          />
        )}

        {activeView === "settings" && (
          <SettingsProfileView
            user={user}
            onUserUpdated={(updated) => {
              setUser(updated);
              refreshProfile();
            }}
            onToast={pushToast}
          />
        )}
      </SidebarLayout>

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}
