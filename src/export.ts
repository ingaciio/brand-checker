import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import type { BrandCheckResponse, CheckResult } from "./types.js";

// ── CSV Export ───────────────────────────────────────────────────────

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function exportToCSV(
  responses: BrandCheckResponse[],
  outputPath: string
): Promise<void> {
  const headers = [
    "Marca",
    "Plataforma",
    "Estado",
    "Detalle",
    "URL",
    "Tiempo (ms)",
  ];
  const rows: string[][] = [];

  for (const resp of responses) {
    for (const r of resp.results) {
      rows.push([
        resp.name,
        r.displayName,
        r.status,
        r.detail.replace(/\n/g, " | "),
        r.url || "",
        String(r.responseTimeMs),
      ]);
    }
    for (const group of resp.variations) {
      for (const c of group.checks) {
        rows.push([
          resp.name,
          `${group.displayName} - ${c.displayName}`,
          c.status,
          c.detail,
          c.url || "",
          String(c.responseTimeMs),
        ]);
      }
    }
  }

  const csv = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) => row.map(escapeCSV).join(",")),
  ].join("\n");

  await writeFile(outputPath, "\uFEFF" + csv, "utf-8");
}

// ── PDF Export ───────────────────────────────────────────────────────

function statusLabel(status: string): string {
  switch (status) {
    case "available":
      return '<span style="color:#22c55e">Disponible</span>';
    case "taken":
      return '<span style="color:#ef4444">Tomado</span>';
    case "error":
      return '<span style="color:#f59e0b">Error</span>';
    default:
      return '<span style="color:#a3a3a3">Desconocido</span>';
  }
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderCheckRow(r: CheckResult): string {
  return `<tr>
    <td>${escapeHTML(r.displayName)}</td>
    <td>${statusLabel(r.status)}</td>
    <td style="white-space:pre-line;font-size:11px">${escapeHTML(r.detail)}</td>
    <td>${r.url ? `<a href="${r.url}" style="color:#3b82f6;font-size:11px">${escapeHTML(r.url)}</a>` : ""}</td>
  </tr>`;
}

function buildExportHTML(responses: BrandCheckResponse[]): string {
  const brandSections = responses
    .map((resp) => {
      const mainRows = resp.results.map(renderCheckRow).join("");

      let variationsHTML = "";
      for (const group of resp.variations) {
        if (group.checks.length === 0) continue;
        const available = group.checks.filter(
          (c) => c.status === "available"
        ).length;
        const taken = group.checks.filter(
          (c) => c.status === "taken"
        ).length;
        variationsHTML += `
        <h4 style="margin:16px 0 8px;color:#555">${escapeHTML(group.displayName)} (${available} disponibles, ${taken} tomados)</h4>
        <table>
          <thead><tr><th>Usuario</th><th>Estado</th><th>Detalle</th><th>URL</th></tr></thead>
          <tbody>${group.checks.map(renderCheckRow).join("")}</tbody>
        </table>`;
      }

      const s = resp.summary;
      return `
      <div class="brand-section">
        <h2>${escapeHTML(resp.name.toUpperCase())}</h2>
        <p class="meta">
          ${resp.description ? `Rubro: ${escapeHTML(resp.description)} | ` : ""}
          Fecha: ${new Date(resp.timestamp).toLocaleString("es-AR")} |
          <span style="color:#22c55e">${s.available} disponibles</span>,
          <span style="color:#ef4444">${s.taken} tomados</span>,
          <span style="color:#a3a3a3">${s.unknown + s.errors} sin datos</span>
        </p>
        <table>
          <thead><tr><th>Plataforma</th><th>Estado</th><th>Detalle</th><th>URL</th></tr></thead>
          <tbody>${mainRows}</tbody>
        </table>
        ${variationsHTML}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Brand Check Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1a1a1a; font-size: 13px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #666; margin-bottom: 24px; font-size: 12px; }
  .brand-section { margin-bottom: 32px; page-break-inside: avoid; }
  .brand-section h2 { font-size: 16px; color: #8b6914; border-bottom: 2px solid #e5e5e5; padding-bottom: 6px; margin-bottom: 8px; }
  .meta { font-size: 11px; color: #666; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 12px; }
  th { background: #f5f5f5; text-align: left; padding: 6px 8px; border-bottom: 2px solid #ddd; font-weight: 600; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:hover { background: #fafafa; }
  a { text-decoration: none; }
</style>
</head>
<body>
  <h1>Reporte de Disponibilidad de Marca</h1>
  <p class="subtitle">Generado el ${new Date().toLocaleString("es-AR")} — ${responses.length} marca(s) analizadas</p>
  ${brandSections}
</body>
</html>`;
}

export async function exportToPDF(
  responses: BrandCheckResponse[],
  outputPath: string
): Promise<void> {
  const html = buildExportHTML(responses);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.pdf({
    path: outputPath,
    format: "A4",
    margin: { top: "1cm", bottom: "1cm", left: "1cm", right: "1cm" },
    printBackground: true,
  });
  await browser.close();
}
