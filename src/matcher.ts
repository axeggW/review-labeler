const REGEXP_SPECIAL_CHARS = /[\\^$+?.()|[\]{}]/g;

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
}

export function matchesAnyPath(patterns: readonly string[] | undefined, path: string): boolean {
  if (!patterns || patterns.length === 0) {
    return true;
  }

  const normalizedPath = normalizePath(path);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalizedPath));
}

const regexpCache = new Map<string, RegExp>();

export function globToRegExp(pattern: string): RegExp {
  const normalizedPattern = normalizePath(pattern);
  const cached = regexpCache.get(normalizedPattern);
  if (cached) {
    return cached;
  }

  let source = "^";
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const char = normalizedPattern[index];
    const next = normalizedPattern[index + 1];

    if (char === "*" && next === "*") {
      const afterGlobstar = normalizedPattern[index + 2];
      if (afterGlobstar === "/") {
        source += "(?:.*\\/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += char.replace(REGEXP_SPECIAL_CHARS, "\\$&");
  }

  source += "$";
  const regexp = new RegExp(source);
  regexpCache.set(normalizedPattern, regexp);
  return regexp;
}
