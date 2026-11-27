import { cancelWorkerTool, createWorkerTool, preflightWorkerTool, resumeWorkerTool } from "./dispatch.js";
import { cleanupTool, landWorkerTool, verifyPushTool } from "./deliver.js";
import { factsTool, getArtifactTool, reviewTool } from "./optional.js";
import { askWorkerTool, describeSessionTool, findWorksTool, getWorkerDiffTool, getWorkerTool } from "./read.js";
import { pollWorkersTool, waitWorkersTool } from "./track.js";
import { noteWorkerTool } from "./lead.js";

// The order tools/list returns: the path of a batch from preflight to cleanup.
export const TOOLS = [
  preflightWorkerTool, createWorkerTool, resumeWorkerTool, cancelWorkerTool,
  pollWorkersTool, waitWorkersTool,
  getWorkerTool, getWorkerDiffTool, askWorkerTool,
  landWorkerTool, verifyPushTool, cleanupTool,
  findWorksTool, describeSessionTool, noteWorkerTool
];

// These tools are opt-in over MCP to save context in most sessions.
export const OPTIONAL_TOOLS = [factsTool, reviewTool, getArtifactTool];
