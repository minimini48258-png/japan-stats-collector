import JSZip from "jszip";
import { saveAs } from "file-saver";

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ];
  // Excelでの文字化けを避けるためBOMを付与する
  return "﻿" + lines.join("\n");
}

export interface DownloadFile {
  filename: string;
  csv: string;
}

export function downloadSingleCsv(file: DownloadFile) {
  const blob = new Blob([file.csv], { type: "text/csv;charset=utf-8" });
  saveAs(blob, file.filename);
}

export async function downloadZip(files: DownloadFile[], zipName: string) {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.filename, file.csv);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, zipName);
}

export async function downloadFiles(files: DownloadFile[], zipName: string) {
  if (files.length === 1) {
    downloadSingleCsv(files[0]);
  } else if (files.length > 1) {
    await downloadZip(files, zipName);
  }
}
