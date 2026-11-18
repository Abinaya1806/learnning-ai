import { useEffect, useState } from "react";
import {
  Download,
  Film,
  ImagePlus,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ConfirmDialog, RewardSummaryBanner } from "../components/UiFeedback";
import type { GamificationReward, MediaCreationItem } from "../types";
import { appendAuthTokenToUrl, apiFetch } from "../utils/authToken";

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "1:4", "4:1"] as const;
const IMAGE_SIZES = ["1K", "2K", "4K"] as const;

const STUDY_PRESETS = [
  "Labeled cross-section diagram of a plant chloroplast showing thylakoids and stroma, clean textbook illustration style",
  "Step-by-step visual diagram of the water cycle over coastal mountains with clear atmospheric arrows",
  "Historical architectural blueprint cutaway of a Roman aqueduct with water flow channels",
];

export function ImageStudioView({
  onGamificationUpdate,
  onAnimateImageInVideo,
  onToast,
}: {
  onGamificationUpdate: () => void;
  onAnimateImageInVideo: (item: MediaCreationItem) => void;
  onToast: (type: "success" | "error" | "info" | "reward", msg: string) => void;
}) {
  const [items, setItems] = useState<MediaCreationItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [imageSize, setImageSize] = useState<string>("1K");
  const [useGoogleSearch, setUseGoogleSearch] = useState(false);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string>("");
  const [editingMediaItem, setEditingMediaItem] = useState<MediaCreationItem | null>(null);

  const [activeItem, setActiveItem] = useState<MediaCreationItem | null>(null);
  const [lastReward, setLastReward] = useState<GamificationReward | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaCreationItem | null>(null);

  useEffect(() => {
    apiFetch("/api/media/list?kind=image")
      .then((r) => r.json())
      .then((d) => {
        const list = d.items || [];
        setItems(list);
        if (list.length > 0) setActiveItem(list[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditingMediaItem(null);
    setUploadedFile(file);
    setUploadedPreviewUrl(URL.createObjectURL(file));
  }

  function clearEditSource() {
    setUploadedFile(null);
    if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl);
    setUploadedPreviewUrl("");
    setEditingMediaItem(null);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    try {
      const form = new FormData();
      form.append("prompt", prompt.trim());
      form.append("aspectRatio", aspectRatio);
      form.append("imageSize", imageSize);
      form.append("useGoogleSearch", String(useGoogleSearch));
      if (uploadedFile) {
        form.append("sourceImage", uploadedFile);
      } else if (editingMediaItem) {
        form.append("sourceMediaId", editingMediaItem.id);
      }

      const res = await apiFetch("/api/media/image", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed.");

      setItems((prev) => [data.item, ...prev]);
      setActiveItem(data.item);
      if (data.gamification) {
        setLastReward(data.gamification);
        onGamificationUpdate();
        if (data.gamification.newlyAwardedBadges?.length > 0) {
          onToast("reward", `Badge Unlocked: ${data.gamification.newlyAwardedBadges[0].title}`);
        }
      }
      onToast("success", editingMediaItem || uploadedFile ? "Image edited!" : "Study visual created!");
    } catch (err) {
      onToast("error", err instanceof Error ? err.message : "Image request failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const res = await apiFetch(`/api/media/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((x) => x.id !== id));
      if (activeItem?.id === id) setActiveItem(null);
      onToast("info", "Image deleted from studio library.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Prompt & Controls */}
        <form
          onSubmit={handleGenerate}
          className="lg:col-span-5 bg-white rounded-3xl p-6 border border-indigo-100/80 shadow-xs space-y-4"
        >
          <div>
            <h1 className="text-xl font-bold text-slate-900">AI Image Studio</h1>
            <p className="text-xs text-slate-500 mt-1">
              Create or edit high-resolution diagrams, flashcards, and visual concepts with{" "}
              <span className="font-semibold text-[#6C63FF]">gemini-nano-banana-2.1</span>.
            </p>
          </div>

          {(uploadedPreviewUrl || editingMediaItem) && (
            <div className="p-3 rounded-2xl bg-[#F7F6FF] border border-indigo-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={
                    uploadedPreviewUrl || appendAuthTokenToUrl(`/api/media/file/${editingMediaItem!.id}`)
                  }
                  alt="Edit source"
                  className="w-12 h-12 rounded-xl object-cover shrink-0 border border-indigo-100"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#6C63FF]">Editing Source Image</p>
                  <p className="text-[11px] text-slate-600 truncate">
                    {uploadedFile ? uploadedFile.name : editingMediaItem?.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearEditSource}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-white cursor-pointer"
                aria-label="Clear source image"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              {uploadedFile || editingMediaItem ? "Edit Instruction" : "Visual Prompt"}
            </label>
            <textarea
              required
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                uploadedFile || editingMediaItem
                  ? "Describe what to add, remove, annotate, or restyle..."
                  : "Describe an educational diagram, chart, historical scene, or illustration..."
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm resize-none"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {STUDY_PRESETS.map((preset, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPrompt(preset)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-[#F7F6FF] text-[#6C63FF] font-medium hover:bg-indigo-100/70 transition cursor-pointer"
              >
                Preset {i + 1}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Aspect Ratio</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              >
                {ASPECT_RATIOS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Resolution</label>
              <select
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              >
                {IMAGE_SIZES.map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={useGoogleSearch}
              onChange={(e) => setUseGoogleSearch(e.target.checked)}
              className="rounded border-slate-300 text-[#6C63FF]"
            />
            <Search className="w-3.5 h-3.5 text-[#6C63FF]" />
            <span>Ground with Web &amp; Image Search context</span>
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <label className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Upload Image to Edit</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            <button
              type="submit"
              disabled={generating || !prompt.trim()}
              className="flex-1 px-5 py-2.5 rounded-xl gradient-brand text-white text-sm font-semibold shadow-sm hover:opacity-95 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Rendering...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{uploadedFile || editingMediaItem ? "Apply Edit" : "Generate Image"}</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Active Image Preview */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-indigo-100/80 shadow-xs flex flex-col justify-between gap-4">
          {activeItem ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 truncate">{activeItem.title}</h2>
                  <p className="text-xs text-slate-500 font-mono-nums">
                    {activeItem.aspectRatio} · {activeItem.resolution || "1K"} · {activeItem.modelUsed}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      clearEditSource();
                      setEditingMediaItem(activeItem);
                      setPrompt("");
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAnimateImageInVideo(activeItem)}
                    className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-slate-800 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Animate Video</span>
                  </button>
                  <a
                    href={appendAuthTokenToUrl(`/api/media/file/${activeItem.id}`)}
                    download={`${activeItem.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`}
                    className="px-3 py-1.5 rounded-xl gradient-brand text-white text-xs font-semibold flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                </div>
              </div>

              <div className="rounded-2xl bg-[#F7F6FF] border border-indigo-100 overflow-hidden flex items-center justify-center max-h-[440px]">
                <img
                  src={appendAuthTokenToUrl(`/api/media/file/${activeItem.id}`)}
                  alt={activeItem.prompt}
                  className="max-h-[430px] w-auto object-contain"
                />
              </div>

              {activeItem.caption && (
                <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                  {activeItem.caption}
                </p>
              )}
            </>
          ) : (
            <div className="py-20 text-center space-y-2 text-slate-500">
              <ImagePlus className="w-10 h-10 mx-auto text-[#6C63FF]/60" />
              <p className="text-sm font-medium text-slate-700">No image selected yet</p>
              <p className="text-xs">
                Enter a prompt on the left or upload an image to create study diagrams and concept art.
              </p>
            </div>
          )}
        </div>
      </div>

      <RewardSummaryBanner reward={lastReward} />

      {/* Personal Image Gallery */}
      <div className="bg-white rounded-3xl p-6 border border-indigo-100/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Your Image Library</h2>
          <span className="text-xs text-slate-500 font-mono-nums">{items.length} images</span>
        </div>

        {loadingList ? (
          <div className="py-8 flex justify-center text-[#6C63FF]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Generated and edited images appear here.</p>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className={`rounded-2xl border overflow-hidden transition ${
                  activeItem?.id === item.id
                    ? "border-[#6C63FF] bg-[#F7F6FF]"
                    : "border-slate-200 bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveItem(item)}
                  className="w-full h-40 bg-slate-100 overflow-hidden cursor-pointer block"
                >
                  <img
                    src={appendAuthTokenToUrl(`/api/media/file/${item.id}`)}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                </button>
                <div className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{item.title}</p>
                    <p className="text-[11px] text-slate-500 font-mono-nums">
                      {item.aspectRatio} · {item.resolution || "1K"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                    aria-label="Delete image"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Generated Image?"
        message={`Remove "${deleteTarget?.title}" from your personal studio library?`}
        confirmLabel="Delete Image"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
