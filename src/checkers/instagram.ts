import { chromium } from "playwright";
import type { CheckResult, VariationGroup } from "../types.js";

/**
 * Check a single username via Instagram's signup attempt endpoint.
 * Uses the internal registration API — if the username is taken,
 * the response includes { errors: { username: [{ code: "username_is_taken" }] } }.
 *
 * Requires a Playwright page with an active session (CSRF token).
 */
async function checkSingleUsername(
  page: import("playwright").Page,
  csrfToken: string,
  username: string
): Promise<CheckResult> {
  const start = Date.now();
  const profileUrl = `https://www.instagram.com/${username}/`;

  try {
    const result: { status: number; body: string } = await page.evaluate(
      async (params) => {
        const fd = new URLSearchParams();
        fd.append("username", params.username);
        fd.append(
          "email",
          "t" + Math.floor(Math.random() * 99999) + "@test.com"
        );
        fd.append("first_name", "");
        fd.append("opt_into_one_tap", "false");

        const res = await fetch("/accounts/web_create_ajax/attempt/", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-CSRFToken": params.csrfToken,
            "X-Requested-With": "XMLHttpRequest",
            "X-Instagram-AJAX": "1",
          },
          body: fd.toString(),
        });
        return { status: res.status, body: await res.text() };
      },
      { username, csrfToken }
    );

    if (result.status !== 200) {
      return {
        platform: "instagram",
        displayName: `@${username}`,
        status: "unknown",
        detail: `HTTP ${result.status}. Verificar manualmente.`,
        url: profileUrl,
        responseTimeMs: Date.now() - start,
      };
    }

    const data = JSON.parse(result.body);

    // Username taken? Instagram uses different codes/messages depending on context
    const isTaken = data.errors?.username?.some(
      (e: { code: string; message: string }) =>
        e.code === "username_is_taken" ||
        e.message?.toLowerCase().includes("already exists") ||
        e.message?.toLowerCase().includes("isn't available")
    );

    if (isTaken) {
      return {
        platform: "instagram",
        displayName: `@${username}`,
        status: "taken",
        detail: `@${username} ya esta tomado`,
        url: profileUrl,
        responseTimeMs: Date.now() - start,
      };
    }

    // Other username error (invalid format, too short, etc.)
    const usernameError = data.errors?.username?.[0];
    if (usernameError) {
      return {
        platform: "instagram",
        displayName: `@${username}`,
        status: "unknown",
        detail: `@${username}: ${usernameError.message}`,
        url: profileUrl,
        responseTimeMs: Date.now() - start,
      };
    }

    // No username error → available
    return {
      platform: "instagram",
      displayName: `@${username}`,
      status: "available",
      detail: `@${username} esta disponible`,
      url: profileUrl,
      responseTimeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      platform: "instagram",
      displayName: `@${username}`,
      status: "error",
      detail: `Error: ${error instanceof Error ? error.message : "Desconocido"}`,
      url: profileUrl,
      responseTimeMs: Date.now() - start,
    };
  }
}

function generateVariations(
  name: string,
  description?: string
): string[] {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const variations = new Set<string>();

  // Base name
  variations.add(base);

  // With suffixes
  variations.add(`${base}.oficial`);
  variations.add(`${base}.ar`);
  variations.add(`${base}.ok`);
  variations.add(`${base}ok`);
  variations.add(`${base}_`);

  // With dot splits (try splitting at vowel boundaries)
  for (let i = 2; i < base.length - 1; i++) {
    variations.add(`${base.slice(0, i)}.${base.slice(i)}`);
  }

  // With underscores
  for (let i = 2; i < base.length - 1; i++) {
    variations.add(`${base.slice(0, i)}_${base.slice(i)}`);
  }

  // Description-based variations
  if (description) {
    const keywords = description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && w.length < 15);

    for (const kw of keywords.slice(0, 3)) {
      variations.add(`${base}.${kw}`);
      variations.add(`${base}${kw}`);
      variations.add(`${kw}${base}`);
    }
  }

  // Remove invalid Instagram usernames (only letters, numbers, periods, underscores)
  // Max 30 chars, can't start/end with period
  // Cap at 12 variations to reduce API calls and rate-limit risk
  return [...variations]
    .filter((v) => {
      if (v.length > 30 || v.length < 2) return false;
      if (!/^[a-z0-9][a-z0-9._]*[a-z0-9]$/.test(v)) return false;
      if (v.includes("..")) return false;
      return true;
    })
    .slice(0, 12);
}

/**
 * Check Instagram username availability using the signup attempt endpoint.
 *
 * Flow:
 * 1. Launch Playwright, navigate to Instagram signup page
 * 2. Extract CSRF token from cookies
 * 3. Use the signup API to check main username + variations
 * 4. Shares a single browser session for all checks (~13 total)
 */
export async function checkInstagram(
  name: string,
  description?: string
): Promise<{ main: CheckResult; variations: VariationGroup }> {
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
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
      locale: "en-US",
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    const page = await context.newPage();

    // Navigate to signup page to establish session & get CSRF token
    await page.goto("https://www.instagram.com/accounts/emailsignup/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for page to set CSRF cookie (event-based, replaces fixed 2s wait)
    await page.waitForFunction(
      () => document.cookie.includes("csrftoken"),
      { timeout: 10000 }
    ).catch(() => {}); // Fall through to check cookies below

    // Extract CSRF token from cookies
    const cookies = await context.cookies();
    const csrfToken = cookies.find((c) => c.name === "csrftoken")?.value;

    if (!csrfToken) {
      throw new Error("No se pudo obtener CSRF token de Instagram");
    }

    // Check the main name
    const main = await checkSingleUsername(page, csrfToken, normalizedName);

    // Generate and check variations
    const allVariations = generateVariations(normalizedName, description);
    const variationNames = allVariations.filter((v) => v !== normalizedName);

    // Check variations in batches of 5 with small delays
    const variationResults: CheckResult[] = [];
    for (let i = 0; i < variationNames.length; i += 5) {
      const batch = variationNames.slice(i, i + 5);
      const results = await Promise.all(
        batch.map((v) => checkSingleUsername(page, csrfToken, v))
      );
      variationResults.push(...results);

      if (i + 5 < variationNames.length) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    await browser.close();
    browser = undefined;

    return {
      main,
      variations: {
        platform: "instagram-variations",
        displayName: "Instagram (variaciones)",
        checks: variationResults,
      },
    };
  } catch (error) {
    // If setup fails (no CSRF token, browser error, etc.) return error for main
    const errorResult: CheckResult = {
      platform: "instagram",
      displayName: `@${normalizedName}`,
      status: "error",
      detail: `Error: ${error instanceof Error ? error.message : "Desconocido"}`,
      url: `https://www.instagram.com/${normalizedName}/`,
      responseTimeMs: 0,
    };

    return {
      main: errorResult,
      variations: {
        platform: "instagram-variations",
        displayName: "Instagram (variaciones)",
        checks: [],
      },
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
