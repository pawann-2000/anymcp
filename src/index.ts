
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
  CallToolResult,
  ListToolsResult,
  ServerCapabilities
} from '@modelcontextprotocol/sdk/types.js';
import { MCPDiscoverySystem, MCPServerConfiguration } from './discovery.js';
import { CachingSystem } from './caching.js';
import { ToolDeduplicationSystem, MergedTool } from './deduplication.js';

export interface PerformanceMetrics {
  successRate: number;
  avgResponseTime: number;
  lastUsed: Date;
  totalCalls: number;
  failureCount: number;
}

export interface ServerInfo {
  config: MCPServerConfiguration;
  client: Client;
  tools: Tool[];
  metrics: PerformanceMetrics;
  status: 'connected' | 'disconnected' | 'connecting';
}


export class MCPMetaServer {
  private server: Server;
  private discovery: MCPDiscoverySystem;
  private servers: Map<string, ServerInfo> = new Map();
  private cache: CachingSystem;
  private deduplication: ToolDeduplicationSystem;
  private allTools: Map<string, Tool & { serverId: string }> = new Map();
  private mergedTools: Map<string, MergedTool> = new Map();
  private performanceMetrics: Map<string, Map<string, PerformanceMetrics>> = new Map();

  constructor() {
    this.discovery = new MCPDiscoverySystem();
    this.cache = new CachingSystem();
    this.deduplication = new ToolDeduplicationSystem();
    
    const capabilities: ServerCapabilities = {
      tools: { listChanged: true },
      resources: {},
      prompts: {},
      logging: {}
    };

    this.server = new Server({
      name: 'mcp-meta-server',
      version: '1.0.0'
    }, {
      capabilities
    });

    this.setupRequestHandlers();
  }

  public async start() {
    console.error('MCP Meta-Server starting...');
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    await this.discoverAndConnect();
    console.error('MCP Meta-Server started.');
  }

  public async shutdown() {
    console.error('MCP Meta-Server shutting down...');
    
    for (const [serverId, serverInfo] of this.servers) {
      if (serverInfo.client) {
        await serverInfo.client.close();
      }
    }
    
    this.servers.clear();
    await this.server.close();
    console.error('MCP Meta-Server shut down.');
  }

  private async discoverAndConnect() {
    const configs = await this.discovery.discoverServers();
    const connectionPromises = configs.map(config => this.connectToServer(config));
    await Promise.allSettled(connectionPromises);
    
    await this.refreshToolsList();
  }

  private async connectToServer(config: MCPServerConfiguration) {
    if (this.servers.has(config.id)) {
      console.error(`Server ${config.id} is already connected.`);
      return;
    }

    try {
      const serverInfo: ServerInfo = {
        config,
        client: new Client({
          name: 'mcp-meta-server-client',
          version: '1.0.0'
        }, {
          capabilities: {}
        }),
        tools: [],
        metrics: {
          successRate: 1.0,
          avgResponseTime: 0,
          lastUsed: new Date(),
          totalCalls: 0,
          failureCount: 0
        },
        status: 'connecting'
      };

      const [command, ...args] = config.command;
      const transport = new StdioClientTransport({
        command,
        args
      });

      await serverInfo.client.connect(transport);
      
      const toolsResult = await serverInfo.client.request(
        { method: 'tools/list' },
        ListToolsRequestSchema
      ) as any;
      
      serverInfo.tools = toolsResult.tools;
      serverInfo.status = 'connected';
      
      this.servers.set(config.id, serverInfo);
      this.initializeServerMetrics(config.id, serverInfo.tools);
      
      console.error(`Connected to server: ${config.name} (${config.id}) with ${serverInfo.tools.length} tools`);
    } catch (error) {
      console.error(`Failed to connect to server ${config.id}:`, error);
      
      const serverInfo: ServerInfo = {
        config,
        client: null as any,
        tools: [],
        metrics: {
          successRate: 0,
          avgResponseTime: 0,
          lastUsed: new Date(),
          totalCalls: 0,
          failureCount: 1
        },
        status: 'disconnected'
      };
      
      this.servers.set(config.id, serverInfo);
    }
  }

