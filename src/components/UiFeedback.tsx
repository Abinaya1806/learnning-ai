import { Award, CheckCircle2, Info, Sparkles, X, XCircle } from "lucide-react";
import type { GamificationReward } from "../types";

export interface ToastItem {
  id: string;
  type: "success" | "error" | "info" | "reward";
  message: string;
  subtext?: string;
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-2xl p-4 shadow-lg border bg-white flex items-start gap-3 transition-all ${
            t.type === "error"
              ? "border-rose-200"
              : t.type === "reward"
              ? "border-indigo-200"
              : "border-slate-200"
          }`}
        >
          {t.type === "error" ? (
            <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          ) : t.type === "reward" ? (
            <Award className="w-5 h-5 text-[#6C63FF] shrink-0 mt-0.5" />
          ) : t.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-5 h-5 text-[#55C2FF] shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">{t.message}</p>
            {t.subtext && <p className="text-xs text-slate-600 mt-0.5">{t.subtext}</p>}
          </div>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-indigo-100 space-y-4">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{message}</p>
        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 cursor-pointer whitespace-nowrap"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RewardSummaryBanner({ reward }: { reward: GamificationReward | null }) {
  if (!reward || reward.pointsEarned <= 0) return null;
  return (
    <div className="rounded-2xl p-4 gradient-soft border border-indigo-100 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl gradient-brand text-white flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">
            +<span className="font-mono-nums">{reward.pointsEarned}</span> XP Points Earned
          </p>
          <p className="text-xs text-slate-600">
            Total Balance: <span className="font-mono-nums font-semibold">{reward.totalPoints}</span> XP
            {reward.newlyAwardedBadges.length > 0 &&
              ` · New Badge${reward.newlyAwardedBadges.length > 1 ? "s" : ""}: ${reward.newlyAwardedBadges.map((b) => b.title).join(", ")}`}
          </p>
        </div>
      </div>
    </div>
  );
}
