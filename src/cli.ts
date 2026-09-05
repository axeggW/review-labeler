#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { stdin, stdout, stderr } from "node:process";
import { findReviewCodeChunks } from "./code-chunks.js";
import { DEFAULT_CONFIG_FILE, loadReviewLabelConfig } from "./config.js";
import { labelChangedFiles } from "./labeler.js";
import type { ChangedFile } from "./types.js";

interface CliOptions {
  configPath: string;
  changedFilesJson?: string;
  changedFilesPath?: string;
  markedSourcePaths: string[];
  pretty: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    stdout.write(helpText());
    return;
  }

  const config = await loadReviewLabelConfig(options.configPath);
  const changedFiles = parseChangedFilesJson(await readChangedFilesInput(options));
  const result = labelChangedFiles(config, changedFiles);
  const codeChunks = await readMarkedSourceFiles(options.markedSourcePaths);
  if (codeChunks.length > 0) {
    result.codeChunks = codeChunks;
  }
  stdout.write(`${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`);
}

function parseArgs(args: string[]): CliOptions & { help: boolean } {
  const options: CliOptions & { help: boolean } = {
    configPath: DEFAULT_CONFIG_FILE,
    markedSourcePaths: [],
    pretty: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--pretty") {
      options.pretty = true;
      continue;
    }

    if (arg === "--config") {
      options.configPath = readOptionValue(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--changed-files") {
      options.changedFilesJson = readOptionValue(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--changed-files-file") {
      options.changedFilesPath = readOptionValue(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--marked-source") {
      options.markedSourcePaths.push(readOptionValue(arg, next));
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (options.changedFilesJson && options.changedFilesPath) {
    throw new Error("Use only one of --changed-files or --changed-files-file.");
  }

  return options;
}

function readOptionValue(option: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }

  return value;
}

async function readChangedFilesInput(options: CliOptions): Promise<string> {
  if (options.changedFilesJson) {
    return options.changedFilesJson;
  }

  if (options.changedFilesPath) {
    return readFile(options.changedFilesPath, "utf8");
  }

  if (options.markedSourcePaths.length > 0) {
    return "[]";
  }

  return readStdin();
}

async function readMarkedSourceFiles(paths: readonly string[]) {
  const chunks = await Promise.all(
    paths.map(async (filePath) => findReviewCodeChunks(filePath, await readFile(filePath, "utf8")))
  );
  return chunks.flat();
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseChangedFilesJson(json: string): Array<ChangedFile | string> {
  const trimmed = json.trim();
  if (!trimmed) {
    throw new Error("Changed files JSON is required via --changed-files, --changed-files-file, or stdin.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse changed files JSON: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Changed files JSON must be an array.");
  }

  return parsed as Array<ChangedFile | string>;
}

function helpText(): string {
  return `review-labeler

Usage:
  review-labeler --config review-labels.json --changed-files '["README.md"]'
  review-labeler --marked-source src/app.ts --pretty
  review-labeler --changed-files-file changed-files.json
  cat changed-files.json | review-labeler

Options:
  --config <path>              Config file path. Defaults to review-labels.json.
  --changed-files <json>       JSON array of paths or changed-file objects.
  --changed-files-file <path>  File containing changed-files JSON.
  --marked-source <path>       Scan a source file for review-labeler comments. Repeatable.
  --pretty                     Pretty-print JSON output.
  -h, --help                   Show this help.
`;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  stderr.write(`review-labeler: ${message}\n`);
  process.exitCode = 1;
});
