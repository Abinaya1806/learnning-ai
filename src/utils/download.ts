import { apiFetch } from "./authToken";

export async function triggerDownload(params: {
  title: string;
  category: string;
  format: "PDF" | "DOCX" | "TXT" | "PRINT_PDF";
  language: string;
  content: string;
}): Promise<void> {
  const res = await apiFetch("/api/downloads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Download failed" }));
    throw new Error(err.error || "Download failed");
  }

  if (params.format === "PRINT_PDF") {
    const data = await res.json();
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const escaped = String(data.content)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
        <title>${data.title}</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&family=Noto+Sans+Tamil:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&family=Noto+Sans+Arabic:wght@400;700&family=Noto+Sans+JP:wght@400;700&display=swap"/>
        <style>
          body{font-family:'Noto Sans','Noto Sans Tamil','Noto Sans Devanagari','Noto Sans Arabic','Noto Sans JP',sans-serif;padding:40px;color:#1A173B;line-height:1.65;}
          h1{color:#6C63FF;margin-bottom:4px;font-size:22px;}
          .meta{color:#64748b;font-size:13px;margin-bottom:20px;border-bottom:1px solid #e2e8f0;padding-bottom:10px;}
        </style></head><body>
        <h1>${data.title}</h1>
        <div class="meta">${data.subtitle}</div>
        <div>${escaped}</div>
        </body></html>`);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 2000);
      }, 450);
    }
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeBase = params.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "LearnMate_Export";
  a.href = url;
  a.download = `${safeBase}.${params.format.toLowerCase()}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
