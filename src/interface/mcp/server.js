#!/usr/bin/env node
import "../../app/compose.js";
import { installCrashGuard } from "../../infra/crash-guard.js";
import { packageVersion } from "./meta.js";
import { refreshUpdateState } from "./update-state.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { cancelWorkerTool, createWorkerTool, preflightWorkerTool, resumeWorkerTool } from "./tools/dispatch.js";
import { cleanupTool, landWorkerTool, verifyPushTool } from "./tools/deliver.js";
import { factsTool, getArtifactTool, reviewTool } from "./tools/optional.js";
import { askWorkerTool, describeSessionTool, findWorksTool, getWorkerDiffTool, getWorkerTool } from "./tools/read.js";
import { pollWorkersTool, waitWorkersTool } from "./tools/track.js";
import { noteWorkerTool } from "./tools/lead.js";

installCrashGuard("mcp-server");

const server = new McpServer({
  name: "agent-supervisor",
  version: packageVersion
});

refreshUpdateState();

// The order is the order tools/list returns, which is the order a model reads
// them in: the path of a batch from preflight to cleanup.
const TOOLS = [
  preflightWorkerTool, createWorkerTool, resumeWorkerTool, cancelWorkerTool,
  pollWorkersTool, waitWorkersTool,
  getWorkerTool, getWorkerDiffTool, askWorkerTool,
  landWorkerTool, verifyPushTool, cleanupTool,
  findWorksTool, describeSessionTool, noteWorkerTool
];
// The fact ledger, independent review and raw artifacts are rarely needed and
// cost context in every session, so they are opt-in.
const OPTIONAL_TOOLS = [factsTool, reviewTool, getArtifactTool];
const enabled = process.env.AGENT_SUPERVISOR_TOOLS === "all" ? [...TOOLS, ...OPTIONAL_TOOLS] : TOOLS;
for (const tool of enabled) server.registerTool(...tool);

const transport = new StdioServerTransport();
await server.connect(transport);
