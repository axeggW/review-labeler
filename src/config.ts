import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CHANGE_TYPES, type ReviewLabelConfig, type ReviewLabelDefinition, type ReviewLabelRule } from "./types.js";

export const DEFAULT_CONFIG_FILE = "review-labels.json";

const changeTypes = new Set<string>(CHANGE_TYPES);

export async function loadReviewLabelConfig(configPath = DEFAULT_CONFIG_FILE): Promise<ReviewLabelConfig> {
  const fullPath = resolve(configPath);
  const contents = await readFile(fullPath, "utf8");
  return parseReviewLabelConfig(contents, fullPath);
}

export function parseReviewLabelConfig(json: string, source = "review-labels.json"): ReviewLabelConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${source}: ${message}`);
  }

  validateReviewLabelConfig(parsed, source);
  return parsed;
}

export function validateReviewLabelConfig(value: unknown, source = "review-labels.json"): asserts value is ReviewLabelConfig {
  if (!isRecord(value)) {
    throw new Error(`${source} must be a JSON object.`);
  }

  if (!Array.isArray(value.labels)) {
    throw new Error(`${source} must contain a labels array.`);
  }

  const ids = new Set<string>();
  value.labels.forEach((label, index) => {
    validateLabel(label, `${source}.labels[${index}]`);
    if (ids.has(label.id)) {
      throw new Error(`${source} contains duplicate label id "${label.id}".`);
    }
    ids.add(label.id);
  });
}

function validateLabel(value: unknown, path: string): asserts value is ReviewLabelDefinition {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object.`);
  }

  validateNonEmptyString(value.id, `${path}.id`);
  validateNonEmptyString(value.name, `${path}.name`);
  validateOptionalString(value.description, `${path}.description`);
  validateOptionalString(value.color, `${path}.color`);

  if (!Array.isArray(value.rules) || value.rules.length === 0) {
    throw new Error(`${path}.rules must be a non-empty array.`);
  }

  value.rules.forEach((rule, index) => validateRule(rule, `${path}.rules[${index}]`));
}

function validateRule(value: unknown, path: string): asserts value is ReviewLabelRule {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object.`);
  }

  validateOptionalStringArray(value.paths, `${path}.paths`);
  validateOptionalStringArray(value.excludePaths, `${path}.excludePaths`);

  if (value.changeTypes !== undefined) {
    if (!Array.isArray(value.changeTypes)) {
      throw new Error(`${path}.changeTypes must be an array when provided.`);
    }

    value.changeTypes.forEach((changeType, index) => {
      if (typeof changeType !== "string" || !changeTypes.has(changeType)) {
        throw new Error(`${path}.changeTypes[${index}] must be one of: ${CHANGE_TYPES.join(", ")}.`);
      }
    });
  }
}

function validateNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
}

function validateOptionalString(value: unknown, path: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${path} must be a string when provided.`);
  }
}

function validateOptionalStringArray(value: unknown, path: string): asserts value is string[] | undefined {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array when provided.`);
  }

  value.forEach((item, index) => validateNonEmptyString(item, `${path}[${index}]`));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
