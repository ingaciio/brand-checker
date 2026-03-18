import { checkInstagram } from "./checkers/instagram.js";
import { checkINPI } from "./checkers/inpi.js";
import { checkWIPO } from "./checkers/wipo.js";
import { checkDomains } from "./checkers/domains.js";
import { saveToHistory } from "./history.js";
import type {
  BrandCheckRequest,
  BrandCheckResponse,
  CheckResult,
  VariationGroup,
} from "./types.js";

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]/g, "");
}

export async function checkBrandAvailability(
  request: BrandCheckRequest
): Promise<BrandCheckResponse> {
  const normalizedName = normalizeName(request.name);

  if (!normalizedName || normalizedName.length < 2) {
    throw new Error("El nombre debe tener al menos 2 caracteres validos");
  }

  // Run all primary checks in parallel
  const [instagramResult, inpiResult, wipoResult, domainResults] =
    await Promise.all([
      checkInstagram(normalizedName, request.description),
      checkINPI(request.name, request.description),
      checkWIPO(request.name, request.description),
      checkDomains(normalizedName),
    ]);

  const results: CheckResult[] = [
    instagramResult.main,
    inpiResult,
    wipoResult,
    domainResults,
  ];

  const variations: VariationGroup[] = [instagramResult.variations];

  const allChecks = [
    ...results,
    ...instagramResult.variations.checks,
  ];
  const summary = {
    total: allChecks.length,
    available: allChecks.filter((r) => r.status === "available").length,
    taken: allChecks.filter((r) => r.status === "taken").length,
    errors: allChecks.filter((r) => r.status === "error").length,
    unknown: allChecks.filter((r) => r.status === "unknown").length,
  };

  const response: BrandCheckResponse = {
    name: request.name,
    normalizedName,
    description: request.description,
    timestamp: new Date().toISOString(),
    results,
    variations,
    summary,
  };

  // Save to history
  await saveToHistory(response).catch(() => {});

  return response;
}
