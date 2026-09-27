import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, FileSpreadsheet, FileText, Loader2, ScanLine, Upload } from "lucide-react";

import { ACCEPTED, exportReportToExcel, toFilePart } from "@/lib/file-input";
import { runReconciliation } from "@/lib/reconcile.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "مغایرت‌گیری لیست تأمین اجتماعی" },
      {
        name: "description",
        content:
          "بارگذاری لیست اسکن‌شده، لیست اصلی و فایل اکسل و دریافت گزارش کامل مغایرت‌گیری با خروجی اکسل.",
      },
      { property: "og:title", content: "مغایرت‌گیری لیست تأمین اجتماعی" },
      {
        property: "og:description",
        content: "مقایسه خودکار لیست تأمین اجتماعی با فایل اکسل و تهیه گزارش مغایرت‌ها.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Slot = "scanned" | "original" | "excel";

const SLOTS: { key: Slot; title: string; hint: string; icon: typeof ScanLine }[] = [
  {
    key: "scanned",
    title: "۱. لیست اسکن‌شده",
    hint: "تصویر یا PDF اسکن لیست تأمین‌کننده",
    icon: ScanLine,
  },
  {
    key: "original",
    title: "۲. لیست اصلی (دیجیتال)",
    hint: "نسخه اصلی لیست تأمین اجتماعی",
    icon: FileText,
  },
  {
    key: "excel",
    title: "۳. فایل اکسل",
    hint: "فایل Excel برای مقایسه با لیست مرجع",
    icon: FileSpreadsheet,
  },
];

function Index() {
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const ready = Boolean(files.scanned && files.original && files.excel);

  async function start() {
    if (!ready) return;
    setStatus("working");
    setError(null);
    setReport(null);
    setApproved(false);
    try {
      const [scanned, original, excel] = await Promise.all([
        toFilePart(files.scanned!),
        toFilePart(files.original!),
        toFilePart(files.excel!),
      ]);
      const result = await runReconciliation({ data: { scanned, original, excel } });
      setReport(result.html);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای ناشناخته");
      setStatus("error");
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background font-sans text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">سامانه مغایرت‌گیری لیست بیمه</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              بارگذاری فایل‌ها، تطبیق هوشمند، بررسی گزارش و خروجی اکسل
            </p>
          </div>
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            GPT-6 Luna
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <section className="grid gap-4 md:grid-cols-3">
          {SLOTS.map(({ key, title, hint, icon: Icon }) => (
            <label
              key={key}
              className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-dashed border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4 text-primary" />
                {title}
              </span>
              <span className="text-xs text-muted-foreground">{hint}</span>
              <span className="mt-auto flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                <Upload className="size-3.5 shrink-0" />
                <span className="truncate">{files[key]?.name ?? "انتخاب فایل"}</span>
              </span>
              <input
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setFiles((prev) => ({ ...prev, [key]: file }));
                }}
              />
            </label>
          ))}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={start}
            disabled={!ready || status === "working"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {status === "working" && <Loader2 className="size-4 animate-spin" />}
            {status === "working" ? "در حال مغایرت‌گیری…" : "شروع مغایرت‌گیری"}
          </button>
          {!ready && (
            <span className="text-xs text-muted-foreground">هر سه فایل را بارگذاری کنید.</span>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {report && (
          <section className="space-y-4">
            <div className="report-html rounded-xl border border-border bg-card p-6">
              <div dangerouslySetInnerHTML={{ __html: report }} />
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
              <button
                onClick={() => setApproved(true)}
                disabled={approved}
                className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground disabled:opacity-60"
              >
                <CheckCircle2 className="size-4" />
                {approved ? "گزارش تأیید شد" : "تأیید گزارش"}
              </button>
              <button
                onClick={() => exportReportToExcel(report)}
                disabled={!approved}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <FileSpreadsheet className="size-4" />
                خروجی اکسل
              </button>
              {!approved && (
                <span className="text-xs text-muted-foreground">
                  برای دریافت خروجی، ابتدا گزارش را تأیید کنید.
                </span>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
