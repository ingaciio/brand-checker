import { chromium } from "playwright";
import type { CheckResult, TrademarkMatch } from "../types.js";
import { processTrademarkMatches } from "./trademark-engine.js";

const SEARCH_URL =
  "https://portaltramites.inpi.gob.ar/marcasconsultas/busqueda/?Cod_Funcion=NQA0ADEA";

const API_URL = "/MarcasConsultas/GrillaMarcasAvanzada";

interface INPIRow {
  Acta: number;
  Denominacion: string;
  Titulares: string;
  Clase: number;
  Tipo_Marca: string;
  Estado: string;
  Numero_Resolucion: string;
}

interface INPIResponse {
  total: number;
  rows: INPIRow[];
}

const ESTADO_LABELS: Record<string, string> = {
  C: "Concedida",
  T: "En Tramite",
  A: "Abandonada",
  D: "Denegada",
  N: "Nula",
  V: "Vencida",
};

/** Map an INPI row to the shared TrademarkMatch format */
function toTrademarkMatch(row: INPIRow, brandName: string): TrademarkMatch {
  const isActive = row.Estado === "C" || row.Estado === "T";
  const titular = row.Titulares
    ? row.Titulares.split(" 100")[0].split(" 50")[0].trim()
    : "Sin titular";
  const isExactMatch =
    row.Denominacion.trim().toUpperCase() === brandName.toUpperCase();
  return {
    brandName: row.Denominacion.trim(),
    owner: titular,
    niceClasses: [row.Clase],
    status: ESTADO_LABELS[row.Estado] || row.Estado,
    isActive,
    isExactMatch,
    sourceId: String(row.Acta),
  };
}

/**
 * Fetch paginated results from the INPI API.
 * Uses the browser page context (cookies/session) to make direct POST calls.
 * Fetches up to MAX_ROWS (600) in pages of PAGE_SIZE (200).
 */
async function fetchINPIRows(
  page: import("playwright").Page,
  brandName: string
): Promise<{ total: number; rows: INPIRow[] }> {
  const PAGE_SIZE = 200;
  const MAX_ROWS = 600;
  const allRows: INPIRow[] = [];
  let total = 0;
  let offset = 0;

  do {
    const response: INPIResponse | null = await page.evaluate(
      async (params) => {
        const res = await fetch("/MarcasConsultas/GrillaMarcasAvanzada", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            Tipo_Resolucion: "",
            Clase: "-1",
            TipoBusquedaDenominacion: "1",
            Denominacion: params.brandName,
            Titular: "",
            TipoBusquedaTitular: "0",
            Fecha_IngresoDesde: "",
            Fecha_IngresoHasta: "",
            Fecha_ResolucionDesde: "",
            Fecha_ResolucionHasta: "",
            vigentes: false,
            limit: params.limit,
            offset: params.offset,
          }),
        });
        return res.json();
      },
      { brandName: brandName.toUpperCase(), limit: PAGE_SIZE, offset }
    );

    if (!response || !response.rows?.length) break;

    total = response.total;
    allRows.push(...response.rows);
    offset += PAGE_SIZE;
  } while (offset < total && offset < MAX_ROWS);

  return { total, rows: allRows };
}

export async function checkINPI(
  brandName: string,
  description?: string
): Promise<CheckResult> {
  const start = Date.now();
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
      ],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "es-AR",
      timezoneId: "America/Argentina/Buenos_Aires",
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    const page = await context.newPage();

    // Navigate to establish session cookies
    await page.goto(SEARCH_URL, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    // Fetch all pages directly via API (limit 200 per page, max 600 rows)
    const { total, rows } = await fetchINPIRows(page, brandName);

    await browser.close();
    browser = undefined;

    // ── No data from INPI ─────────────────────────────────────────────
    if (rows.length === 0) {
      return processTrademarkMatches(
        [],
        {
          platform: "inpi",
          displayName: "INPI Argentina",
          searchUrl: SEARCH_URL,
          description,
          brandName,
        },
        start
      );
    }

    // ── Map ALL rows to TrademarkMatch (engine separates exact vs similar) ─
    const allMatches = rows.map((r) => toTrademarkMatch(r, brandName));

    return processTrademarkMatches(
      allMatches,
      {
        platform: "inpi",
        displayName: "INPI Argentina",
        searchUrl: SEARCH_URL,
        description,
        brandName,
        totalSimilarResults: total,
      },
      start
    );
  } catch (error) {
    return {
      platform: "inpi",
      displayName: "INPI Argentina",
      status: "unknown",
      detail: `Error: ${error instanceof Error ? error.message : "Desconocido"}. Verificar manualmente.`,
      url: SEARCH_URL,
      responseTimeMs: Date.now() - start,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