  private async refreshToolsList() {
    this.allTools.clear();
    this.mergedTools.clear();
    
    // Collect all tools from connected servers
    const allServerTools: { serverId: string; tool: Tool }[] = [];
    
    for (const [serverId, serverInfo] of this.servers) {
      if (serverInfo.status === 'connected') {
        for (const tool of serverInfo.tools) {
          // Store original namespaced tools
          const namespacedTool = {
            ...tool,
            name: `${serverId}:${tool.name}`,
            serverId
          };
          this.allTools.set(namespacedTool.name, namespacedTool);
          
          // Collect for deduplication
          allServerTools.push({ serverId, tool });
        }
      }
    }
    
    // Apply deduplication if enabled
    if (this.deduplication.getConfig().enabled) {
      const mergedTools = this.deduplication.mergeTools(allServerTools);
      
      for (const mergedTool of mergedTools) {
        this.mergedTools.set(mergedTool.name, mergedTool);
      }
      
      const stats = this.deduplication.getStats(allServerTools);
      console.error(`Refreshed tools list: ${this.allTools.size} original tools, ${mergedTools.length} after deduplication (${stats.reductionPercentage.toFixed(1)}% reduction)`);
    } else {
      console.error(`Refreshed tools list: ${this.allTools.size} tools from ${this.servers.size} servers (deduplication disabled)`);
    }
    
    // Note: Tool list changes are automatically detected by clients
  }

  private initializeServerMetrics(serverId: string, tools: Tool[]) {
    const serverMetrics = new Map<string, PerformanceMetrics>();
    
    for (const tool of tools) {
      serverMetrics.set(tool.name, {
        successRate: 1.0,
        avgResponseTime: 0,
        lastUsed: new Date(),
        totalCalls: 0,
        failureCount: 0
      });
    }
    
    this.performanceMetrics.set(serverId, serverMetrics);
  }

  private updateMetrics(serverId: string, toolName: string, success: boolean, responseTime: number) {
    const serverMetrics = this.performanceMetrics.get(serverId);
    if (!serverMetrics) return;
    
    const toolMetrics = serverMetrics.get(toolName);
    if (!toolMetrics) return;
    
    toolMetrics.totalCalls++;
    toolMetrics.lastUsed = new Date();
    
    if (!success) {
      toolMetrics.failureCount++;
    }
    
    toolMetrics.successRate = (toolMetrics.totalCalls - toolMetrics.failureCount) / toolMetrics.totalCalls;
    toolMetrics.avgResponseTime = (toolMetrics.avgResponseTime * (toolMetrics.totalCalls - 1) + responseTime) / toolMetrics.totalCalls;
  }

