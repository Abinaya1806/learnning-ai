import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../components/UiFeedback";
import { apiFetch } from "../utils/authToken";

export function HistoryView({
  onOpenSession,
  onNewChat,
  onToast,
}: {
  onOpenSession: (id: string) => void;
  onNewChat: () => void;
  onToast: (type: "success" | "error" | "info" | "reward", msg: string) => void;
}) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  async function load(search = "") {
    const res = await apiFetch(`/api/chat/sessions?q=${encodeURIComponent(search)}`);
    const data = await res.json();
    setSessions(data.sessions || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveRename(id: string) {
    if (!editTitle.trim()) return;
    const res = await apiFetch(`/api/chat/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle }),
    });
    if (res.ok) {
      setEditingId(null);
      onToast("success", "Conversation renamed");
      load(q);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await apiFetch(`/api/chat/sessions/${deleteTarget.id}`, { method: "DELETE" });
    onToast("info", "Conversation deleted");
    setDeleteTarget(null);
    load(q);
  }

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDay = 86400000;

  const groups: Record<string, any[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 Days": [],
    Older: [],
  };

  for (const s of sessions) {
    const ts = new Date(s.updatedAt.replace(" ", "T") + (s.updatedAt.includes("Z") ? "" : "Z")).getTime();
    if (ts >= startToday) groups["Today"].push(s);
    else if (ts >= startToday - oneDay) groups["Yesterday"].push(s);
    else if (ts >= startToday - 7 * oneDay) groups["Previous 7 Days"].push(s);
    else groups["Older"].push(s);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Chat History</h1>
          <p className="text-xs text-slate-500">
            Conversations are automatically saved and preserved across logins.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                load(e.target.value);
              }}
              placeholder="Search chat history..."
              className="pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm"
            />
          </div>
          <button
            type="button"
            onClick={onNewChat}
            className="px-4 py-2 rounded-xl gradient-brand text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-indigo-100/80 space-y-3">
          <p className="text-sm text-slate-600">No conversations found.</p>
          <button
            type="button"
            onClick={onNewChat}
            className="px-4 py-2 rounded-xl gradient-brand text-white text-xs font-semibold cursor-pointer"
          >
            Start Your First AI Session
          </button>
        </div>
      ) : (
        Object.entries(groups).map(([label, list]) =>
          list.length > 0 ? (
            <div key={label} className="space-y-2">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</h2>
              <div className="bg-white rounded-2xl border border-indigo-100/80 divide-y divide-slate-100 shadow-xs">
                {list.map((s) => (
                  <div key={s.id} className="p-4 flex items-center justify-between gap-3">
                    {editingId === s.id ? (
                      <div className="flex gap-2 flex-1">
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => saveRename(s.id)}
                          className="px-3 py-1.5 rounded-xl bg-[#6C63FF] text-white text-xs font-semibold cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenSession(s.id)}
                        className="text-left flex-1 min-w-0 cursor-pointer"
                      >
                        <p className="font-semibold text-slate-900 text-sm truncate hover:text-[#6C63FF]">
                          {s.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {s.language} · {s.mode}
                        </p>
                      </button>
                    )}

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(s.id);
                          setEditTitle(s.title);
                        }}
                        className="p-2 text-slate-400 hover:text-[#6C63FF] cursor-pointer"
                        aria-label="Rename conversation"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(s)}
                        className="p-2 text-slate-400 hover:text-rose-600 cursor-pointer"
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null
        )
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Conversation"
        message={`Delete "${deleteTarget?.title}" permanently?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
