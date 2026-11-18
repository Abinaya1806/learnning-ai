# LearnMate AI — Multilingual AI Learning Platform

LearnMate AI is a full-stack, AI-powered multilingual study platform built with **React, TypeScript, Tailwind CSS, Express, SQLite (`better-sqlite3`), and Google Gemini (`@google/genai`)**.

## Core Features
- **Authentication & Private Data**: Sign Up, Sign In, Show/Hide Password, Forgot/Reset Password, Change Password, HTTP-only JWT cookies, and strict per-user data isolation.
- **Structured AI Learning Assistant**: 12-section student-friendly explanations (Simple Definition, Easy Explanation, Step-by-Step, Real-Life Examples, Applications, Advantages/Disadvantages, Important Points, Summary, Key Terms, Exam Prep Questions, Revision Notes, Related Topics), 5 Learning Modes, 7 Follow-up Actions, and **Deep Thinking Mode** powered by `gemini-4-carbon` (`ThinkingLevel.HIGH`) alongside fast `gemini-4-hydrogen`.
- **15+ Languages + Auto-Detect**: English, Tamil, Tanglish, Hindi, Telugu, Malayalam, Kannada, Bengali, Marathi, French, Spanish, German, Arabic, Chinese, and Japanese.
- **Document Upload Learning**: Upload PDF, DOCX, PPTX, or TXT (up to 10 MB) to generate summaries, chapter-wise explanations, short/detailed notes, important questions, MCQs, revision points, and document Q&A.
- **Voice Learning Studio**: Browser Speech-to-Text + Text-to-Speech across supported languages with clear microphone permission error handling.
- **AI Quiz Generator & Score Analytics**: MCQ, True/False, Fill in the Blanks, Short Answer, and Match the Following; custom question counts (1–50); Easy/Medium/Hard; optional countdown timer; weak-topic detection & improvement suggestions.
- **Gamification & Global Leaderboard**: Earn XP points for lessons, documents, voice sessions, and quizzes; unlock milestone badges (`First AI Quiz Completed`, `1000 Words Learned`, `5 Languages Explored`, `First Step Scholar`, `Document Decoder`, `Voice Pioneer`, `Quiz Ace (90%+)`, `Deep Thinker`, `3-Day Study Streak`); compete on the Global Leaderboard.
- **Personal Library & Unicode Download Center**: Persistent Chat History (Today / Yesterday / Previous 7 Days / Older), My Materials, Saved Topics & Collections, and real PDF, DOCX, and UTF-8 TXT exports.

## Environment Variables
Copy `.env.example` to `.env` (never commit `.env` to GitHub):
- `GEMINI_API_KEY` — Your Google Gemini API key from [Google AI Studio](https://aistudio.google.com/). Note: Free-tier API keys have per-minute and daily quota limits (not unlimited); paid models such as `gemini-4-carbon` require a billing-enabled API key.
- `JWT_SECRET` — A random secret string for signing session cookies.
- `DATABASE_PATH` — Optional path to the SQLite file (defaults to `./learnmate.db`).
- `APP_URL` — Public or local URL (e.g. `http://localhost:3000`).

## Running Locally
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

## Production Build
```bash
npm run build
npm start
```

## Publishing Safely to GitHub
1. Verify `.gitignore` excludes `.env*`, `*.db`, `*.db-*`, and `.learnmate_jwt_secret`.
2. Run `git status` before committing to confirm no API keys or database files are staged.
3. Push to GitHub and deploy on any Node.js host (Render, Railway, Fly.io, or Cloud Run) with `GEMINI_API_KEY` and `JWT_SECRET` configured in environment secrets.
