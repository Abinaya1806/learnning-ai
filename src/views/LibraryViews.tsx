import { useEffect, useState } from "react";
import { Download, FolderPlus, Search, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "../components/UiFeedback";
import { apiFetch } from "../utils/authToken";
import { triggerDownload } from "../utils/download";

export function MaterialsView({
  onToast,
}: {
  onToast: (type: "success" | "error" | "info" | "reward", msg: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  async function load() {
    const res = await apiFetch("/api/materials");
    setData(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) return;
    await apiFetch("/api/materials", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: deleteTarget.type, id: deleteTarget.id }),
    });
    onToast("info", "Material deleted");
    setDeleteTarget(null);
    load();
  }

  if (!data) return <p className="text-sm text-slate-500">Loading personal materials...</p>;

  const items = [
    ...(data.documents || []).map((d: any) => ({
      id: d.id,
      type: "document",
      title: d.fileName,
      sub: `${d.fileType} · ${d.language}`,
      content: d.detailedNotes || d.summary || d.extractedText || "",
      lang: d.language,
    })),
    ...(data.notes || []).map((n: any) => ({
      id: n.id,
      type: "note",
      title: n.title,
      sub: `${n.category} · ${n.language}`,
      content: n.content,
      lang: n.language,
    })),
    ...(data.quizzes || []).map((qz: any) => ({
      id: qz.id,
      type: "quiz",
      title: qz.title,
      sub: `${qz.questionCount} questions · ${qz.language}`,
      content: qz.questionsJson,
      lang: qz.language,
    })),
    ...(data.attempts || []).map((a: any) => ({
      id: a.id,
      type: "score",
      title: `${a.quizTitle} (${a.percentage}%)`,
      sub: `Score Report · ${a.correctCount}/${a.totalMarks}`,
      content: `Quiz: ${a.quizTitle}\nScore: ${a.correctCount}/${a.totalMarks} (${a.percentage}%)`,
      lang: a.quizLanguage || "English",
    })),
    ...(data.downloads || []).map((dl: any) => ({
      id: dl.id,
      type: "download",
      title: dl.title,
      sub: `Downloaded ${dl.format} · ${dl.language}`,
      content: dl.content,
      lang: dl.language,
    })),
  ].filter(
    (item) =>
      (filter === "all" || item.type === filter) &&
      item.title.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Materials Library</h1>
          <p className="text-xs text-slate-500">
            Search, open, download, and manage your documents, notes, quizzes, and reports.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search materials..."
              className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
          >
            <option value="all">All Categories</option>
            <option value="document">Uploaded Documents</option>
            <option value="note">Notes & Explanations</option>
            <option value="quiz">Quizzes</option>
            <option value="score">Score Reports</option>
            <option value="download">Downloaded Files</option>
          </select>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-indigo-100/80 text-sm text-slate-500">
          No matching materials found in your library.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((it) => (
            <div
              key={`${it.type}-${it.id}`}
              className="bg-white rounded-2xl p-5 border border-indigo-100/80 shadow-xs flex flex-col justify-between gap-4"
            >
              <div>
                <p className="text-xs font-medium text-[#6C63FF] uppercase tracking-wide">{it.sub}</p>
                <h3 className="font-bold text-slate-900 mt-1">{it.title}</h3>
                <p className="text-xs text-slate-600 mt-1.5 line-clamp-3">{it.content}</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPreviewItem(it)}
                  className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold cursor-pointer"
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerDownload({
                      title: it.title,
                      category: it.type,
                      format: "PDF",
                      language: it.lang,
                      content: it.content,
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold cursor-pointer"
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerDownload({
                      title: it.title,
                      category: it.type,
                      format: "DOCX",
                      language: it.lang,
                      content: it.content,
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold cursor-pointer"
                >
                  DOCX
                </button>
                {it.type !== "score" && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(it)}
                    className="px-3 py-1.5 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[82vh] flex flex-col p-6 shadow-2xl border border-indigo-100">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">{previewItem.title}</h3>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <pre className="mt-4 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-slate-700 flex-1">
              {previewItem.content}
            </pre>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Material"
        message={`Remove "${deleteTarget?.title}" from your personal library?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export function DownloadsView({
  onToast,
}: {
  onToast: (type: "success" | "error" | "info" | "reward", msg: string) => void;
}) {
  const [downloads, setDownloads] = useState<any[]>([]);

  useEffect(() => {
    apiFetch("/api/downloads")
      .then((r) => r.json())
      .then((d) => setDownloads(d.downloads || []))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Download Center & History</h1>
        <p className="text-xs text-slate-500">
          Re-download explanations, notes, quizzes, answer keys, and score reports in Unicode-safe PDF, DOCX, or TXT.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-indigo-100/80 shadow-xs divide-y divide-slate-100">
        {downloads.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No downloads yet. Export any AI explanation, document study pack, or quiz report.
          </p>
        ) : (
          downloads.map((d) => (
            <div key={d.id} className="p-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <p className="font-semibold text-sm text-slate-900">{d.title}</p>
                <p className="text-xs text-slate-500 font-mono-nums">
                  {d.category} · {d.language} · {d.format} · {d.createdAt.slice(0, 16)}
                </p>
              </div>
              <div className="flex gap-2">
                {(["PDF", "DOCX", "TXT"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={async () => {
                      await triggerDownload({
                        title: d.title,
                        category: d.category,
                        format: fmt,
                        language: d.language,
                        content: d.content,
                      });
                      onToast("success", `Downloaded ${fmt}`);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{fmt}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function SavedView({
  onOpenTopicInLearn,
  onToast,
}: {
  onOpenTopicInLearn: (topic: string) => void;
  onToast: (type: "success" | "error" | "info" | "reward", msg: string) => void;
}) {
  const [collections, setCollections] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [colName, setColName] = useState("");
  const [activeCollection, setActiveCollection] = useState<string>("all");

  async function load() {
    const res = await apiFetch("/api/saved-topics");
    const data = await res.json();
    setCollections(data.collections || []);
    setTopics(data.topics || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!colName.trim()) return;
    await apiFetch("/api/saved-topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "collection", name: colName }),
    });
    setColName("");
    onToast("success", "Collection created");
    load();
  }

  async function assignCollection(topicId: string, collectionId: string) {
    await apiFetch(`/api/saved-topics/${topicId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId: collectionId || null }),
    });
    onToast("success", "Collection updated");
    load();
  }

  async function remove(kind: "topic" | "collection", id: string) {
    await apiFetch("/api/saved-topics", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id }),
    });
    onToast("info", kind === "collection" ? "Collection removed" : "Bookmark removed");
    load();
  }

  const filteredTopics =
    activeCollection === "all"
      ? topics
      : topics.filter((t) => t.collectionId === activeCollection);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Saved Topics & Collections</h1>
          <p className="text-xs text-slate-500">
            Organize bookmarked explanations into subject collections and revisit anytime.
          </p>
        </div>

        <form onSubmit={createCollection} className="flex gap-2">
          <input
            value={colName}
            onChange={(e) => setColName(e.target.value)}
            placeholder="New collection name..."
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl gradient-brand text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Create</span>
          </button>
        </form>
      </div>

      {/* Collection Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveCollection("all")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
            activeCollection === "all"
              ? "gradient-brand text-white"
              : "bg-white border border-indigo-100 text-slate-700"
          }`}
        >
          All Bookmarks ({topics.length})
        </button>
        {collections.map((c) => (
          <div key={c.id} className="flex items-center bg-white border border-indigo-100 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setActiveCollection(c.id)}
              className={`px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                activeCollection === c.id ? "bg-[#6C63FF] text-white" : "text-slate-700"
              }`}
            >
              {c.name}
            </button>
            <button
              type="button"
              onClick={() => remove("collection", c.id)}
              className="px-2 py-1.5 text-xs text-slate-400 hover:text-rose-600 cursor-pointer"
              aria-label={`Delete collection ${c.name}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {filteredTopics.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-indigo-100/80 text-sm text-slate-500">
          No saved topics here yet. Bookmark any AI explanation from New AI Learning.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredTopics.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-2xl p-5 border border-indigo-100/80 shadow-xs space-y-3"
            >
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="font-bold text-slate-900">{t.title}</h3>
                  <p className="text-xs text-slate-500">
                    {t.language} · {t.mode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove("topic", t.id)}
                  className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                  aria-label="Delete saved topic"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 max-h-40 overflow-y-auto bg-[#F7F6FF]/70 p-3 rounded-xl">
                {t.content}
              </pre>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <select
                  aria-label="Assign collection"
                  value={t.collectionId || ""}
                  onChange={(e) => assignCollection(t.id, e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  <option value="">No Collection</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onOpenTopicInLearn(t.title)}
                  className="text-xs font-semibold text-[#6C63FF] hover:underline cursor-pointer"
                >
                  Continue Learning
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
