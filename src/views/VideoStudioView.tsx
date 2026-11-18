import { useEffect, useState } from "react";
import { Download, Film, Loader2, Sparkles, Trash2, Video, X } from "lucide-react";
import { ConfirmDialog, RewardSummaryBanner } from "../components/UiFeedback";
import type { GamificationReward, MediaCreationItem } from "../types";
import { appendAuthTokenToUrl, apiFetch } from "../utils/authToken";

const VIDEO_PRESETS = [
  "3D animated science explainer showing photosynthesis inside a green leaf as sunlight, water, and CO2 convert into oxygen bubbles",
  "Cinematic educational visualization of tectonic plates colliding to form mountain ranges in geological cross-section",
  "Clean stop-motion demonstration of Newton's cradle transferring momentum between chrome spheres on a wooden desk",
];

export function VideoStudioView({
  initialReferenceImage,
  onClearReferenceImage,
  onGamificationUpdate,
  onToast,
}: {
  initialReferenceImage?: MediaCreationItem | null;
  onClearReferenceImage: () => void;
  onGamificationUpdate: () => void;
  onToast: (type: "success" | "error" | "info" | "reward", msg: string) => void;
}) {
  const [items, setItems] = useState<MediaCreationItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [duration, setDuration] = useState<string>("8s");
  const [resolution, setResolution] = useState<"720p" | "1080p" | "360p">("720p");

  const [activeItem, setActiveItem] = useState<MediaCreationItem | null>(null);
  const [extendTarget, setExtendTarget] = useState<MediaCreationItem | null>(null);
  const [lastReward, setLastReward] = useState<GamificationReward | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaCreationItem | null>(null);

  useEffect(() => {
    apiFetch("/api/media/list?kind=video")
      .then((r) => r.json())
      .then((d) => {
        const list = d.items || [];
        setItems(list);
        if (list.length > 0) setActiveItem(list[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || generating) return;
    setGenerating(true);

    try {
      const payload: Record<string, unknown> = {
        prompt: prompt.trim(),
        aspectRatio,
        duration,
        resolution,
      };
      if (extendTarget?.interactionId) {
        payload.previousInteractionId = extendTarget.interactionId;
      } else if (initialReferenceImage) {
        payload.sourceMediaId = initialReferenceImage.id;
      }

      const res = await apiFetch("/api/media/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Video generation failed.");

      setItems((prev) => [data.item, ...prev]);
      setActiveItem(data.item);
      setExtendTarget(null);
      if (initialReferenceImage) onClearReferenceImage();

      if (data.gamification) {
        setLastReward(data.gamification);
        onGamificationUpdate();
        if (data.gamification.newlyAwardedBadges?.length > 0) {
          onToast("reward", `Badge Unlocked: ${data.gamification.newlyAwardedBadges[0].title}`);
        }
      }
      onToast("success", "Study video generated!");
    } catch (err) {
      onToast("error", err instanceof Error ? err.message : "Video generation failed.");
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
      onToast("info", "Video removed from library.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleGenerate}
          className="lg:col-span-5 bg-white rounded-3xl p-6 border border-indigo-100/80 shadow-xs space-y-4"
        >
          <div>
            <h1 className="text-xl font-bold text-slate-900">AI Video Studio</h1>
            <p className="text-xs text-slate-500 mt-1">
              Generate landscape (<span className="font-mono-nums">16:9</span>) or portrait (
              <span className="font-mono-nums">9:16</span>) concept videos via{" "}
              <span className="font-semibold text-[#6C63FF]">gemini-omni-1.2-flash</span> Interactions API.
            </p>
          </div>

          {initialReferenceImage && !extendTarget && (
            <div className="p-3 rounded-2xl bg-[#F7F6FF] border border-indigo-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={appendAuthTokenToUrl(`/api/media/file/${initialReferenceImage.id}`)}
                  alt="Starting frame"
                  className="w-12 h-12 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#6C63FF]">Animating Starting Image</p>
                  <p className="text-[11px] text-slate-600 truncate">{initialReferenceImage.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClearReferenceImage}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-white cursor-pointer"
                aria-label="Clear reference image"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {extendTarget && (
            <div className="p-3 rounded-2xl bg-[#F7F6FF] border border-indigo-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#6C63FF]">Editing / Extending Video</p>
                <p className="text-[11px] text-slate-600 truncate">{extendTarget.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setExtendTarget(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-white cursor-pointer"
                aria-label="Cancel video follow-up"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              {extendTarget ? "Edit / Extension Instruction" : "Video Scene Prompt"}
            </label>
            <textarea
              required
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the motion, camera perspective, and visual explanation..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm resize-none"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {VIDEO_PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setPrompt(p)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-[#F7F6FF] text-[#6C63FF] font-medium hover:bg-indigo-100/70 transition cursor-pointer"
              >
                Scene {idx + 1}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Aspect Ratio</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as "16:9" | "9:16")}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value="16:9">16:9 Landscape</option>
                <option value="9:16">9:16 Portrait</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value="5s">5s</option>
                <option value="8s">8s</option>
                <option value="10s">10s</option>
                <option value="12s">12s</option>
                <option value="15s">15s</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Resolution</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as "360p" | "720p" | "1080p")}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="360p">360p</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={generating || !prompt.trim()}
            className="w-full px-5 py-3 rounded-xl gradient-brand text-white text-sm font-semibold shadow-sm hover:opacity-95 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating Video (may take ~1-2 min)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{extendTarget ? "Extend / Edit Video" : "Generate Video"}</span>
              </>
            )}
          </button>
        </form>

        {/* Video Player */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-indigo-100/80 shadow-xs flex flex-col justify-between gap-4">
          {activeItem ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 truncate">{activeItem.title}</h2>
                  <p className="text-xs text-slate-500 font-mono-nums">
                    {activeItem.aspectRatio} · {activeItem.duration || "8s"} · {activeItem.resolution || "720p"} ·{" "}
                    {activeItem.modelUsed}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {activeItem.interactionId && (
                    <button
                      type="button"
                      onClick={() => {
                        setExtendTarget(activeItem);
                        setPrompt("");
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>Edit / Extend</span>
                    </button>
                  )}
                  <a
                    href={appendAuthTokenToUrl(`/api/media/file/${activeItem.id}`)}
                    download={`${activeItem.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.mp4`}
                    className="px-3 py-1.5 rounded-xl gradient-brand text-white text-xs font-semibold flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download MP4</span>
                  </a>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950 overflow-hidden flex items-center justify-center max-h-[440px]">
                <video
                  key={activeItem.id}
                  controls
                  playsInline
                  src={appendAuthTokenToUrl(`/api/media/file/${activeItem.id}`)}
                  className="max-h-[430px] w-full object-contain"
                />
              </div>
            </>
          ) : (
            <div className="py-20 text-center space-y-2 text-slate-500">
              <Video className="w-10 h-10 mx-auto text-[#6C63FF]/60" />
              <p className="text-sm font-medium text-slate-700">No video generated yet</p>
              <p className="text-xs">
                Choose 16:9 landscape or 9:16 portrait and describe an educational concept to animate.
              </p>
            </div>
          )}
        </div>
      </div>

      <RewardSummaryBanner reward={lastReward} />

      <div className="bg-white rounded-3xl p-6 border border-indigo-100/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Your Video Library</h2>
          <span className="text-xs text-slate-500 font-mono-nums">{items.length} videos</span>
        </div>

        {loadingList ? (
          <div className="py-8 flex justify-center text-[#6C63FF]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Generated study videos appear here.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className={`rounded-2xl border p-3.5 transition space-y-2.5 ${
                  activeItem?.id === item.id
                    ? "border-[#6C63FF] bg-[#F7F6FF]"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveItem(item)}
                    className="text-left min-w-0 flex-1 cursor-pointer"
                  >
                    <p className="text-sm font-bold text-slate-900 truncate">{item.title}</p>
                    <p className="text-[11px] text-slate-500 font-mono-nums mt-0.5">
                      {item.aspectRatio} · {item.duration || "8s"} · {item.resolution || "720p"}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                    aria-label="Delete video"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveItem(item)}
                  className="w-full py-2 rounded-xl bg-[#F7F6FF] text-[#6C63FF] text-xs font-semibold hover:bg-indigo-100/70 cursor-pointer"
                >
                  Open in Player
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Generated Video?"
        message={`Remove "${deleteTarget?.title}" from your video library?`}
        confirmLabel="Delete Video"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
