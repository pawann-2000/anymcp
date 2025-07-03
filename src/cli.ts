import { MCPMetaServer } from './index.js';
import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';

interface CLIOptions {
  config?: string;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  disableDedup: boolean;
  simThreshold?: number;
  autoMerge?: boolean;
}

async function loadConfigFromPath(configPath: string): Promise<any> {
  const stat = await fs.stat(configPath);
  if (stat.isFile()) {
    const content = await fs.readFile(configPath, 'utf8');
    return JSON.parse(content);
  }
  if (stat.isDirectory()) {
    // Read all *.mcp.json files in directory
    const files = await fs.readdir(configPath);
    const configs = [];
    for (const file of files) {
      if (file.endsWith('.mcp.json')) {
        const full = path.join(configPath, file);
        const content = await fs.readFile(full, 'utf8');
        configs.push(JSON.parse(content));
      }
    }
    return configs;
  }
  throw new Error(`Unsupported config path: ${configPath}`);
}

async function main() {
  const program = new Command();
  program
    .name('mcp-meta-server')
    .description('MCP Meta-Server – Intelligent orchestration layer for Model Context Protocol servers')
    .option('-c, --config <path>', 'Path to a JSON file (or directory containing *.mcp.json files) with MCP server configurations')
    .option('-l, --log-level <level>', 'Log level (error, warn, info, debug)', 'info')
    .option('--disable-dedup', 'Disable tool deduplication')
    .option('--sim-threshold <number>', 'Similarity threshold for tool deduplication (0-1)', (v: string) => parseFloat(v))
    .option('--auto-merge', 'Automatically merge similar tools when deduplication is enabled')
    .version('1.0.0');

  program.parse(process.argv);
  if (program.args.length === 0 && (process.argv.includes('-h') || process.argv.includes('--help') || process.argv.includes('-V') || process.argv.includes('--version'))) {
    // Commander already output help/version and will exit, prevent further execution
    return;
  }
  const opts = program.opts<CLIOptions>();

  // Prepare environment for discovery if user supplied config
  if (opts.config) {
    try {
      const loaded = await loadConfigFromPath(opts.config);
      process.env.MCP_SERVER_CONFIG = JSON.stringify(loaded);
    } catch (err) {
      console.error('[CLI] Failed to load config:', err);
      process.exit(1);
    }
  }

  // Instantiate server
  const server = new MCPMetaServer();

  // Deduplication tweaks via reflection (we expose runtime method on globalThis)
  // To avoid modifying MCPMetaServer internals, we rely on configure_deduplication tool after start
  // But we can do it before start if we add method; for now we simply call tool after start.

  await server.start();

  // Apply dedup settings if provided
  if (opts.disableDedup || typeof opts.simThreshold === 'number' || opts.autoMerge !== undefined) {
    try {
      await server['handleConfigureDeduplication']({
        enabled: !opts.disableDedup,
        similarityThreshold: opts.simThreshold,
        autoMerge: opts.autoMerge
      });
    } catch (e) {
      console.error('[CLI] Failed to apply deduplication config:', e);
    }
  }

  console.error('MCP Meta-Server is up and running. Press Ctrl+C to stop.');

  // Keep process alive
  process.stdin.resume();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});