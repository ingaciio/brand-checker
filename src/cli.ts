import { checkBrandAvailability } from "./checker.js";
import { loadHistory } from "./history.js";
import type { BrandCheckResponse } from "./types.js";

const rawName = process.argv[2];
const description = process.argv.find(
  (a, i) => i > 2 && !a.startsWith("--")
);
const exportIdx = process.argv.indexOf("--export");
const exportFormat =
  exportIdx >= 0 ? process.argv[exportIdx + 1] : null;

// ── History ──────────────────────────────────────────────────────────

if (rawName === "--history" || rawName === "-h") {
  const history = await loadHistory();
  if (history.length === 0) {
    console.log("\nSin busquedas anteriores.\n");
  } else {
    console.log(`\nHistorial (${history.length} busquedas):\n`);
    for (const h of history) {
      const date = new Date(h.timestamp).toLocaleDateString("es-AR");
      const desc = h.description ? ` - "${h.description}"` : "";
      console.log(
        `  ${date}  ${h.name.padEnd(20)} \u2705${h.summary.available} \u274C${h.summary.taken}${desc}`
      );
    }
    console.log("");
  }
  process.exit(0);
}

if (!rawName) {
  console.error('Uso: npx tsx src/cli.ts <nombre> ["descripcion"]');
  console.error(
    '     npx tsx src/cli.ts "NIKE,ADIDAS,PUMA" "zapatillas"'
  );
  console.error("     npx tsx src/cli.ts --history");
  console.error(
    '     npx tsx src/cli.ts "NIKE" --export pdf|csv'
  );
  console.error(
    '\nEjemplo: npx tsx src/cli.ts vinora "club de vinos premium"'
  );
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────

const icons: Record<string, string> = {
  available: "\u2705",
  taken: "\u274C",
  unknown: "\u2753",
  error: "\u26A0\uFE0F",
};

function printBrandResult(result: BrandCheckResponse): void {
  for (const check of result.results) {
    const icon = icons[check.status] ?? "?";
    const pad = check.displayName.padEnd(18);
    const status = check.status.toUpperCase().padEnd(10);
    console.log(`${icon}  ${pad} ${status} ${check.detail}`);
    if (check.buyUrl) {
      console.log(
        `    \u2514\u2500 \uD83D\uDED2 Comprar: ${check.buyUrl}`
      );
    } else if (check.url) {
      console.log(`    \u2514\u2500 ${check.url}`);
    }
  }

  for (const group of result.variations) {
    if (group.checks.length === 0) continue;

    const available = group.checks.filter(
      (c) => c.status === "available"
    );
    const taken = group.checks.filter((c) => c.status === "taken");

    console.log("\n" + "\u2500".repeat(65));
    console.log(
      `  ${group.displayName.toUpperCase()} (${available.length} disponibles de ${group.checks.length})`
    );
    console.log("\u2500".repeat(65));

    for (const check of available) {
      console.log(
        `\u2705  ${check.displayName.padEnd(28)} DISPONIBLE`
      );
    }
    for (const check of taken) {
      console.log(
        `\u274C  ${check.displayName.padEnd(28)} TOMADO`
      );
    }
    for (const check of group.checks.filter(
      (c) => c.status !== "available" && c.status !== "taken"
    )) {
      console.log(
        `${icons[check.status]}  ${check.displayName.padEnd(28)} ${check.status.toUpperCase()}`
      );
    }
  }

  console.log("\n" + "\u2500".repeat(65));
  console.log(
    `Resumen: ${result.summary.available} disponible(s), ` +
      `${result.summary.taken} tomado(s), ` +
      `${result.summary.unknown} incierto(s), ` +
      `${result.summary.errors} error(es)`
  );
  console.log(`Checkeado: ${result.timestamp}`);
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    if (executing.size >= limit) await Promise.race(executing);
    const p = fn(item).finally(() => executing.delete(p));
    executing.add(p);
  }
  await Promise.all(executing);
}

// ── Parse names ──────────────────────────────────────────────────────

const names = [
  ...new Set(
    rawName
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
  ),
].slice(0, 5);

// ── Run checks ───────────────────────────────────────────────────────

const allResults: BrandCheckResponse[] = [];

if (names.length === 1) {
  // Single brand — same output as before
  console.log(`\nCheckeando disponibilidad para: "${names[0]}"`);
  if (description) console.log(`Descripcion: "${description}"`);
  console.log("\n" + "\u2500".repeat(65));
  console.log("  RESULTADOS PRINCIPALES");
  console.log("\u2500".repeat(65));

  try {
    const result = await checkBrandAvailability({
      name: names[0],
      description,
    });
    printBrandResult(result);
    allResults.push(result);
    console.log("");
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : "Desconocido"}`
    );
    process.exit(1);
  }
} else {
  // Multiple brands — parallel with concurrency 2
  console.log(
    `\nCheckeando ${names.length} marcas (concurrencia: 2):`
  );
  console.log(`  ${names.join(", ")}`);
  if (description) console.log(`Descripcion: "${description}"`);

  await runWithConcurrency(names, 2, async (brandName) => {
    try {
      const result = await checkBrandAvailability({
        name: brandName,
        description,
      });
      allResults.push(result);

      console.log("\n" + "=".repeat(65));
      console.log(`  MARCA: ${brandName.toUpperCase()}`);
      console.log("=".repeat(65));
      printBrandResult(result);
    } catch (error) {
      console.log("\n" + "=".repeat(65));
      console.log(`  MARCA: ${brandName.toUpperCase()}`);
      console.log("=".repeat(65));
      console.error(
        `Error: ${error instanceof Error ? error.message : "Desconocido"}`
      );
    }
  });

  // Global summary
  const totals = allResults.reduce(
    (acc, r) => ({
      available: acc.available + r.summary.available,
      taken: acc.taken + r.summary.taken,
      unknown: acc.unknown + r.summary.unknown,
      errors: acc.errors + r.summary.errors,
    }),
    { available: 0, taken: 0, unknown: 0, errors: 0 }
  );

  console.log("\n" + "=".repeat(65));
  console.log(
    `TOTAL ${allResults.length} marcas: ${totals.available} disponible(s), ${totals.taken} tomado(s), ${totals.unknown} incierto(s), ${totals.errors} error(es)`
  );
  console.log("");
}

// ── Export ────────────────────────────────────────────────────────────

if (exportFormat && allResults.length > 0) {
  const { exportToPDF, exportToCSV } = await import("./export.js");
  const ts = Date.now();
  const filename = `brand-check-${ts}.${exportFormat === "pdf" ? "pdf" : "csv"}`;

  if (exportFormat === "pdf") {
    await exportToPDF(allResults, filename);
  } else {
    await exportToCSV(allResults, filename);
  }
  console.log(`Exportado a: ${filename}\n`);
}
