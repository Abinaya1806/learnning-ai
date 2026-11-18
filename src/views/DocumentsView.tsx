import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Send, Trash2, Upload } from "lucide-react";
import { SUPPORTED_LANGUAGES, type GamificationReward, type UserProfile } from "../types";
import { ConfirmDialog, RewardSummaryBanner } from "../components/UiFeedback";
import { apiFetch } from "../utils/authToken";
import { triggerDownload } from "../utils/download";

export function DocumentsView({
  user,
  onCreateQuizFromDoc,
  onGamificationUpdate,
  onToast,
}: {
  user: UserProfile;
  onCreateQuizFromDoc: (docId: string, topic: string) => void;
  onGamificationUpdate: () => void;
  onToast: (type: "success" | "error" | "info" | "reward", msg: string, sub?: string) => void;
}) {
  const [docs, setDocs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState(user.preferredLanguage || "English");
  const [activeTab, setActiveTab] = useState<
    "summary" | "chapters" | "notes" | "questions" | "mcqs" | "ask"
  >("summary");

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [docQuestion, setDocQuestion] = useState("");
  const [docAnswer, setDocAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [lastReward, setLastReward] = useState<GamificationReward | null>(null);

  useEffect(() => {
    apiFetch("/api/documents")
      .then((r) => r.json())
      .then((d) => {
        const list = d.documents || [];
        setDocs(list);
        if (list[0]) setSelected(list[0]);
      })
      .catch(() => {});
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("language", language);
      const res = await apiFetch("/api/documents", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Document upload failed.");

      setDocs((prev) => [data.document, ...prev]);
      setSelected(data.document);
      setFile(null);
      setActiveTab("summary");

      if (data.gamification) {
        setLastReward(data.gamification);
        onGamificationUpdate();
      }
      onToast("success", "Document Analyzed!", `${data.document.fileName} is ready in your library.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setError(msg);
      onToast("error", msg);
    } finally {
      setUploading(false);
    }
  }

  async function askAboutDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !docQuestion.trim()) return;
    setAsking(true);
    setError("");
    try {
      const res = await apiFetch("/api/chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: docQuestion,
          language,
          mode: "Intermediate",
          deepThinking: true,
          sourceType: "document",
          documentId: selected.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Document Q&A failed.");
      const s = data.structured;
      setDocAnswer(
        `${s.simpleDefinition}\n\n${s.easyExplanation}\n\nKey Points:\n${(s.importantPoints || [])
          .map((p: string) => `• ${p}`)
          .join("\n")}\n\nSummary:\n${s.summary}`
      );
      onGamificationUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Q&A failed.");
    } finally {
      setAsking(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await apiFetch(`/api/documents/${deleteTarget.id}`, { method: "DELETE" });
    setDocs((prev) => prev.filter((d) => d.id !== deleteTarget.id));
    if (selected?.id === deleteTarget.id) setSelected(null);
    onToast("info", "Document deleted");
    setDeleteTarget(null);
  }

  async function exportStudyPack(fmt: "PDF" | "DOCX" | "TXT") {
    if (!selected) return;
    const content = [
      `SUMMARY:\n${selected.summary}`,
      `SHORT NOTES:\n${selected.shortNotes}`,
      `DETAILED NOTES:\n${selected.detailedNotes}`,
      `REVISION POINTS:\n${(JSON.parse(selected.revisionPoints || "[]") as string[])
        .map((p) => `- ${p}`)
        .join("\n")}`,
    ].join("\n\n");
    try {
      await triggerDownload({
        title: `${selected.fileName}_Study_Notes`,
        category: "notes",
        format: fmt,
        language: selected.language,
        content,
      });
      onToast("success", `Exported ${fmt}`);
    } catch (err) {
      onToast("error", err instanceof Error ? err.message : "Export failed");
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleUpload}
        className="bg-white rounded-3xl p-6 border border-indigo-100/80 shadow-xs space-y-4"
      >
        <div>
          <h1 className="text-xl font-bold text-slate-900">Upload Learning Documents</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Supports PDF, DOCX, PPTX, and TXT up to 10 MB. Automatically generates summaries, chapter explanations, notes, MCQs, and revision points.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="file"
            accept=".pdf,.docx,.pptx,.txt"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-[#F7F6FF] file:text-[#6C63FF] file:font-semibold cursor-pointer"
          />

          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.name} value={l.name}>
                {l.name} ({l.nativeLabel})
              </option>
            ))}
          </select>

          <button
            disabled={uploading || !file}
            type="submit"
            className="px-5 py-2.5 rounded-xl gradient-brand text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-55 cursor-pointer whitespace-nowrap"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span>{uploading ? "Processing Document..." : "Upload & Analyze"}</span>
          </button>
        </div>
      </form>

      <RewardSummaryBanner reward={lastReward} />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-4 border border-indigo-100/80 shadow-xs space-y-2 h-fit">
          <h2 className="font-bold text-slate-900 text-sm px-2 pb-2 border-b border-slate-100">
            Personal Document Library ({docs.length})
          </h2>
          {docs.length === 0 ? (
            <p className="text-xs text-slate-500 p-2">No documents uploaded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {docs.map((d) => (
                <div
                  key={d.id}
                  onClick={() => {
                    setSelected(d);
                    setDocAnswer("");
                  }}
                  className={`p-3 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition ${
                    selected?.id === d.id ? "bg-[#F7F6FF]" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">{d.fileName}</p>
                    <p className="text-xs text-slate-500">
                      {d.fileType} · {d.language}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(d);
                    }}
                    className="text-slate-400 hover:text-rose-600 p-1.5 cursor-pointer"
                    aria-label="Delete document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-indigo-100/80 shadow-xs space-y-5">
          {!selected ? (
            <div className="py-12 text-center space-y-2">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-500">
                Upload or select a document to explore its AI-generated study pack.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap justify-between items-center gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selected.fileName}</h2>
                  <p className="text-xs text-slate-500">
                    {selected.fileType} · {selected.language} ·{" "}
                    <span className="font-mono-nums">{Math.round(selected.fileSize / 1024)} KB</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["PDF", "DOCX", "TXT"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => exportStudyPack(fmt)}
                      className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold flex items-center gap-1 hover:bg-indigo-100/70 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{fmt}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => onCreateQuizFromDoc(selected.id, selected.fileName)}
                    className="px-3.5 py-1.5 rounded-xl gradient-brand text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Generate Quiz
                  </button>
                </div>
              </div>

              {/* Tab Switcher */}
              <div className="flex flex-wrap gap-1 p-1 bg-[#F7F6FF] rounded-xl">
                {(
                  [
                    { key: "summary", label: "Summary & Revision" },
                    { key: "chapters", label: "Chapter-wise" },
                    { key: "notes", label: "Short & Detailed Notes" },
                    { key: "questions", label: "Important Q&A" },
                    { key: "mcqs", label: "Practice MCQs" },
                    { key: "ask", label: "Ask Document" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                      activeTab === t.key
                        ? "bg-white text-[#6C63FF] shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {activeTab === "summary" && (
                <div className="space-y-4 text-sm">
                  <div>
                    <h3 className="font-bold text-slate-900 mb-1">Document Summary</h3>
                    <p className="text-slate-700 leading-relaxed">{selected.summary}</p>
                  </div>
                  <div className="pt-4 border-t border-slate-100">
                    <h3 className="font-bold text-slate-900 mb-1.5">Key Revision Points</h3>
                    <ul className="list-disc ml-5 space-y-1 text-slate-700">
                      {(JSON.parse(selected.revisionPoints || "[]") as string[]).map((rp, i) => (
                        <li key={i}>{rp}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === "chapters" && (
                <div className="divide-y divide-slate-100 text-sm">
                  {(JSON.parse(selected.chaptersJson || "[]") as any[]).map((c, i) => (
                    <div key={i} className="py-3.5 first:pt-0">
                      <h3 className="font-bold text-slate-900">{c.title}</h3>
                      <p className="text-slate-700 mt-1">{c.explanation}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "notes" && (
                <div className="grid md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">Short Notes</h3>
                    <p className="whitespace-pre-wrap text-slate-700 bg-[#F7F6FF] p-4 rounded-2xl">
                      {selected.shortNotes}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">Detailed Notes</h3>
                    <p className="whitespace-pre-wrap text-slate-700 bg-slate-50 p-4 rounded-2xl">
                      {selected.detailedNotes}
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "questions" && (
                <div className="divide-y divide-slate-100 text-sm">
                  {(JSON.parse(selected.questionsJson || "[]") as any[]).map((q, i) => (
                    <div key={i} className="py-3.5 first:pt-0">
                      <p className="font-semibold text-slate-900">
                        Q{i + 1}. {q.question}
                      </p>
                      <p className="text-slate-700 mt-1">{q.answer}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "mcqs" && (
                <div className="divide-y divide-slate-100 text-sm">
                  {(JSON.parse(selected.mcqsJson || "[]") as any[]).map((m, i) => (
                    <div key={i} className="py-3.5 first:pt-0 space-y-1">
                      <p className="font-semibold text-slate-900">
                        {i + 1}. {m.question}
                      </p>
                      <p className="text-xs text-slate-600">
                        Options: {(m.options || []).join(" · ")}
                      </p>
                      <p className="text-xs font-semibold text-emerald-700">
                        Answer: {m.answer} — {m.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "ask" && (
                <form onSubmit={askAboutDoc} className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      value={docQuestion}
                      onChange={(e) => setDocQuestion(e.target.value)}
                      placeholder="Ask any question based on this document..."
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                    />
                    <button
                      disabled={asking || !docQuestion.trim()}
                      type="submit"
                      className="px-4 py-2.5 rounded-xl gradient-brand text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      <span>Ask</span>
                    </button>
                  </div>
                  {docAnswer && (
                    <pre className="p-4 rounded-2xl bg-[#F7F6FF] whitespace-pre-wrap font-sans text-sm text-slate-800">
                      {docAnswer}
                    </pre>
                  )}
                </form>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Document"
        message={`Remove "${deleteTarget?.fileName}" and its study pack permanently?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