  private parseToolIdentifier(toolName: string): { serverId: string; toolName: string } {
    const colonIndex = toolName.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid tool name format: ${toolName}. Expected format: serverId:toolName`);
    }
    
    return {
      serverId: toolName.substring(0, colonIndex),
      toolName: toolName.substring(colonIndex + 1)
    };
  }

  private setupRequestHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const metaTools: Tool[] = [
        {
          name: 'discover_servers',
          description: 'Discover and list all connected MCP servers with their configurations and status',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        },
        {
          name: 'analyze_usage',
          description: 'Analyze tool usage patterns, performance metrics, and optimization opportunities',
          inputSchema: {
            type: 'object',
            properties: {
              timeframe: {
                type: 'string',
                enum: ['hour', 'day', 'week'],
                description: 'Time period for analysis'
              },
              serverId: {
                type: 'string',
                description: 'Optional server ID to analyze specific server'
              }
            },
            additionalProperties: false
          }
        },
        {
          name: 'get_cache_stats',
          description: 'Get caching system statistics and optimization recommendations',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        },
        {
          name: 'suggest_tools',
          description: 'Get intelligent tool suggestions based on task description and context',
          inputSchema: {
            type: 'object',
            properties: {
              task: {
                type: 'string',
                description: 'Description of the task you want to accomplish'
              },
              context: {
                type: 'object',
                description: 'Additional context about the task',
                additionalProperties: true
              }
            },
            required: ['task'],
            additionalProperties: false
          }
        },
        {
          name: 'batch_execute',
          description: 'Execute multiple tool calls in parallel with automatic optimization',
          inputSchema: {
            type: 'object',
            properties: {
              operations: {
                type: 'array',
                description: 'List of tool operations to execute',
                items: {
                  type: 'object',
                  properties: {
                    tool: { type: 'string' },
                    arguments: { type: 'object', additionalProperties: true }
                  },
                  required: ['tool', 'arguments']
                }
              },
              concurrency: {
                type: 'number',
                description: 'Maximum number of concurrent operations (default: 5)',
                minimum: 1,
                maximum: 20
              }
            },
            required: ['operations'],
            additionalProperties: false
          }
        },
        {
          name: 'optimize_routing',
          description: 'Analyze and optimize tool routing based on performance metrics',
          inputSchema: {
            type: 'object',
            properties: {
              tool: {
                type: 'string',
                description: 'Optional specific tool to analyze'
              }
            },
            additionalProperties: false
          }
        },
        {
          name: 'configure_deduplication',
          description: 'Configure tool deduplication settings and get deduplication statistics',
          inputSchema: {
            type: 'object',
            properties: {
              enabled: {
                type: 'boolean',
                description: 'Enable or disable tool deduplication'
              },
              similarityThreshold: {
                type: 'number',
                description: 'Similarity threshold for merging tools (0-1)',
                minimum: 0,
                maximum: 1
              },
              autoMerge: {
                type: 'boolean',
                description: 'Automatically merge similar tools'
              },
              getStats: {
                type: 'boolean',
                description: 'Return deduplication statistics'
              }
            },
            additionalProperties: false
          }
        },
        {
          name: 'analyze_tool_similarity',
          description: 'Analyze similarity between specific tools and get merge recommendations',
          inputSchema: {
            type: 'object',
            properties: {
              tool1: {
                type: 'string',
                description: 'First tool name to compare'
              },
              tool2: {
                type: 'string',
                description: 'Second tool name to compare'
              },
              listSimilar: {
                type: 'boolean',
                description: 'List all tools similar to a given tool'
              },
              toolName: {
                type: 'string',
                description: 'Tool name to find similar tools for (when listSimilar is true)'
              }
            },
            additionalProperties: false
          }
        }
      ];

      // Choose which tools to expose: merged (if deduplication enabled) or original
      const toolsToExpose = this.deduplication.getConfig().enabled && this.mergedTools.size > 0
        ? Array.from(this.mergedTools.values()).map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        : Array.from(this.allTools.values()).map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }));

      return {
        tools: [...metaTools, ...toolsToExpose]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const startTime = Date.now();
      
      try {
        let result: any;
        
        switch (name) {
          case 'discover_servers':
            result = await this.handleDiscoverServers();
            break;
          case 'analyze_usage':
            result = await this.handleAnalyzeUsage(args);
            break;
          case 'get_cache_stats':
            result = await this.handleGetCacheStats();
            break;
          case 'suggest_tools':
            result = await this.handleSuggestTools(args);
            break;
          case 'batch_execute':
            result = await this.handleBatchExecute(args);
            break;
          case 'optimize_routing':
            result = await this.handleOptimizeRouting(args);
            break;
          case 'configure_deduplication':
            result = await this.handleConfigureDeduplication(args);
            break;
          case 'analyze_tool_similarity':
            result = await this.handleAnalyzeToolSimilarity(args);
            break;
          default:
            result = await this.delegateToolCall(name, args);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        } as CallToolResult;
        
      } catch (error) {
        const responseTime = Date.now() - startTime;
        
        if (name.includes(':')) {
          const { serverId, toolName } = this.parseToolIdentifier(name);
          this.updateMetrics(serverId, toolName, false, responseTime);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`
            }
          ],
          isError: true
        } as CallToolResult;
      }
    });
  }

  private async delegateToolCall(toolName: string, args: any) {
    // Check if this is a merged tool (deduplication enabled)
    if (this.deduplication.getConfig().enabled && this.mergedTools.has(toolName)) {
      return await this.handleMergedToolCall(toolName, args);
    }
    
    // Handle regular namespaced tool call
    const { serverId, toolName: actualToolName } = this.parseToolIdentifier(toolName);
    return await this.executeToolCall(serverId, actualToolName, args);
  }

  private async handleMergedToolCall(toolName: string, args: any) {
    const mergedTool = this.mergedTools.get(toolName);
    if (!mergedTool) {
      throw new Error(`Merged tool ${toolName} not found`);
    }
    
    // Sort servers by performance metrics for intelligent routing
    const sortedServers = mergedTool.originalTools
      .map(({ serverId, tool }) => ({
        serverId,
        toolName: tool.name,
        score: this.calculateServerScore(serverId, tool.name)
      }))
      .sort((a, b) => b.score - a.score);
    
    let lastError: Error | null = null;
    
    // Try servers in order of performance score
    for (const { serverId, toolName: actualToolName } of sortedServers) {
      const serverInfo = this.servers.get(serverId);
      if (!serverInfo || serverInfo.status !== 'connected') {
        continue;
      }
      
      try {
        console.error(`Routing merged tool "${toolName}" to server "${serverId}" (tool: "${actualToolName}")`);
        return await this.executeToolCall(serverId, actualToolName, args);
      } catch (error) {
        lastError = error as Error;
        console.error(`Failed to execute tool "${actualToolName}" on server "${serverId}":`, error);
        continue;
      }
    }
    
    throw new Error(`All servers failed for merged tool "${toolName}". Last error: ${lastError?.message}`);
  }

  private async executeToolCall(serverId: string, toolName: string, args: any) {
    const serverInfo = this.servers.get(serverId);
    
    if (!serverInfo || serverInfo.status !== 'connected') {
      throw new Error(`Server ${serverId} is not connected`);
    }
    
    const cacheKey = `${serverId}:${toolName}:${JSON.stringify(args)}`;
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
    
    const startTime = Date.now();
    
    try {
      const result = await serverInfo.client.request({
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      }, CallToolRequestSchema);
      
      const responseTime = Date.now() - startTime;
      this.updateMetrics(serverId, toolName, true, responseTime);
      
      this.cache.set(cacheKey, result, undefined, this.determineToolType(toolName));
      return result;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateMetrics(serverId, toolName, false, responseTime);
      throw error;
    }
  }

  private calculateServerScore(serverId: string, toolName: string): number {
    const serverMetrics = this.performanceMetrics.get(serverId);
    const toolMetrics = serverMetrics?.get(toolName);
    
    if (!toolMetrics || toolMetrics.totalCalls === 0) {
      return 0.5; // Default score for untested tools
    }
    
    // Calculate composite score based on success rate, response time, and recency
    const successScore = toolMetrics.successRate;
    const responseScore = Math.max(0, 1 - (toolMetrics.avgResponseTime / 10000)); // Penalize >10s response times
    const recencyScore = this.calculateRecencyScore(toolMetrics.lastUsed);
    
    return (successScore * 0.5) + (responseScore * 0.3) + (recencyScore * 0.2);
  }

  private calculateRecencyScore(lastUsed: Date): number {
    const hoursSinceUsed = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceUsed < 1) return 1.0;
    if (hoursSinceUsed < 24) return 0.8;
    if (hoursSinceUsed < 168) return 0.6; // 1 week
    return 0.4;
  }

  private determineToolType(toolName: string): string {
    const name = toolName.toLowerCase();
    
    if (name.includes('file') || name.includes('read') || name.includes('write')) return 'filesystem';
    if (name.includes('db') || name.includes('sql') || name.includes('query')) return 'database';
    if (name.includes('http') || name.includes('api') || name.includes('request')) return 'network';
    if (name.includes('compute') || name.includes('calculate') || name.includes('process')) return 'computation';
    if (name.includes('static') || name.includes('const') || name.includes('reference')) return 'static';
    
    return 'default';
  }

  private async handleDiscoverServers() {
    return {
      servers: Array.from(this.servers.entries()).map(([id, info]) => ({
        id,
        name: info.config.name,
        description: info.config.description || 'No description available',
        status: info.status,
        toolCount: info.tools.length,
        command: info.config.command,
        metrics: info.metrics
      }))
    };
  }

  private async handleAnalyzeUsage(args: any) {
    const { serverId, timeframe = 'day' } = args;
    
    const analysis: any = {
      timeframe,
      totalServers: this.servers.size,
      totalTools: this.allTools.size,
      cacheStats: this.cache.getStats()
    };
    
    if (serverId) {
      const serverMetrics = this.performanceMetrics.get(serverId);
      if (serverMetrics) {
        analysis.serverAnalysis = {
          serverId,
          tools: Array.from(serverMetrics.entries()).map(([toolName, metrics]) => ({
            toolName,
            ...metrics
          }))
        };
      }
    } else {
      analysis.performanceOverview = {
        servers: Array.from(this.performanceMetrics.entries()).map(([id, toolMetrics]) => ({
          serverId: id,
          avgSuccessRate: Array.from(toolMetrics.values()).reduce((sum, m) => sum + m.successRate, 0) / toolMetrics.size,
          avgResponseTime: Array.from(toolMetrics.values()).reduce((sum, m) => sum + m.avgResponseTime, 0) / toolMetrics.size,
          totalCalls: Array.from(toolMetrics.values()).reduce((sum, m) => sum + m.totalCalls, 0)
        }))
      };
    }
    
    return analysis;
  }

  private async handleGetCacheStats() {
    return this.cache.getStats();
  }

  private async handleSuggestTools(args: any) {
    const { task, context = {} } = args;
    
    const suggestions = Array.from(this.allTools.values())
      .filter(tool => {
        const serverInfo = this.servers.get(tool.serverId);
        return serverInfo && serverInfo.status === 'connected';
      })
      .map(tool => {
        const serverMetrics = this.performanceMetrics.get(tool.serverId);
        const toolMetrics = serverMetrics?.get(tool.name.split(':')[1]);
        const score = this.calculateToolRelevanceScore(tool, task, toolMetrics);
        
        return {
          toolName: tool.name,
          description: tool.description || 'No description available',
          relevanceScore: score,
          performance: toolMetrics || null
        };
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10);
    
    return {
      task,
      suggestions
    };
  }

  private async handleBatchExecute(args: any) {
    const { operations, concurrency = 5 } = args;
    
    const executeWithLimit = async (ops: any[], limit: number) => {
      const results = [];
      for (let i = 0; i < ops.length; i += limit) {
        const batch = ops.slice(i, i + limit);
        const batchResults = await Promise.allSettled(
          batch.map(op => this.delegateToolCall(op.tool, op.arguments))
        );
        results.push(...batchResults);
      }
      return results;
    };
    
    const results = await executeWithLimit(operations, concurrency);
    
    return {
      totalOperations: operations.length,
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results: results.map((result, index) => ({
        operation: operations[index],
        status: result.status,
        result: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason.message : null
      }))
    };
  }

  private async handleOptimizeRouting(args: any) {
    const { tool } = args;
    
    const recommendations = [];
    
    for (const [serverId, serverMetrics] of this.performanceMetrics) {
      const serverInfo = this.servers.get(serverId);
      if (!serverInfo) continue;
      
      for (const [toolName, metrics] of serverMetrics) {
        if (tool && !toolName.includes(tool)) continue;
        
        if (metrics.successRate < 0.8) {
          recommendations.push({
            type: 'performance_warning',
            serverId,
            toolName,
            issue: `Low success rate: ${(metrics.successRate * 100).toFixed(1)}%`,
            suggestion: 'Consider investigating server stability or tool implementation'
          });
        }
        
        if (metrics.avgResponseTime > 5000) {
          recommendations.push({
            type: 'latency_warning',
            serverId,
            toolName,
            issue: `High response time: ${metrics.avgResponseTime.toFixed(0)}ms`,
            suggestion: 'Consider caching strategy or server optimization'
          });
        }
      }
    }
    
    return {
      recommendations,
      cacheOptimization: this.cache.getStats()
    };
  }

  private async handleConfigureDeduplication(args: any) {
    const { enabled, similarityThreshold, autoMerge, getStats } = args;
    
    // Update configuration if parameters provided
    const updates: any = {};
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (typeof similarityThreshold === 'number') updates.similarityThreshold = similarityThreshold;
    if (typeof autoMerge === 'boolean') updates.autoMerge = autoMerge;
    
    if (Object.keys(updates).length > 0) {
      this.deduplication.updateConfig(updates);
      
      // Refresh tools if deduplication was enabled/disabled
      if (typeof enabled === 'boolean') {
        await this.refreshToolsList();
      }
    }
    
    const result: any = {
      config: this.deduplication.getConfig()
    };
    
    // Add statistics if requested
    if (getStats) {
      const allServerTools: { serverId: string; tool: Tool }[] = [];
      for (const [serverId, serverInfo] of this.servers) {
        if (serverInfo.status === 'connected') {
          for (const tool of serverInfo.tools) {
            allServerTools.push({ serverId, tool });
          }
        }
      }
      
      result.stats = this.deduplication.getStats(allServerTools);
      result.toolCounts = {
        originalTools: this.allTools.size,
        mergedTools: this.mergedTools.size,
        reduction: this.allTools.size > 0 
          ? ((this.allTools.size - this.mergedTools.size) / this.allTools.size) * 100 
          : 0
      };
    }
    
    return result;
  }

  private async handleAnalyzeToolSimilarity(args: any) {
    const { tool1, tool2, listSimilar, toolName } = args;
    
    if (tool1 && tool2) {
      // Compare two specific tools
      const tool1Data = this.findToolByName(tool1);
      const tool2Data = this.findToolByName(tool2);
      
      if (!tool1Data || !tool2Data) {
        throw new Error(`Tool not found: ${!tool1Data ? tool1 : tool2}`);
      }
      
      const similarity = this.deduplication.analyzeSimilarity(tool1Data.tool, tool2Data.tool);
      
      return {
        tool1: { name: tool1, serverId: tool1Data.serverId },
        tool2: { name: tool2, serverId: tool2Data.serverId },
        similarity
      };
    }
    
    if (listSimilar && toolName) {
      // Find all tools similar to the specified tool
      const targetTool = this.findToolByName(toolName);
      if (!targetTool) {
        throw new Error(`Tool not found: ${toolName}`);
      }
      
      const similarTools = [];
      for (const [_, serverTools] of this.allTools) {
        if (serverTools.name !== toolName) {
          const similarity = this.deduplication.analyzeSimilarity(targetTool.tool, serverTools);
          if (similarity.score > 0.5) { // Show tools with >50% similarity
            similarTools.push({
              toolName: serverTools.name,
              serverId: serverTools.serverId,
              similarity
            });
          }
        }
      }
      
      return {
        targetTool: { name: toolName, serverId: targetTool.serverId },
        similarTools: similarTools.sort((a, b) => b.similarity.score - a.similarity.score)
      };
    }
    
    throw new Error('Either provide tool1 and tool2 for comparison, or toolName with listSimilar=true');
  }

  private findToolByName(toolName: string): { serverId: string; tool: Tool } | null {
    // Check if it's a namespaced tool name (serverId:toolName)
    if (toolName.includes(':')) {
      const namespacedTool = this.allTools.get(toolName);
      if (namespacedTool) {
        return {
          serverId: namespacedTool.serverId,
          tool: {
            name: toolName.split(':')[1],
            description: namespacedTool.description,
            inputSchema: namespacedTool.inputSchema
          }
        };
      }
    } else {
      // Search for tool by base name across all servers
      for (const [_, namespacedTool] of this.allTools) {
        const baseName = namespacedTool.name.split(':')[1];
        if (baseName === toolName) {
          return {
            serverId: namespacedTool.serverId,
            tool: {
              name: baseName,
              description: namespacedTool.description,
              inputSchema: namespacedTool.inputSchema
            }
          };
        }
      }
    }
    return null;
  }

  private calculateToolRelevanceScore(tool: Tool, task: string, metrics?: PerformanceMetrics): number {
    let score = 0;
    
    const taskLower = task.toLowerCase();
    const toolNameLower = tool.name.toLowerCase();
    const toolDescLower = (tool.description || '').toLowerCase();
    
    if (toolNameLower.includes(taskLower) || taskLower.includes(toolNameLower)) {
      score += 0.5;
    }
    
    const taskWords = taskLower.split(' ');
    const descWords = toolDescLower.split(' ');
    const commonWords = taskWords.filter(word => descWords.includes(word)).length;
    score += (commonWords / taskWords.length) * 0.3;
    
    if (metrics) {
      score += metrics.successRate * 0.2;
      score += Math.max(0, (1 - metrics.avgResponseTime / 10000)) * 0.1;
    }
    
    return Math.min(1, score);
  }
}

async function main() {
  const metaServer = new MCPMetaServer();
  
  process.on('SIGINT', async () => {
    await metaServer.shutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await metaServer.shutdown();
    process.exit(0);
  });
  
  try {
    await metaServer.start();
  } catch (error) {
    console.error('Failed to start MCP Meta-Server:', error);
    process.exit(1);
  }
}

main().catch(console.error);
