# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **MCP Meta-Server** - an intelligent orchestration layer for the Model Context Protocol (MCP) that acts as middleware between AI assistants and multiple MCP servers. It provides centralized management, performance optimization, and workflow capabilities to reduce overall tool calls by intelligently routing requests.

## Commands

### Build & Development
```bash
npm run build    # Compile TypeScript to JavaScript
npm run start    # Run compiled server (production)
npm run dev      # Development mode with tsx hot reload
npm run clean    # Remove dist directory
npm run prepare  # Auto-build (runs on npm install)
```

### Testing the Server
```bash
node dist/index.js  # Run the built server directly
```

## Architecture Overview

### Core Components

**MCPMetaServer Class** (`src/index.ts`, ~300 lines)
- Main orchestrator extending EventEmitter
- Manages server connections, tool routing, metrics, and workflows
- Provides 8 meta-tools: `discover_servers`, `analyze_usage`, `get_context`, `execute_workflow`, `optimize_routing`, `create_task_prompt`, `suggest_tools`, `get_cache_stats`, `batch_execute`

**MCPDiscoverySystem Class** (`src/discovery.ts`, ~480 lines)
- Cross-platform MCP server discovery (Windows, macOS, Linux)
- Detects Claude Desktop, Cursor, VS Code configurations
- Handles multiple configuration formats and environment variables

### Key Architectural Patterns

**Smart Tool Deduplication & Merging**
- Automatic detection and merging of similar tools from different servers
- Tool similarity scoring based on name, description, and schema analysis
- Unified interface presenting only the best version of each tool type

**Intelligent Caching System**
- Result caching with intelligent TTL based on tool type and operation
- Cache hit rates >50% achievable with proper usage patterns
- Automatic cache cleanup and size management (1000 entry limit)

**Performance-Based Routing**
- Advanced scoring algorithm considering success rate, response time, and recency
- Automatic fallback across merged tool servers
- Poor-performing tools automatically filtered from LLM view (>50% success rate required)

**Context-Aware Tool Suggestions**
- AI-powered tool recommendations based on task description and usage history
- Workflow pattern detection and automatic sequence generation
- Performance-weighted suggestions prioritizing reliable tools

**Batch Operation Optimization**
- Parallel execution with configurable concurrency limits
- Automatic grouping by tool type for optimal resource utilization
- Cache-aware batch processing for maximum efficiency

**Advanced Analytics Engine**
- Comprehensive cache statistics and optimization recommendations
- Usage pattern learning and performance trend analysis
- Real-time metrics tracking with persistent storage

### Connection Management

The server spawns child processes for each MCP server and communicates via JSON-RPC over stdio. Key fix: Only parse stdout lines starting with `{` as JSON messages to avoid parsing console.log output.

```typescript
// In connectToServer method - critical fix for infinite loops
if (line.trim().startsWith('{')) {
  try {
    const message = JSON.parse(line.trim());
    transport.onmessage?.(message);
  } catch (error) {
    // Skip invalid JSON
  }
}
```

## Development Guidelines

### Code Structure
- `src/index.ts`: Main server implementation with all core functionality
- `src/discovery.ts`: Platform-specific discovery logic
- `dist/`: Compiled JavaScript output (auto-generated)

### Tool Routing Logic
Tools are routed using this priority:
1. Explicit server targeting (`toolName@serverId`)
2. Performance-based scoring algorithm
3. Fallback to best available server

### Error Handling
The server uses defensive programming with try-catch blocks and graceful degradation. All tool calls are tracked with success/failure metrics.

### Storage Patterns
- Metrics are limited to 10,000 entries, auto-trimmed to 5,000
- Context snapshots limited to 100 entries, auto-trimmed to 50
- All data persisted as JSON files in user's home directory

### Configuration Discovery
The discovery system searches for MCP configurations in platform-specific locations:
- **Windows**: `%APPDATA%` paths for Claude Desktop, Cursor
- **macOS**: `~/Library/Application Support/` paths
- **Linux**: `~/.config/` paths
- Environment variables for custom configurations

## Enhanced Optimization Features

### Tool Call Reduction Strategies
1. **Smart Caching**: Intelligent TTL-based result caching reduces repeated calls by 50-80%
2. **Tool Deduplication**: Merges similar tools from multiple servers into unified interfaces
3. **Performance Filtering**: Hides unreliable tools (>50% failure rate) from LLM decision space
4. **Batch Processing**: `batch_execute` meta-tool for efficient parallel operations
5. **Context Suggestions**: `suggest_tools` provides LLM with pre-filtered, relevant tool recommendations

### Key Meta-Tools for Optimization
- `suggest_tools`: Get intelligent tool recommendations based on task context
- `get_cache_stats`: Monitor cache performance and optimization opportunities  
- `batch_execute`: Execute multiple operations with automatic parallelism and caching
- `optimize_routing`: Analyze performance and get routing recommendations

### Expected Performance Gains
- **50-80% reduction** in total tool calls through intelligent caching
- **Faster LLM responses** via simplified, pre-filtered tool selection
- **Higher success rates** through performance-based tool filtering
- **Improved task completion** via context-aware suggestions and workflow automation

This meta-server transforms raw MCP server collections into an intelligent, self-optimizing system that actively reduces LLM cognitive load while maximizing operational efficiency.