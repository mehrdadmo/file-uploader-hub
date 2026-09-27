import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, FileSpreadsheet, FileText, Loader2, Upload, X } from "lucide-react";

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

function Index() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [dragging, setDragging] = useState(false);

  const ready = files.length > 0;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => {
      const key = (f: File) => `${f.name}-${f.size}`;
      const seen = new Set(prev.map(key));
      return [...prev, ...incoming.filter((f) => !seen.has(key(f)))].slice(0, 20);
    });
  }

  async function start() {
    if (!ready) return;
    setStatus("working");
    setError(null);
    setReport(null);
    setApproved(false);
    try {
      const parts = await Promise.all(files.map(toFilePart));
      const result = await runReconciliation({ data: { files: parts } });
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
        <div className="mx-auto flex max-w-5xl items-center px-6 py-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">سامانه مغایرت‌گیری لیست بیمه</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              بارگذاری فایل‌ها، تطبیق هوشمند، بررسی گزارش و خروجی اکسل
            </p>
          </div>

        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <section className="space-y-3">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed bg-card p-10 text-center transition-colors hover:border-primary ${dragging ? "border-primary" : "border-border"}`}
          >
            <Upload className="size-8 text-primary" />
            <span className="text-sm font-semibold">فایل‌ها را اینجا رها کنید یا کلیک کنید</span>
            <span className="text-xs text-muted-foreground">
              لیست اسکن‌شده، لیست اصلی و فایل اکسل — PDF، اکسل، JPG یا PNG (چند فایل با هم)
            </span>
            <input
              type="file"
              multiple
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {files.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {files.map((f, i) => (
                <li key={`${f.name}-${f.size}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <FileText className="size-4 shrink-0 text-primary" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    disabled={status === "working"}
                    aria-label="حذف فایل"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
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
            <span className="text-xs text-muted-foreground">ابتدا فایل‌ها را بارگذاری کنید.</span>
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
