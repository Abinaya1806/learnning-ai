import { Document as DocxDocument, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import fs from "node:fs";
import PDFDocument from "pdfkit";

export async function generateDocxBuffer(params: {
  title: string;
  subtitle: string;
  content: string;
}): Promise<Buffer> {
  const lines = params.content.split(/\r?\n/);

  const doc = new DocxDocument({
    sections: [
      {
        children: [
          new Paragraph({
            text: params.title,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `${params.subtitle} · LearnMate AI`,
                italics: true,
                color: "6C63FF",
                size: 20,
              }),
            ],
            spacing: { after: 240 },
          }),
          ...lines.map(
            (line) =>
              new Paragraph({
                children: [new TextRun({ text: line, size: 22 })],
                spacing: { after: 110 },
              })
          ),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export function generateUtf8TxtBuffer(params: {
  title: string;
  subtitle: string;
  content: string;
}): Buffer {
  const header = `${params.title}\n${params.subtitle}\nLearnMate AI Export\n${"=".repeat(56)}\n\n`;
  return Buffer.from("\uFEFF" + header + params.content, "utf-8");
}

function findUnicodeFont(): string | null {
  const candidates = [
    "/usr/share/fonts/opentype/unifont/unifont.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export async function generatePdfBuffer(params: {
  title: string;
  subtitle: string;
  content: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fontPath = findUnicodeFont();
    if (fontPath) {
      doc.font(fontPath);
    }

    doc.fillColor("#6C63FF").fontSize(18).text(params.title, { align: "left" });
    doc.moveDown(0.3);
    doc.fillColor("#64748B").fontSize(10).text(`${params.subtitle} · LearnMate AI`);
    doc.moveDown(0.6);
    doc
      .strokeColor("#E2E8F0")
      .lineWidth(1)
      .moveTo(48, doc.y)
      .lineTo(547, doc.y)
      .stroke();
    doc.moveDown(0.8);

    doc.fillColor("#1A173B").fontSize(11);
    const lines = params.content.split(/\r?\n/);
    for (const line of lines) {
      doc.text(line || " ", { lineGap: 3 });
    }

    doc.end();
  });
}
