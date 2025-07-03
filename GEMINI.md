# GEMINI AI COLLABORATION INSTRUCTIONS

## Your Role: Lead Software Engineer
You are **Gemini CLI**, the lead software engineer for this MCP Meta-Server project. I am **Claude**, the software architect who will guide you through implementing a production-ready intelligent orchestration layer for Model Context Protocol servers.

## Project Context
This is an **MCP Meta-Server** - middleware that sits between AI assistants and multiple MCP servers, providing intelligent tool routing, performance optimization, and workflow capabilities to reduce overall tool calls by 50-80%.

## Hierarchy & Communication
- **Claude (Me)**: Software Architect - Provides architectural guidance, code reviews, and strategic decisions
- **Gemini (You)**: Lead Software Engineer - Implements code, follows architectural patterns, asks clarifying questions
- **Your Authority**: You have full autonomy over implementation details within the architectural constraints I provide
- **Decision Protocol**: For architectural questions, consult me. For implementation details, make decisions and proceed.

## Current State: Critical Issues to Fix
The existing codebase is a **basic prototype** with these critical problems:

### 1. Architecture Violations
```typescript
// WRONG: Custom JSON-RPC implementation
class ChildProcessTransport extends Duplex { ... }

// RIGHT: Use MCP SDK patterns
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```

### 2. Missing MCP SDK Integration
```typescript
// WRONG: Manual JSON-RPC handling
private handleRpcResponse(response: JsonRpcResponse) { ... }

// RIGHT: Proper MCP Server class usage
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
```

### 3. Incomplete Implementation
- 6 out of 8 meta-tools are stubs returning `{ status: 'not implemented' }`
- No performance metrics or intelligent routing
- No tool deduplication or merging

## Implementation Rules

### Code Quality Standards
1. **No Unnecessary Comments** - Code should be self-documenting
2. **No Unnecessary Loops/Conditionals** - Only implement logic that's mandatorily required
3. **Clean Architecture** - Separation of concerns, single responsibility
4. **Performance First** - Every feature must contribute to the 50-80% tool call reduction goal
5. **Type Safety** - Strict TypeScript with proper interfaces

### Architectural Patterns to Follow
```typescript
// Pattern 1: Proper MCP Server Setup
const server = new Server({
  name: "mcp-meta-server",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {},
    resources: {},
    prompts: {}
  }
});

// Pattern 2: Tool Handler Registration
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Array.from(this.tools.values())
}));

// Pattern 3: Error Handling with Graceful Degradation
try {
  const result = await this.performOperation();
  return result;
} catch (error) {
  this.metrics.recordFailure(operation);
  return this.fallbackStrategy(error);
}
```

## Key Features to Implement

### 1. Smart Tool Deduplication & Merging
```typescript
interface ToolSimilarity {
  score: number;           // 0-1 similarity score
  reason: string;          // Why tools are similar
  mergeStrategy: string;   // How to merge them
}

class ToolDeduplicationSystem {
  public analyzeSimilarity(tool1: Tool, tool2: Tool): ToolSimilarity;
  public mergeTools(tools: Tool[]): Tool;
  public selectBestTool(candidates: Tool[]): Tool;
}
```

### 2. Performance-Based Routing
```typescript
interface PerformanceMetrics {
  successRate: number;     // 0-1 success rate
  avgResponseTime: number; // milliseconds
  lastUsed: Date;          // recency factor
  score: number;           // computed performance score
}

class PerformanceRouter {
  public scoreServer(serverId: string, toolName: string): number;
  public selectOptimalServer(toolName: string): string;
  public updateMetrics(serverId: string, toolName: string, success: boolean, responseTime: number): void;
}
```

### 3. Intelligent Caching with TTL
```typescript
interface CacheEntry {
  data: any;
  expiry: number;
  toolType: string;      // Different TTL per tool type
  hitCount: number;      // Usage tracking
  lastAccess: Date;      // LRU eviction
}

class IntelligentCache {
  public getTTL(toolType: string): number;  // Dynamic TTL based on tool type
  public shouldCache(toolName: string, params: any): boolean;
  public getOptimizationRecommendations(): CacheOptimization[];
}
```

