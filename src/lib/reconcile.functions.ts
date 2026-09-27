import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { AI_SYSTEM_PROMPT } from "./reconcile-prompt";

const filePartSchema = z.object({
  kind: z.enum(["image", "pdf", "text"]),
  name: z.string(),
  mimeType: z.string(),
  /** data URL for image/pdf, plain text for text */
  content: z.string(),
});

const inputSchema = z.object({
  files: z.array(filePartSchema).min(1).max(20),
});

export type ReconcileFilePart = z.infer<typeof filePartSchema>;

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

function toParts(label: string, file: ReconcileFilePart): ContentPart[] {
  const header: ContentPart = { type: "text", text: `${label} — file name: ${file.name}` };
  if (file.kind === "image") return [header, { type: "image_url", image_url: { url: file.content } }];
  if (file.kind === "pdf")
    return [header, { type: "file", file: { filename: file.name, file_data: file.content } }];
  return [header, { type: "text", text: file.content }];
}

export const runReconciliation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) throw new Error("سرویس هوش مصنوعی پیکربندی نشده است.");

    const content: ContentPart[] = [
      {
        type: "text",
        text: "The user uploaded the files below without labeling them. First identify which file(s) are SCANNED_LIST (scanned image/PDF), ORIGINAL_LIST (original digital list) and EXCEL_LIST (the Excel file), then perform the task. Return ONLY the final HTML report.",
      },
      ...data.files.flatMap((file, i) => toParts(`FILE_${i + 1}`, file)),
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("AI gateway error", response.status, detail);
      if (response.status === 429) throw new Error("تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.");
      if (response.status === 402) throw new Error("اعتبار سرویس هوش مصنوعی تمام شده است.");
      throw new Error("خطا در پردازش فایل‌ها توسط هوش مصنوعی.");
    }

    const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("مدل پاسخی تولید نکرد.");
    return { html: stripCodeFence(text) };
  });

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
  return (match?.[1] ?? trimmed).replace(/<script[\s\S]*?<\/script>/gi, "");
}
