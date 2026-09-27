import * as XLSX from "xlsx";

import type { ReconcileFilePart } from "./reconcile.functions";

export const ACCEPTED =
  ".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function isExcel(file: File) {
  return /\.(xlsx|xls|csv)$/i.test(file.name);
}

async function excelToText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    return `--- Sheet: ${name} ---\n${sheet ? XLSX.utils.sheet_to_csv(sheet) : ""}`;
  }).join("\n\n");
}

export async function toFilePart(file: File): Promise<ReconcileFilePart> {
  if (isExcel(file)) {
    return {
      kind: "text",
      name: file.name,
      mimeType: file.type || "text/csv",
      content: await excelToText(file),
    };
  }
  if (/^image\//.test(file.type) || /\.(png|jpe?g)$/i.test(file.name)) {
    return {
      kind: "image",
      name: file.name,
      mimeType: file.type || "image/jpeg",
      content: await readDataUrl(file),
    };
  }
  return {
    kind: "pdf",
    name: file.name,
    mimeType: file.type || "application/pdf",
    content: await readDataUrl(file),
  };
}

/** Turns every <table> in the report HTML into a sheet of an Excel workbook. */
export function exportReportToExcel(html: string, fileName = "reconciliation-report.xlsx") {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  const workbook = XLSX.utils.book_new();
  const used = new Set<string>();
  const uniqueName = (base: string) => {
    let name = base || "Sheet";
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${base.slice(0, 25)} ${n++}`;
    used.add(name.toLowerCase());
    return name;
  };

  if (tables.length === 0) {
    const text = (doc.body.textContent ?? "").split("\n").map((line) => [line.trim()]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(text), uniqueName("گزارش"));
  } else {
    tables.forEach((table, index) => {
      const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((cell) =>
          (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
        ),
      );
      const caption =
        table.querySelector("caption")?.textContent?.trim() ||
        table.previousElementSibling?.textContent?.trim() ||
        `جدول ${index + 1}`;
      const sheetName = caption.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || `Sheet${index + 1}`;
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), uniqueName(sheetName));
    });
  }

  XLSX.writeFile(workbook, fileName);
}
