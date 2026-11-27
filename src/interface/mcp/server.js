#!/usr/bin/env node
import "../../app/compose.js";
import { installCrashGuard } from "../../infra/crash-guard.js";
import { packageVersion } from "./meta.js";
import { refreshUpdateState } from "./update-state.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TOOLS, OPTIONAL_TOOLS } from "./tools/index.js";

installCrashGuard("mcp-server");

const server = new McpServer({
  name: "agent-supervisor",
  version: packageVersion
});

refreshUpdateState();

const enabled = process.env.AGENT_SUPERVISOR_TOOLS === "all" ? [...TOOLS, ...OPTIONAL_TOOLS] : TOOLS;
for (const tool of enabled) server.registerTool(...tool);

const transport = new StdioServerTransport();
await server.connect(transport);
