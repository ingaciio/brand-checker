import type { CheckResult } from "../types.js";

interface DomainConfig {
  extension: string;
  rdapUrl: string;
  displayName: string;
}

const DOMAIN_CONFIGS: DomainConfig[] = [
  {
    extension: ".com",
    rdapUrl: "https://rdap.verisign.com/com/v1/domain",
    displayName: ".com",
  },
  {
    extension: ".com.ar",
    rdapUrl: "https://rdap.nic.ar/domain",
    displayName: ".com.ar",
  },
  {
    extension: ".ar",
    rdapUrl: "https://rdap.nic.ar/domain",
    displayName: ".ar",
  },
];

// Known domain parking / marketplace registrars
const PARKING_INDICATORS = [
  "godaddy",
  "afternic",
  "sedo",
  "dan.com",
  "hugedomains",
  "bodis",
  "parkingcrew",
  "domainmarket",
  "undeveloped",
  "buy this domain",
  "domain is for sale",
  "this domain",
  "make an offer",
  "purchase this domain",
  "comprar este dominio",
  "dominio en venta",
];

const BUY_PLATFORMS: Record<string, string> = {
  godaddy: "https://www.godaddy.com/domainsearch/find?domainToCheck=",
  afternic: "https://www.afternic.com/domain/",
  sedo: "https://sedo.com/search/?keyword=",
  "dan.com": "https://dan.com/buy-domain/",
  hugedomains: "https://www.hugedomains.com/domain_search.cfm?domain_name=",
};

async function checkIfForSale(
  fullDomain: string
): Promise<string | undefined> {
  try {
    const res = await fetch(`https://${fullDomain}`, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
    });

    const body = await res.text();
    const bodyLower = body.toLowerCase();
    const finalUrl = res.url.toLowerCase();

    // Check the final URL and body for parking indicators
    for (const [platform, buyBase] of Object.entries(BUY_PLATFORMS)) {
      if (finalUrl.includes(platform) || bodyLower.includes(platform)) {
        return `${buyBase}${fullDomain}`;
      }
    }

    // Generic sale indicators
    for (const indicator of PARKING_INDICATORS) {
      if (bodyLower.includes(indicator)) {
        return `https://www.godaddy.com/domainsearch/find?domainToCheck=${fullDomain}`;
      }
    }
  } catch {
    // Domain might not have a web server - that's fine
  }

  return undefined;
}

async function checkSingleDomain(
  name: string,
  config: DomainConfig
): Promise<CheckResult> {
  const start = Date.now();
  const fullDomain = `${name}${config.extension}`;
  const rdapUrl = `${config.rdapUrl}/${fullDomain}`;
  const whoisUrl = `https://who.is/whois/${fullDomain}`;

  try {
    const response = await fetch(rdapUrl, {
      method: "GET",
      headers: { Accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 200) {
      // Domain is taken - check if it's for sale
      const buyUrl = await checkIfForSale(fullDomain);

      return {
        platform: `domain-${config.extension}`,
        displayName: config.displayName,
        status: "taken",
        detail: buyUrl
          ? `${fullDomain} registrado - posible compra disponible`
          : `${fullDomain} esta registrado`,
        url: whoisUrl,
        buyUrl,
        responseTimeMs: Date.now() - start,
      };
    }

    if (response.status === 404) {
      return {
        platform: `domain-${config.extension}`,
        displayName: config.displayName,
        status: "available",
        detail: `${fullDomain} esta disponible`,
        url: whoisUrl,
        responseTimeMs: Date.now() - start,
      };
    }

    return {
      platform: `domain-${config.extension}`,
      displayName: config.displayName,
      status: "unknown",
      detail: `RDAP respondio HTTP ${response.status}`,
      url: whoisUrl,
      responseTimeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      platform: `domain-${config.extension}`,
      displayName: config.displayName,
      status: "error",
      detail: `Error: ${error instanceof Error ? error.message : "Desconocido"}`,
      url: whoisUrl,
      responseTimeMs: Date.now() - start,
    };
  }
}

export async function checkDomains(name: string): Promise<CheckResult> {
  const start = Date.now();
  const results = await Promise.all(
    DOMAIN_CONFIGS.map((config) => checkSingleDomain(name, config))
  );

  const lines: string[] = [];
  let anyTaken = false;
  let anyError = false;
  let buyUrl: string | undefined;

  for (const r of results) {
    const icon =
      r.status === "available" ? "✅" : r.status === "taken" ? "❌" : "⚠️";
    lines.push(`${icon} ${r.detail}`);
    if (r.status === "taken") anyTaken = true;
    if (r.status === "error" || r.status === "unknown") anyError = true;
    if (r.buyUrl && !buyUrl) buyUrl = r.buyUrl;
  }

  const status = anyTaken ? "taken" : anyError ? "unknown" : "available";

  return {
    platform: "domains",
    displayName: "Dominios",
    status,
    detail: lines.join("\n"),
    url: `https://who.is/whois/${name}.com`,
    buyUrl,
    responseTimeMs: Date.now() - start,
  };
}
