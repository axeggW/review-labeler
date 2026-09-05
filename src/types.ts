export const CHANGE_TYPES = [
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "typechanged",
  "unknown",
] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

export interface ChangedFile {
  path: string;
  changeType?: ChangeType;
}

export interface ReviewLabelRule {
  paths?: string[];
  excludePaths?: string[];
  changeTypes?: ChangeType[];
}

export interface ReviewLabelDefinition {
  id: string;
  name: string;
  description?: string;
  color?: string;
  rules: ReviewLabelRule[];
}

export interface ReviewLabelConfig {
  labels: ReviewLabelDefinition[];
}

export interface MatchedLabel {
  id: string;
  name: string;
  description?: string;
  color?: string;
  files: string[];
}

export interface LabeledFile {
  path: string;
  changeType: ChangeType;
  labels: string[];
}

export type ReviewCodeChunkScope = "file" | "function" | "lines";

export interface ReviewCodeChunkMarker {
  startLine: number;
  endLine: number;
  raw: string;
}

export interface ReviewCodeChunk {
  filePath: string;
  labels: string[];
  scope: ReviewCodeChunkScope;
  startLine: number;
  endLine: number;
  symbolName?: string;
  marker: ReviewCodeChunkMarker;
}

export interface LabelChangedFilesResult {
  labels: MatchedLabel[];
  files: LabeledFile[];
  codeChunks?: ReviewCodeChunk[];
}
