import crypto from "node:crypto";
import { db } from "./db.ts";
import { normalizeLanguageName } from "./languages.ts";

export interface BadgeDefinition {
  key: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  metric: "lessons" | "quizzes" | "words" | "languages" | "documents" | "voice" | "highScore" | "deepThinking" | "streak";
}

export const BADGE_CATALOG: BadgeDefinition[] = [
  {
    key: "first_lesson",
    title: "First Step Scholar",
    description: "Complete your first AI learning session.",
    icon: "sparkles",
    target: 1,
    metric: "lessons",
  },
  {
    key: "first_quiz",
    title: "First AI Quiz Completed",
    description: "Finish and submit your first AI-generated quiz.",
    icon: "check-circle",
    target: 1,
    metric: "quizzes",
  },
  {
    key: "words_1000",
    title: "1000 Words Learned",
    description: "Read and master 1,000+ words across lessons and documents.",
    icon: "book-open",
    target: 1000,
    metric: "words",
  },
  {
    key: "languages_5",
    title: "5 Languages Explored",
    description: "Explore learning or quizzes in 5 different languages.",
    icon: "globe",
    target: 5,
    metric: "languages",
  },
  {
    key: "doc_scholar",
    title: "Document Decoder",
    description: "Upload and analyze your first study document.",
    icon: "file-text",
    target: 1,
    metric: "documents",
  },
  {
    key: "voice_explorer",
    title: "Voice Pioneer",
    description: "Ask a learning question using voice input.",
    icon: "mic",
    target: 1,
    metric: "voice",
  },
  {
    key: "quiz_master",
    title: "Quiz Ace (90%+)",
    description: "Score 90% or higher on any AI quiz.",
    icon: "award",
    target: 1,
    metric: "highScore",
  },
  {
    key: "deep_thinker",
    title: "Deep Thinker",
    description: "Use High Thinking Mode for complex topic analysis.",
    icon: "brain",
    target: 1,
    metric: "deepThinking",
  },
  {
    key: "streak_3",
    title: "3-Day Study Streak",
    description: "Stay active across 3 consecutive study days.",
    icon: "flame",
    target: 3,
    metric: "streak",
  },
];

export function calculateLevel(points: number): {
  level: number;
  title: string;
  currentLevelMin: number;
  nextLevelMin: number;
  progressPercent: number;
} {
  const tiers = [
    { level: 1, min: 0, title: "Curious Learner" },
    { level: 2, min: 150, title: "Knowledge Seeker" },
    { level: 3, min: 400, title: "Concept Builder" },
    { level: 4, min: 800, title: "Multilingual Scholar" },
    { level: 5, min: 1400, title: "Master Strategist" },
    { level: 6, min: 2200, title: "Polyglot Sage" },
  ];
  let current = tiers[0];
  let next = tiers[1];
  for (let i = 0; i < tiers.length; i++) {
    if (points >= tiers[i].min) {
      current = tiers[i];
      next = tiers[i + 1] || { level: tiers[i].level + 1, min: tiers[i].min + 1000, title: "Grandmaster" };
    }
  }
  const span = Math.max(next.min - current.min, 1);
  const progressPercent = Math.min(100, Math.round(((points - current.min) / span) * 100));
  return {
    level: current.level,
    title: current.title,
    currentLevelMin: current.min,
    nextLevelMin: next.min,
    progressPercent,
  };
}

