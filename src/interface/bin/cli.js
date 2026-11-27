#!/usr/bin/env node
import "../../app/compose.js";
import { readFile } from "node:fs/promises";
import { TOOLS, OPTIONAL_TOOLS } from "../mcp/tools/index.js";

const tools = [...TOOLS, ...OPTIONAL_TOOLS];
const usage = "Usage: agent-supervisor <tool> [--args '<json>' | --args-file <path>]";

function invalidArguments(message) {
  console.log(JSON.stringify({ error: "invalid_arguments", message }));
  return 2;
}

async function main([name, ...options]) {
  if (name === undefined || (name === "--help" && options.length === 0)) {
    console.log(usage);
    for (const [tool, { description }] of tools) console.log(`\n${tool}: ${description}`);
    return 0;
  }

  const tool = tools.find(([toolName]) => toolName === name);
  if (!tool) {
    console.log(JSON.stringify({ error: "unknown_tool" }));
    return 2;
  }
  const [, { description, inputSchema }, handler] = tool;
  const [flag, value] = options;
  if (flag === "--help" && options.length === 1) {
    const keys = Object.keys(inputSchema.shape);
    console.log(`${name}: ${description}\nArguments: ${keys.length ? keys.join(", ") : "(none)"}`);
    return 0;
  }

  let args = {};
  if (options.length > 0) {
    if (options.length !== 2 || (flag !== "--args" && flag !== "--args-file")) {
      return invalidArguments(usage);
    }
    try {
      const json = flag === "--args-file" ? await readFile(value, "utf8") : value;
      args = JSON.parse(json);
    } catch (error) {
      return invalidArguments(error.message);
    }
  }
  const parsed = inputSchema.safeParse(args);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return invalidArguments(`${issue.path.join(".") || "arguments"}: ${issue.message}`);
  }

  const result = await handler(parsed.data, {});
  process.stdout.write(`${result.content[0].text}\n`);
  return result.isError ? 1 : 0;
}

process.exitCode = await main(process.argv.slice(2));
