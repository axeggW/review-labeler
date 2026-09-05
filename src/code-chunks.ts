import { normalizePath } from "./matcher.js";
import type { ReviewCodeChunk, ReviewCodeChunkScope } from "./types.js";

const markerPattern = /\b(?:review-labeler|review-label|pr-review)\s*:\s*(.+)$/i;
const targetWords = new Set(["file", "function", "func", "line", "lines"]);

export function findReviewCodeChunks(filePath: string, source: string): ReviewCodeChunk[] {
  const normalizedPath = normalizePath(filePath);
  const lines = source.replace(/\r?\n$/, "").split(/\r?\n/);
  const markers = findMarkers(lines);

  return markers.map((marker) => {
    const directive = parseMarkerDirective(marker.body);
    const range = resolveRange(lines, marker.endLine, directive.scope, directive.value);

    return {
      filePath: normalizedPath,
      labels: directive.labels,
      scope: directive.scope,
      startLine: range.startLine,
      endLine: range.endLine,
      symbolName: range.symbolName,
      marker: {
        startLine: marker.startLine,
        endLine: marker.endLine,
        raw: marker.raw,
      },
    };
  });
}

interface Marker {
  startLine: number;
  endLine: number;
  raw: string;
  body: string;
}

interface ParsedDirective {
  labels: string[];
  scope: ReviewCodeChunkScope;
  value: string | number | null;
}

interface ResolvedRange {
  startLine: number;
  endLine: number;
  symbolName?: string;
}

function findMarkers(lines: readonly string[]): Marker[] {
  const markers: Marker[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const singleLineBody = extractSingleLineMarker(line);
    if (singleLineBody) {
      markers.push({
        startLine: index + 1,
        endLine: index + 1,
        raw: line.trim(),
        body: singleLineBody,
      });
      continue;
    }

    const blockStart = line.indexOf("/*");
    if (blockStart === -1) continue;

    let raw = line.slice(blockStart);
    let endIndex = index;
    while (endIndex < lines.length && !raw.includes("*/")) {
      endIndex += 1;
      if (endIndex < lines.length) raw += `\n${lines[endIndex]}`;
    }

    const blockBody = raw.replace(/^\/\*/, "").replace(/\*\/[\s\S]*$/, "");
    const match = blockBody.match(markerPattern);
    if (match?.[1]) {
      markers.push({
        startLine: index + 1,
        endLine: endIndex + 1,
        raw: raw.trim(),
        body: match[1].trim(),
      });
    }

    index = endIndex;
  }

  return markers;
}

function extractSingleLineMarker(line: string): string | null {
  const commentStart = ["//", "#", "--"].map((token) => line.indexOf(token)).filter((index) => index >= 0).sort((a, b) => a - b)[0];
  if (commentStart === undefined) return null;

  const comment = line.slice(commentStart).replace(/^(\/\/|#|--)\s*/, "");
  const match = comment.match(markerPattern);
  return match?.[1]?.trim() ?? null;
}

function parseMarkerDirective(body: string): ParsedDirective {
  const tokens = body.trim().split(/\s+/).filter(Boolean);
  const targetIndex = tokens.findIndex((token) => targetWords.has(token.toLowerCase()));
  const labelTokens = targetIndex === -1 ? tokens : tokens.slice(0, targetIndex);
  const labels = labelTokens
    .join(" ")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

  if (labels.length === 0) {
    throw new Error(`Review code chunk marker "${body}" must include at least one label.`);
  }

  if (targetIndex === -1) {
    return { labels, scope: "file", value: null };
  }

  const target = tokens[targetIndex].toLowerCase();
  const targetValue = tokens[targetIndex + 1] ?? null;

  if (target === "function" || target === "func") {
    return { labels, scope: "function", value: targetValue };
  }

  if (target === "line" || target === "lines") {
    const count = Number(targetValue);
    if (!Number.isInteger(count) || count < 1) {
      throw new Error(`Review code chunk marker "${body}" must use a positive line count.`);
    }
    return { labels, scope: "lines", value: count };
  }

  return { labels, scope: "file", value: null };
}

function resolveRange(lines: readonly string[], markerEndLine: number, scope: ReviewCodeChunkScope, value: string | number | null): ResolvedRange {
  if (scope === "file") {
    return { startLine: 1, endLine: Math.max(lines.length, 1) };
  }

  const firstCodeLine = Math.min(markerEndLine + 1, Math.max(lines.length, 1));
  if (scope === "lines") {
    const count = typeof value === "number" ? value : 1;
    return {
      startLine: firstCodeLine,
      endLine: Math.min(lines.length, firstCodeLine + count - 1),
    };
  }

  return resolveFunctionRange(lines, firstCodeLine, typeof value === "string" ? value : null);
}

function resolveFunctionRange(lines: readonly string[], firstSearchLine: number, symbolName: string | null): ResolvedRange {
  const functionLineIndex = findFunctionLine(lines, firstSearchLine - 1, symbolName);
  if (functionLineIndex === -1) {
    return { startLine: firstSearchLine, endLine: firstSearchLine };
  }

  const endLine = findBlockEndLine(lines, functionLineIndex);
  return {
    startLine: functionLineIndex + 1,
    endLine,
    symbolName: symbolName ?? inferFunctionName(lines[functionLineIndex]),
  };
}

function findFunctionLine(lines: readonly string[], startIndex: number, symbolName: string | null): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (!looksLikeFunctionStart(line)) continue;
    if (symbolName && !line.includes(symbolName)) continue;
    return index;
  }

  return -1;
}

function looksLikeFunctionStart(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) return false;

  return (
    /\b(function|def|class)\s+[$A-Z_a-z][$\w]*/.test(trimmed) ||
    /(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/.test(trimmed) ||
    /(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*=\s*(?:async\s*)?function\b/.test(trimmed) ||
    /^[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/.test(trimmed)
  );
}

function inferFunctionName(line: string): string | undefined {
  const patterns = [
    /\b(?:function|def|class)\s+([$A-Z_a-z][$\w]*)/,
    /(?:const|let|var)\s+([$A-Z_a-z][$\w]*)\s*=/,
    /^([A-Za-z_$][\w$]*)\s*\(/,
  ];

  for (const pattern of patterns) {
    const match = line.trim().match(pattern);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

function findBlockEndLine(lines: readonly string[], startIndex: number): number {
  const startLine = lines[startIndex];
  const startIndent = startLine.match(/^\s*/)?.[0].length ?? 0;
  let braceDepth = 0;
  let sawBrace = false;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    for (const char of line) {
      if (char === "{") {
        braceDepth += 1;
        sawBrace = true;
      } else if (char === "}") {
        braceDepth -= 1;
      }
    }

    if (sawBrace && braceDepth <= 0) {
      return index + 1;
    }

    if (!sawBrace && index > startIndex && line.trim().length > 0) {
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent <= startIndent) return index;
    }
  }

  return lines.length;
}
