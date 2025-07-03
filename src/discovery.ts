
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface MCPServerConfiguration {
  id: string;
  name: string;
  command: string[];
  description?: string;
}

export class MCPDiscoverySystem {
  public async discoverServers(): Promise<MCPServerConfiguration[]> {
    const configs: MCPServerConfiguration[] = [];
    const discoveredPaths = new Set<string>();

    // Discover from environment variables
    if (process.env.MCP_SERVER_CONFIG) {
      try {
        const fromEnv = JSON.parse(process.env.MCP_SERVER_CONFIG);
        if (Array.isArray(fromEnv)) {
          for (const config of fromEnv) {
            if (this.isValidConfig(config)) {
              configs.push(config);
            }
          }
        }
      } catch (error) {
        console.error('Failed to parse MCP_SERVER_CONFIG environment variable:', error);
      }
    }

    // Discover from file system
    const searchPaths = this.getPlatformSearchPaths();
    for (const searchPath of searchPaths) {
      try {
        const files = await fs.readdir(searchPath);
        for (const file of files) {
          if (file.endsWith('.mcp.json') || file === 'mcp-config.json') {
            const fullPath = path.join(searchPath, file);
            if (discoveredPaths.has(fullPath)) continue;

            try {
              const fileContent = await fs.readFile(fullPath, 'utf-8');
              const config = JSON.parse(fileContent);
              
              if (this.isValidConfig(config)) {
                configs.push(config);
                discoveredPaths.add(fullPath);
              }
            } catch (error) {
              console.error(`Failed to read or parse MCP config file: ${fullPath}`, error);
            }
          }
        }
      } catch (error) {
        if ((error as any).code !== 'ENOENT') {
          console.error(`Failed to read directory: ${searchPath}`, error);
        }
      }
    }

    return configs;
  }

  private isValidConfig(config: any): config is MCPServerConfiguration {
    return config && typeof config.id === 'string' && typeof config.name === 'string' && Array.isArray(config.command);
  }

  private getPlatformSearchPaths(): string[] {
    const homeDir = os.homedir();
    switch (os.platform()) {
      case 'win32':
        return [
          path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Claude Desktop', 'mcp'),
          path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Cursor', 'mcp'),
          path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Code', 'User', 'mcp'),
        ];
      case 'darwin':
        return [
          path.join(homeDir, 'Library', 'Application Support', 'Claude Desktop', 'mcp'),
          path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'mcp'),
          path.join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'mcp'),
        ];
      case 'linux':
        return [
          path.join(homeDir, '.config', 'Claude Desktop', 'mcp'),
          path.join(homeDir, '.config', 'Cursor', 'mcp'),
          path.join(homeDir, '.config', 'Code', 'User', 'mcp'),
        ];
      default:
        return [];
    }
  }
}
