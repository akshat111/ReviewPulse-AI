import type { Theme, MemoryHit, ThemeHistory } from "../models.js";

export function compareThemes(currentThemes: Theme[], recalledMemories: MemoryHit[]): ThemeHistory {
  const result: ThemeHistory = { persisting: [], new: [], faded: [] };

  if (!recalledMemories || recalledMemories.length === 0) {
    result.new = currentThemes.map((t) => t.name);
    return result;
  }

  const priorThemes: { name: string; week: string }[] = [];
  for (const mem of recalledMemories) {
    const meta = mem.metadata;
    if (meta?.themes && Array.isArray(meta.themes)) {
      const week = (meta.week as string) || "";
      for (const name of meta.themes as string[]) {
        priorThemes.push({ name: normalize(name), week });
      }
    }
  }

  if (priorThemes.length === 0) {
    result.new = currentThemes.map((t) => t.name);
    return result;
  }

  const currentNormalized = currentThemes.map((t) => normalize(t.name));
  const matched = new Set<number>();

  for (let i = 0; i < currentNormalized.length; i++) {
    let bestMatchIdx = -1;
    let bestSimilarity = -1;

    for (let j = 0; j < priorThemes.length; j++) {
      if (matched.has(j)) continue;
      const sim = jaroWinkler(currentNormalized[i], priorThemes[j].name);
      if (sim >= 0.82 && sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatchIdx = j;
      }
    }

    if (bestMatchIdx !== -1) {
      matched.add(bestMatchIdx);
      result.persisting.push([currentThemes[i].name, priorThemes[bestMatchIdx].week]);
    } else {
      result.new.push(currentThemes[i].name);
    }
  }

  for (let i = 0; i < priorThemes.length; i++) {
    if (!matched.has(i)) {
      result.faded.push([priorThemes[i].name, priorThemes[i].week]);
    }
  }

  return result;
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;

  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0 || len2 === 0) return 0.0;

  const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);

  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);

  let m = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(len2 - 1, i + matchWindow);

    for (let j = start; j <= end; j++) {
      if (!matches2[j] && s1[i] === s2[j]) {
        matches1[i] = true;
        matches2[j] = true;
        m++;
        break;
      }
    }
  }

  if (m === 0) return 0.0;

  let k = 0;
  let t = 0;
  for (let i = 0; i < len1; i++) {
    if (matches1[i]) {
      while (!matches2[k]) {
        k++;
      }
      if (s1[i] !== s2[k]) {
        t++;
      }
      k++;
    }
  }

  t = t / 2;

  const jaro = (m / len1 + m / len2 + (m - t) / m) / 3;

  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(len1, len2));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  const p = 0.1;
  return jaro + prefix * p * (1 - jaro);
}
