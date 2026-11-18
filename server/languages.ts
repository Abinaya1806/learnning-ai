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

export function normalizeLanguageName(raw: string): string {
  const clean = (raw || "").trim();
  const match = SUPPORTED_LANGUAGES.find(
    (l) => l.name.toLowerCase() === clean.toLowerCase()
  );
  return match ? match.name : clean || "English";
}