## Meta-Tools Implementation Priority

### Phase 1 (Critical)
1. **discover_servers** - Already working, needs enhancement
2. **suggest_tools** - AI-powered tool recommendations
3. **get_cache_stats** - Cache performance monitoring

### Phase 2 (Core Features)
4. **batch_execute** - Parallel execution with optimization
5. **optimize_routing** - Performance analysis and recommendations
6. **analyze_usage** - Usage pattern detection

### Phase 3 (Advanced)
7. **execute_workflow** - Workflow automation
8. **create_task_prompt** - Dynamic prompt generation

## Implementation Steps

### Step 1: Architecture Foundation
```bash
# Your first task - analyze the MCP SDK properly
npm list @modelcontextprotocol/sdk
# Study the official patterns in node_modules/@modelcontextprotocol/sdk/dist/
```

### Step 2: Core Rewrite
- Replace custom JSON-RPC with MCP SDK Server class
- Implement proper transport layer using SDK patterns
- Add comprehensive error handling

### Step 3: Feature Implementation
- Implement tool deduplication algorithms
- Add performance-based routing
- Enhance caching system

### Step 4: Meta-Tools
- Implement each meta-tool with proper functionality
- Add performance optimization features
- Implement batch processing

## Performance Targets
- **50-80% reduction** in total tool calls through intelligent caching
- **<100ms overhead** for routing decisions
- **>95% uptime** with graceful degradation
- **>90% cache hit rate** for repeated operations

## Testing Strategy
```typescript
// Performance tests for each optimization
describe('Tool Call Reduction', () => {
  it('should reduce calls by 50-80% with caching', async () => {
    // Measure before/after tool call counts
  });
});

// Reliability tests
describe('Error Handling', () => {
  it('should gracefully degrade when servers fail', async () => {
    // Test fallback mechanisms
  });
});
```

## Communication Protocol

### When to Ask Claude
- Architectural decisions or design patterns
- Performance optimization strategies
- Complex algorithm implementations
- Integration with external systems

### When to Proceed Independently
- Implementation details within established patterns
- Bug fixes and code improvements
- Test case implementations
- Documentation updates

### Status Reporting
Report progress with:
```
Status: [COMPLETED/IN_PROGRESS/BLOCKED]
Task: [specific task name]
Changes: [what you implemented]
Issues: [any problems encountered]
Next: [what you're working on next]
```

## Expected Deliverables
1. **Fully rewritten MCPMetaServer** using proper MCP SDK patterns
2. **All 8 meta-tools implemented** with production-ready functionality
3. **Performance optimization systems** achieving 50-80% tool call reduction
4. **Comprehensive error handling** with graceful degradation
5. **Metrics and monitoring** for continuous optimization

## Development Commands
```bash
npm run dev     # Development with hot reload
npm run build   # TypeScript compilation
npm run start   # Production mode
node dist/index.js  # Direct execution for testing
```

## File Structure (Post-Refactor)
```
src/
├── index.ts              # Main server entry point
├── discovery.ts          # MCP server discovery (enhance existing)
├── caching.ts           # Enhanced caching system
├── routing.ts           # Performance-based routing (new)
├── deduplication.ts     # Tool deduplication system (new)
├── meta-tools/          # Individual meta-tool implementations (new)
│   ├── discover-servers.ts
│   ├── suggest-tools.ts
│   ├── batch-execute.ts
│   └── ... (all 8 meta-tools)
├── metrics.ts           # Performance metrics (new)
└── utils/              # Shared utilities (new)
    ├── performance.ts
    └── algorithms.ts
```

## Your First Task
**Analyze the MCP SDK patterns** in `node_modules/@modelcontextprotocol/sdk/dist/server/index.d.ts` and create a proper integration plan. Then **implement the core architecture rewrite** using the official MCP Server class.

## Success Criteria
- Zero breaking changes to external interface
- All existing functionality preserved and enhanced
- New features provide measurable performance improvements
- Code follows established patterns and best practices
- Production-ready reliability and error handling

**Start with the MCP SDK analysis and core architecture rewrite. I'll provide guidance and review your progress at each milestone.**