export function countWords(text: string): number {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

function getUtcDateString(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function syncAndGetStreakState(userId: string): {
  streakDays: number;
  longestStreak: number;
  activeToday: boolean;
  lastActiveDate: string | null;
} {
  const row = db
    .prepare("SELECT streak_days, longest_streak, last_active_date FROM users WHERE id = ?")
    .get(userId) as
    | { streak_days: number; longest_streak: number; last_active_date: string | null }
    | undefined;

  if (!row) {
    return { streakDays: 0, longestStreak: 0, activeToday: false, lastActiveDate: null };
  }

  const today = getUtcDateString(0);
  const yesterday = getUtcDateString(-1);
  const activeToday = row.last_active_date === today;
  const isStreakAlive = row.last_active_date === today || row.last_active_date === yesterday;

  let effectiveStreak = isStreakAlive ? row.streak_days : 0;
  let longestStreak = Math.max(row.longest_streak || 0, effectiveStreak);

  if (!isStreakAlive && row.streak_days !== 0) {
    db.prepare("UPDATE users SET streak_days = 0, updated_at = datetime('now') WHERE id = ?").run(
      userId
    );
    effectiveStreak = 0;
  } else if (longestStreak > (row.longest_streak || 0)) {
    db.prepare("UPDATE users SET longest_streak = ?, updated_at = datetime('now') WHERE id = ?").run(
      longestStreak,
      userId
    );
  }

  return {
    streakDays: effectiveStreak,
    longestStreak,
    activeToday,
    lastActiveDate: row.last_active_date,
  };
}

function updateUserStreak(userId: string): {
  streakDays: number;
  longestStreak: number;
  isNewDay: boolean;
} {
  const row = db
    .prepare("SELECT streak_days, longest_streak, last_active_date FROM users WHERE id = ?")
    .get(userId) as
    | { streak_days: number; longest_streak: number; last_active_date: string | null }
    | undefined;
  if (!row) return { streakDays: 0, longestStreak: 0, isNewDay: false };

  const today = getUtcDateString(0);
  const yesterday = getUtcDateString(-1);

  db.prepare(
    `INSERT INTO daily_activity_log (user_id, activity_date, actions_count)
     VALUES (?, ?, 1)
     ON CONFLICT(user_id, activity_date)
     DO UPDATE SET actions_count = actions_count + 1`
  ).run(userId, today);

  if (row.last_active_date === today) {
    const currentStreak = Math.max(row.streak_days, 1);
    const currentLongest = Math.max(row.longest_streak || 0, currentStreak);
    if (currentStreak !== row.streak_days || currentLongest !== row.longest_streak) {
      db.prepare(
        "UPDATE users SET streak_days = ?, longest_streak = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(currentStreak, currentLongest, userId);
    }
    return { streakDays: currentStreak, longestStreak: currentLongest, isNewDay: false };
  }

  const nextStreak = row.last_active_date === yesterday ? row.streak_days + 1 : 1;
  const nextLongest = Math.max(row.longest_streak || 0, nextStreak);

  db.prepare(
    "UPDATE users SET streak_days = ?, longest_streak = ?, last_active_date = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(nextStreak, nextLongest, today, userId);

  return { streakDays: nextStreak, longestStreak: nextLongest, isNewDay: true };
}

export function getRecentActivityDays(userId: string, days = 7) {
  const today = getUtcDateString(0);
  const startDate = getUtcDateString(-(days - 1));

  const rows = db
    .prepare(
      `SELECT activity_date as activityDate, actions_count as actionsCount
       FROM daily_activity_log
       WHERE user_id = ? AND activity_date >= ?
       ORDER BY activity_date ASC`
    )
    .all(userId, startDate) as { activityDate: string; actionsCount: number }[];

  const map = new Map(rows.map((r) => [r.activityDate, r.actionsCount]));
  const result: {
    date: string;
    label: string;
    active: boolean;
    actionsCount: number;
    isToday: boolean;
  }[] = [];

  for (let offset = -(days - 1); offset <= 0; offset++) {
    const dateStr = getUtcDateString(offset);
    const d = new Date(`${dateStr}T00:00:00Z`);
    const label = WEEKDAY_SHORT[d.getUTCDay()] || dateStr.slice(5);
    const count = map.get(dateStr) || 0;
    result.push({
      date: dateStr,
      label,
      active: count > 0,
      actionsCount: count,
      isToday: dateStr === today,
    });
  }

  return result;
}

export function recordActivityAndEvaluateBadges(params: {
  userId: string;
  action: string;
  points: number;
  detail: string;
  wordsAdded?: number;
  languageUsed?: string;
}): {
  pointsEarned: number;
  newlyAwardedBadges: { key: string; title: string; description: string; icon: string }[];
  totalPoints: number;
  streakDays: number;
} {
  const { userId, action, points, detail, wordsAdded = 0, languageUsed } = params;

  const streakUpdate = updateUserStreak(userId);
  let streakBonus = 0;

  if (streakUpdate.isNewDay && streakUpdate.streakDays >= 2) {
    streakBonus = 15;
    db.prepare(
      "INSERT INTO points_ledger (id, user_id, action, points, detail) VALUES (?, ?, ?, ?, ?)"
    ).run(
      crypto.randomUUID(),
      userId,
      "daily_streak",
      streakBonus,
      `${streakUpdate.streakDays}-Day Daily Streak Bonus`
    );
  }

  if (languageUsed && languageUsed !== "Auto-Detect") {
    const cleanLang = normalizeLanguageName(languageUsed);
    db.prepare(
      "INSERT OR IGNORE INTO user_languages_explored (user_id, language) VALUES (?, ?)"
    ).run(userId, cleanLang);
  }

  if (points > 0) {
    db.prepare(
      "INSERT INTO points_ledger (id, user_id, action, points, detail) VALUES (?, ?, ?, ?, ?)"
    ).run(crypto.randomUUID(), userId, action, points, detail);
  }

  db.prepare(
    `UPDATE users
     SET points = points + ?,
         words_learned = words_learned + ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(points + streakBonus, Math.max(0, wordsAdded), userId);

  const metrics = getUserGamificationMetrics(userId);
  const existingBadges = new Set(
    (
      db.prepare("SELECT badge_key FROM user_badges WHERE user_id = ?").all(userId) as {
        badge_key: string;
      }[]
    ).map((b) => b.badge_key)
  );

  const newlyAwardedBadges: { key: string; title: string; description: string; icon: string }[] = [];
  let badgeBonusTotal = 0;

  for (const badge of BADGE_CATALOG) {
    if (existingBadges.has(badge.key)) continue;
    const currentValue = metrics[badge.metric];
    if (currentValue >= badge.target) {
      db.prepare(
        `INSERT OR IGNORE INTO user_badges (id, user_id, badge_key, title, description, icon)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(crypto.randomUUID(), userId, badge.key, badge.title, badge.description, badge.icon);

      const bonus = 50;
      badgeBonusTotal += bonus;
      db.prepare(
        "INSERT INTO points_ledger (id, user_id, action, points, detail) VALUES (?, ?, ?, ?, ?)"
      ).run(crypto.randomUUID(), userId, "badge_unlocked", bonus, `Badge Unlocked: ${badge.title}`);

      newlyAwardedBadges.push({
        key: badge.key,
        title: badge.title,
        description: badge.description,
        icon: badge.icon,
      });
    }
  }

  if (badgeBonusTotal > 0) {
    db.prepare("UPDATE users SET points = points + ? WHERE id = ?").run(badgeBonusTotal, userId);
  }

  const updatedUser = db.prepare("SELECT points FROM users WHERE id = ?").get(userId) as {
    points: number;
  };

  return {
    pointsEarned: points + streakBonus + badgeBonusTotal,
    newlyAwardedBadges,
    totalPoints: updatedUser?.points || 0,
    streakDays: streakUpdate.streakDays,
  };
}

export function getUserGamificationMetrics(userId: string) {
  const streakState = syncAndGetStreakState(userId);

  const userRow = db
    .prepare("SELECT points, words_learned FROM users WHERE id = ?")
    .get(userId) as { points: number; words_learned: number } | undefined;

  const lessons = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM chat_messages m
         JOIN chat_sessions s ON s.id = m.session_id
         WHERE s.user_id = ? AND m.role = 'assistant'`
      )
      .get(userId) as { cnt: number }
  ).cnt;

  const voice = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM chat_messages m
         JOIN chat_sessions s ON s.id = m.session_id
         WHERE s.user_id = ? AND m.role = 'assistant' AND m.source_type = 'voice'`
      )
      .get(userId) as { cnt: number }
  ).cnt;

  const deepThinking = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM chat_messages m
         JOIN chat_sessions s ON s.id = m.session_id
         WHERE s.user_id = ? AND m.role = 'assistant' AND m.model_used = 'gemini-4-carbon'`
      )
      .get(userId) as { cnt: number }
  ).cnt;

  const quizzes = (
    db.prepare("SELECT COUNT(*) as cnt FROM quiz_attempts WHERE user_id = ?").get(userId) as {
      cnt: number;
    }
  ).cnt;

  const highScore = (
    db
      .prepare("SELECT COUNT(*) as cnt FROM quiz_attempts WHERE user_id = ? AND percentage >= 90")
      .get(userId) as { cnt: number }
  ).cnt;

  const documents = (
    db.prepare("SELECT COUNT(*) as cnt FROM documents WHERE user_id = ?").get(userId) as {
      cnt: number;
    }
  ).cnt;

  const languages = (
    db
      .prepare("SELECT COUNT(*) as cnt FROM user_languages_explored WHERE user_id = ?")
      .get(userId) as { cnt: number }
  ).cnt;

  return {
    points: userRow?.points || 0,
    words: userRow?.words_learned || 0,
    streak: streakState.streakDays,
    longestStreak: streakState.longestStreak,
    activeToday: streakState.activeToday,
    lessons,
    quizzes,
    languages,
    documents,
    voice,
    highScore,
    deepThinking,
  };
}

export function getUserGamificationProfile(userId: string) {
  const metrics = getUserGamificationMetrics(userId);
  const levelInfo = calculateLevel(metrics.points);
  const earnedRows = db
    .prepare(
      "SELECT badge_key as key, title, description, icon, awarded_at as awardedAt FROM user_badges WHERE user_id = ? ORDER BY awarded_at DESC"
    )
    .all(userId) as { key: string; title: string; description: string; icon: string; awardedAt: string }[];

  const earnedMap = new Map(earnedRows.map((b) => [b.key, b]));

  const badges = BADGE_CATALOG.map((def) => {
    const earned = earnedMap.get(def.key);
    const current = metrics[def.metric];
    return {
      key: def.key,
      title: def.title,
      description: def.description,
      icon: def.icon,
      unlocked: Boolean(earned),
      awardedAt: earned?.awardedAt || null,
      progress: Math.min(current, def.target),
      target: def.target,
      progressPercent: Math.min(100, Math.round((current / def.target) * 100)),
    };
  });

  const languagesList = (
    db
      .prepare("SELECT language, first_used_at as firstUsedAt FROM user_languages_explored WHERE user_id = ? ORDER BY first_used_at DESC")
      .all(userId) as { language: string; firstUsedAt: string }[]
  );

  const recentLedger = db
    .prepare(
      "SELECT id, action, points, detail, created_at as createdAt FROM points_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 12"
    )
    .all(userId);

  const recentActivityDays = getRecentActivityDays(userId, 7);

  return {
    points: metrics.points,
    wordsLearned: metrics.words,
    streakDays: metrics.streak,
    longestStreak: metrics.longestStreak,
    activeToday: metrics.activeToday,
    recentActivityDays,
    languagesCount: metrics.languages,
    languagesList,
    levelInfo,
    earnedCount: earnedRows.length,
    totalBadges: BADGE_CATALOG.length,
    badges,
    recentLedger,
  };
}

export function getGlobalLeaderboard(currentUserId: string) {
  const rows = db
    .prepare(
      `SELECT
         u.id,
         u.username,
         u.points,
         u.words_learned as wordsLearned,
         CASE
           WHEN u.last_active_date IS NOT NULL AND u.last_active_date >= date('now', '-1 day')
           THEN u.streak_days
           ELSE 0
         END as streakDays,
         (SELECT COUNT(*) FROM user_badges ub WHERE ub.user_id = u.id) as badgeCount,
         (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.user_id = u.id) as quizzesCompleted,
         (SELECT COUNT(*) FROM user_languages_explored ule WHERE ule.user_id = u.id) as languagesCount
       FROM users u
       ORDER BY u.points DESC, badgeCount DESC, u.words_learned DESC
       LIMIT 50`
    )
    .all() as {
    id: string;
    username: string;
    points: number;
    wordsLearned: number;
    streakDays: number;
    badgeCount: number;
    quizzesCompleted: number;
    languagesCount: number;
  }[];

  return rows.map((row, idx) => ({
    rank: idx + 1,
    username: row.username,
    points: row.points,
    level: calculateLevel(row.points).level,
    levelTitle: calculateLevel(row.points).title,
    wordsLearned: row.wordsLearned,
    streakDays: row.streakDays,
    badgeCount: row.badgeCount,
    quizzesCompleted: row.quizzesCompleted,
    languagesCount: row.languagesCount,
    isCurrentUser: row.id === currentUserId,
  }));
}
