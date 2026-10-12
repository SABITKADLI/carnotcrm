"use client";

export function downloadCSV(name: string, rows: unknown[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          let text = String(value ?? "");
          if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
          return `"${text.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
