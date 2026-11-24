import type { Asset } from "./types";
import type { CutAnalysis } from "./reference-cut-analysis";

export type ReferenceTiming = {
  durationSeconds: number;
  cutTimes: number[];
  frameTimes: number[];
  cutDetection?: "measured" | "failed";
};

export type AttachmentContent = {
  kind: "image" | "video" | "document" | "link";
  name: string;
  text: string;
  asset?: Asset;
  frames?: Asset[];
  analysisSheets?: Asset[];
  cutAnalysis?: CutAnalysis;
  referenceTiming?: ReferenceTiming;
  detail: string;
  url?: string;
};
export type AttachmentRecord = AttachmentContent & {
  id: string;
  projectId: string;
  createdAt: string;
};
export type AttachmentSummary = Pick<
  AttachmentRecord,
  "id" | "kind" | "name" | "detail" | "url"
>;
