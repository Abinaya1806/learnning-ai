import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["pdf", "docx", "pptx", "txt"] as const;

export type SupportedDocExt = (typeof ALLOWED_EXTENSIONS)[number];

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export async function parseUploadedDocument(params: {
  originalname: string;
  size: number;
  buffer: Buffer;
}): Promise<{ ext: SupportedDocExt; text: string }> {
  if (!params.buffer || params.size === 0) {
    throw new Error("Uploaded file is empty.");
  }
  if (params.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("File exceeds the 10 MB size limit.");
  }

  const ext = params.originalname.split(".").pop()?.toLowerCase() as SupportedDocExt | undefined;
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error("Unsupported file type. Allowed formats: PDF, DOCX, PPTX, TXT.");
  }

  let text = "";

  if (ext === "txt") {
    text = params.buffer.toString("utf-8");
  } else if (ext === "pdf") {
    const uint8 = new Uint8Array(params.buffer);
    const pdf = await getDocumentProxy(uint8);
    const parsed = await extractText(pdf, { mergePages: true });
    text = parsed.text || "";
  } else if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer: params.buffer });
    text = result.value || "";
  } else if (ext === "pptx") {
    const zip = await JSZip.loadAsync(params.buffer);
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const na = Number(a.match(/slide(\d+)\.xml/)?.[1] || 0);
        const nb = Number(b.match(/slide(\d+)\.xml/)?.[1] || 0);
        return na - nb;
      });

    const slidesText: string[] = [];
    for (const slidePath of slideFiles) {
      const xml = await zip.files[slidePath].async("text");
      const matches = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) =>
        decodeXmlEntities(m[1])
      );
      if (matches.length > 0) {
        const slideNum = slidePath.match(/slide(\d+)\.xml/)?.[1] || "";
        slidesText.push(`Slide ${slideNum}: ${matches.join(" ")}`);
      }
    }
    text = slidesText.join("\n\n");
  }

  const cleaned = text.replace(/\u0000/g, "").trim();
  if (!cleaned || cleaned.length < 10) {
    throw new Error(
      "No readable text could be extracted from this file. Scanned image-only PDFs are not supported."
    );
  }

  return { ext, text: cleaned.slice(0, 65000) };
}
