export const SUPPORTED_LANGUAGES = [
  { name: "Auto-Detect", speechCode: "en-US", nativeLabel: "Auto Detect" },
  { name: "English", speechCode: "en-US", nativeLabel: "English" },
  { name: "Tamil", speechCode: "ta-IN", nativeLabel: "தமிழ்" },
  { name: "Tanglish", speechCode: "en-IN", nativeLabel: "Tanglish (Tamil + English)" },
  { name: "Hindi", speechCode: "hi-IN", nativeLabel: "हिन्दी" },
  { name: "Telugu", speechCode: "te-IN", nativeLabel: "తెలుగు" },
  { name: "Malayalam", speechCode: "ml-IN", nativeLabel: "മലയാളം" },
  { name: "Kannada", speechCode: "kn-IN", nativeLabel: "ಕನ್ನಡ" },
  { name: "Bengali", speechCode: "bn-IN", nativeLabel: "বাংলা" },
  { name: "Marathi", speechCode: "mr-IN", nativeLabel: "मराठी" },
  { name: "French", speechCode: "fr-FR", nativeLabel: "Français" },
  { name: "Spanish", speechCode: "es-ES", nativeLabel: "Español" },
  { name: "German", speechCode: "de-DE", nativeLabel: "Deutsch" },
  { name: "Arabic", speechCode: "ar-SA", nativeLabel: "العربية" },
  { name: "Chinese", speechCode: "zh-CN", nativeLabel: "中文" },
  { name: "Japanese", speechCode: "ja-JP", nativeLabel: "日本語" },
] as const;

export const LEARNING_MODES = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Exam Preparation",
  "Explain Like I'm 10",
] as const;

export const FOLLOW_UP_ACTIONS = [
  "Explain More",
  "Make It Simpler",
  "Give Another Example",
  "Translate",
  "Generate Notes",
  "Generate Quiz",
  "Download Explanation",
] as const;

export function getSpeechLocale(language: string): string {
  const found = SUPPORTED_LANGUAGES.find((l) => l.name === language);
  return found?.speechCode || "en-US";
}

export type ViewKey =
  | "dashboard"
  | "learn"
  | "documents"
  | "voice"
  | "images"
  | "videos"
  | "lab3d"
  | "history"
  | "quizzes"
  | "scores"
  | "leaderboard"
  | "materials"
  | "downloads"
  | "saved"
  | "settings";

export interface MediaCreationItem {
  id: string;
  kind: "image" | "video";
  title: string;
  prompt: string;
  aspectRatio: string;
  resolution: string | null;
  duration: string | null;
  modelUsed: string;
  interactionId: string | null;
  mimeType: string;
  caption: string | null;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  preferredLanguage: string;
  defaultMode: string;
  points: number;
  wordsLearned: number;
  streakDays: number;
  longestStreak?: number;
  createdAt: string;
}

export interface BadgeItem {
  key: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  awardedAt: string | null;
  progress: number;
  target: number;
  progressPercent: number;
}

export interface DailyActivityDay {
  date: string;
  label: string;
  active: boolean;
  actionsCount: number;
  isToday: boolean;
}

export interface GamificationProfile {
  points: number;
  wordsLearned: number;
  streakDays: number;
  longestStreak: number;
  activeToday: boolean;
  recentActivityDays?: DailyActivityDay[];
  languagesCount: number;
  languagesList: { language: string; firstUsedAt: string }[];
  levelInfo: {
    level: number;
    title: string;
    currentLevelMin: number;
    nextLevelMin: number;
    progressPercent: number;
  };
  earnedCount: number;
  totalBadges: number;
  badges: BadgeItem[];
  recentLedger: { id: string; action: string; points: number; detail: string; createdAt: string }[];
}

export interface GamificationReward {
  pointsEarned: number;
  newlyAwardedBadges: { key: string; title: string; description: string; icon: string }[];
  totalPoints: number;
  streakDays?: number;
}

export interface StructuredExplanation {
  detectedLanguage: string;
  chatTitle: string;
  simpleDefinition: string;
  easyExplanation: string;
  detailedSteps: string[];
  realLifeExamples: string[];
  applications: string[];
  advantages: string[];
  disadvantages: string[];
  importantPoints: string[];
  summary: string;
  keyTerms: { term: string; meaning: string }[];
  examQuestions: { question: string; answerHint: string }[];
  revisionNotes: string[];
  relatedTopics: string[];
}

export function formatStructuredText(s: StructuredExplanation | null): string {
  if (!s) return "";
  return [
    `TITLE: ${s.chatTitle || "Study Topic"}`,
    `SIMPLE DEFINITION:\n${s.simpleDefinition || ""}`,
    `EASY EXPLANATION:\n${s.easyExplanation || ""}`,
    `DETAILED STEP-BY-STEP EXPLANATION:\n${(s.detailedSteps || []).map((x, i) => `${i + 1}. ${x}`).join("\n")}`,
    `REAL-LIFE EXAMPLES:\n${(s.realLifeExamples || []).map((x) => `- ${x}`).join("\n")}`,
    `APPLICATIONS:\n${(s.applications || []).map((x) => `- ${x}`).join("\n")}`,
    `ADVANTAGES:\n${(s.advantages || []).map((x) => `+ ${x}`).join("\n")}`,
    `DISADVANTAGES:\n${(s.disadvantages || []).map((x) => `- ${x}`).join("\n")}`,
    `IMPORTANT POINTS:\n${(s.importantPoints || []).map((x) => `* ${x}`).join("\n")}`,
    `SUMMARY:\n${s.summary || ""}`,
    `KEY TERMS:\n${(s.keyTerms || []).map((k) => `${k.term}: ${k.meaning}`).join("\n")}`,
    `EXAM PREPARATION QUESTIONS:\n${(s.examQuestions || []).map((q) => `Q: ${q.question}\nHint: ${q.answerHint}`).join("\n\n")}`,
    `REVISION NOTES:\n${(s.revisionNotes || []).map((x) => `- ${x}`).join("\n")}`,
    `RELATED TOPICS:\n${(s.relatedTopics || []).join(", ")}`,
  ].join("\n\n");
}
