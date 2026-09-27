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
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_file"; filename: string; file_data: string };

function toParts(label: string, file: ReconcileFilePart): ContentPart[] {
  const header: ContentPart = {
    type: "input_text",
    text: `${label} — file name: ${file.name}`,
  };
  if (file.kind === "image") {
    return [header, { type: "input_image", image_url: file.content }];
  }
  if (file.kind === "pdf") {
    return [header, { type: "input_file", filename: file.name, file_data: file.content }];
  }
  return [header, { type: "input_text", text: file.content }];
}

export const runReconciliation = createServerFn({ method: "POST" })
  .validator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error("کلید OpenAI تنظیم نشده است.");
    }

    const content: ContentPart[] = [
      {
        type: "input_text",
        text:
          "The user uploaded the files below without labeling them. First identify which file(s) are SCANNED_LIST (scanned image/PDF), ORIGINAL_LIST (original digital list) and EXCEL_LIST (the Excel file), then perform the task.",
      },
      ...data.files.flatMap((file, i) => toParts(`FILE_${i + 1}`, file)),
    ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-6-luna",
        input: [
          { role: "system", content: [{ type: "input_text", text: AI_SYSTEM_PROMPT }] },
          { role: "user", content },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${detail.slice(0, 500)}`);
    }

    const text = await readStreamText(response);

    if (!text.trim()) {
      throw new Error("مدل پاسخی تولید نکرد.");
    }

    return { html: stripCodeFence(text) };
  });

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1] ?? trimmed;
}

async function readStreamText(response: Response): Promise<string> {
  if (!response.body) throw new Error("پاسخی از مدل دریافت نشد.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finalText: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        let evt: { type?: string; delta?: string; text?: string; response?: { error?: { message?: string } }; message?: string };
        try {
          evt = JSON.parse(raw);
        } catch {
          continue;
        }
        if (evt.type === "response.output_text.delta" && evt.delta) text += evt.delta;
        else if (evt.type === "response.output_text.done" && typeof evt.text === "string")
          finalText = (finalText ?? "") + evt.text;
        else if (evt.type === "response.failed" || evt.type === "error")
          throw new Error(`OpenAI error: ${evt.response?.error?.message ?? evt.message ?? "unknown"}`);
        else if (evt.type === "response.refusal.done")
          throw new Error("مدل از پاسخ به این درخواست خودداری کرد.");
      }
    }
  }
  return finalText ?? text;
}
