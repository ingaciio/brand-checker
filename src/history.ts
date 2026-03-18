import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrandCheckResponse } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = join(__dirname, "..", "data", "history.json");

export interface HistoryEntry {
  id: string;
  timestamp: string;
  name: string;
  description?: string;
  summary: BrandCheckResponse["summary"];
  results: BrandCheckResponse["results"];
  variations: BrandCheckResponse["variations"];
}

async function ensureDir() {
  await mkdir(dirname(HISTORY_FILE), { recursive: true });
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const data = await readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveToHistory(
  response: BrandCheckResponse
): Promise<HistoryEntry> {
  await ensureDir();

  const history = await loadHistory();
  const entry: HistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: response.timestamp,
    name: response.name,
    description: response.description,
    summary: response.summary,
    results: response.results,
    variations: response.variations,
  };

  history.unshift(entry); // newest first

  // Keep last 100 entries
  if (history.length > 100) history.length = 100;

  await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
  return entry;
}

export async function clearHistory(): Promise<void> {
  await ensureDir();
  await writeFile(HISTORY_FILE, "[]");
}
