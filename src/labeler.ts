import { matchesAnyPath, normalizePath } from "./matcher.js";
import { CHANGE_TYPES, type ChangedFile, type ChangeType, type LabelChangedFilesResult, type ReviewLabelConfig, type ReviewLabelDefinition, type ReviewLabelRule } from "./types.js";

const changeTypes = new Set<string>(CHANGE_TYPES);

export function labelChangedFiles(config: ReviewLabelConfig, files: readonly (ChangedFile | string)[]): LabelChangedFilesResult {
  const normalizedFiles = files.map(normalizeChangedFile);
  const labels = config.labels
    .map((label) => matchLabel(label, normalizedFiles))
    .filter((label) => label.files.length > 0);

  const labelIdsByFile = new Map<string, string[]>();
  for (const label of labels) {
    for (const file of label.files) {
      const labelIds = labelIdsByFile.get(file) ?? [];
      labelIds.push(label.id);
      labelIdsByFile.set(file, labelIds);
    }
  }

  return {
    labels,
    files: normalizedFiles.map((file) => ({
      path: file.path,
      changeType: file.changeType ?? "unknown",
      labels: labelIdsByFile.get(file.path) ?? [],
    })),
  };
}

function matchLabel(label: ReviewLabelDefinition, files: readonly ChangedFile[]) {
  const matchedFiles = new Set<string>();

  for (const file of files) {
    if (label.rules.some((rule) => matchesRule(rule, file))) {
      matchedFiles.add(file.path);
    }
  }

  return {
    id: label.id,
    name: label.name,
    description: label.description,
    color: label.color,
    files: [...matchedFiles],
  };
}

function matchesRule(rule: ReviewLabelRule, file: ChangedFile): boolean {
  const changeType = file.changeType ?? "unknown";
  const matchesChangeType = !rule.changeTypes || rule.changeTypes.includes(changeType);
  const matchesPath = matchesAnyPath(rule.paths, file.path);
  const isExcluded = Boolean(rule.excludePaths?.length) && matchesAnyPath(rule.excludePaths, file.path);

  return matchesChangeType && matchesPath && !isExcluded;
}

export function normalizeChangedFile(file: ChangedFile | string): ChangedFile {
  if (typeof file === "string") {
    return { path: normalizePath(file), changeType: "unknown" };
  }

  if (!file || typeof file.path !== "string" || file.path.trim().length === 0) {
    throw new Error("Each changed file must be a path string or an object with a non-empty path.");
  }

  const changeType = normalizeChangeType(file.changeType);
  return {
    path: normalizePath(file.path),
    changeType,
  };
}

function normalizeChangeType(changeType: ChangeType | undefined): ChangeType {
  if (changeType === undefined) {
    return "unknown";
  }

  if (!changeTypes.has(changeType)) {
    throw new Error(`Unsupported change type "${changeType}". Expected one of: ${CHANGE_TYPES.join(", ")}.`);
  }

  return changeType;
}
