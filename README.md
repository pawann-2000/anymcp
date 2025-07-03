# MCP Meta-Server Setup and Configuration Guide

## Understanding the MCP Meta-Server Architecture

The MCP Meta-Server acts as an intelligent orchestration layer that sits between your AI assistant (like Cursor) and all your installed MCP servers. Think of it as a smart traffic controller that not only routes requests to the appropriate servers but also learns from usage patterns, optimizes performance, and provides powerful workflow capabilities.

## Project Structure

Create the following directory structure for your meta-server:

```
mcp-meta-server/
├── src/
│   └── index.ts          # Main server implementation
├── package.json          # Node.js package configuration
├── tsconfig.json         # TypeScript configuration
└── README.md            # This guide
```

## Installation Steps

### Step 1: Initialize the Project

First, create a new directory for your meta-server and set up the basic structure:

```bash
mkdir mcp-meta-server
cd mcp-meta-server
mkdir src
```

### Step 2: Create Package Files

Copy the provided `package.json` and `tsconfig.json` files into your project directory. These files configure Node.js dependencies and TypeScript compilation settings.

### Step 3: Add the Server Implementation

Copy the main server implementation code into `src/index.ts`. This file contains all the logic for discovering, connecting to, and orchestrating your MCP servers.

### Step 4: Install Dependencies

Run the following command to install all required dependencies:

```bash
npm install
```

### Step 5: Build the Project

Compile the TypeScript code to JavaScript:

```bash
npm run build
```

## Configuring Cursor to Use the Meta-Server

### Step 1: Locate Your MCP Configuration

Your MCP configuration is typically stored in one of these locations:
- macOS/Linux: `~/.config/mcp/config.json` or `~/.mcp/config.json`
- Windows: `%USERPROFILE%\.config\mcp\config.json`

### Step 2: Add the Meta-Server Configuration

Add the meta-server to your MCP configuration file. Here's an example configuration:

```json
{
  "mcpServers": {
    "meta-server": {
      "command": "node",
      "args": ["/path/to/mcp-meta-server/dist/index.js"],
      "env": {}
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"]
    }
  }
}
```

Make sure to replace `/path/to/mcp-meta-server` with the actual path to your meta-server directory.

### Step 3: Restart Cursor

After updating the configuration, restart Cursor to load the new server configuration.

## Using the Meta-Server

Once configured, the meta-server provides several powerful capabilities:

### 1. Server Discovery and Connection

The meta-server automatically discovers all configured MCP servers and establishes connections. You can manually trigger discovery:

```
Use the discover_servers tool to find and connect to all available MCP servers
```

### 2. Usage Analysis

Track and analyze how tools are being used across all servers:

```
Use analyze_usage with timeframe "day" to see today's tool usage patterns
```

### 3. Context Management

The meta-server maintains context about your work session:

```
Use get_context to see the current state including active servers and recent activity
```

### 4. Workflow Execution

Execute complex multi-step workflows across different servers:

```
Use execute_workflow to run a sequence of tools with dependencies:
- Step 1: Read file with filesystem server
- Step 2: Analyze content with analysis server
- Step 3: Generate report with reporting server
```

### 5. Performance Optimization

The meta-server continuously monitors performance and can optimize routing:

```
Use optimize_routing to get recommendations for improving tool performance
```

### 6. Task-Specific Prompts

Generate optimized prompts for specific tasks based on available tools:

```
Use create_task_prompt with task "analyze customer data and generate insights"
```

## Advanced Features

### Intelligent Routing

The meta-server uses several factors to route tool calls:
- **Performance metrics**: Average response time and success rate
- **Recent usage**: Prefer recently successful servers
- **Load balancing**: Distribute requests across capable servers
- **Fallback handling**: Automatically retry with alternative servers

### Persistent Metrics

All usage metrics and context are persisted to disk in:
- `~/.mcp/meta-server/metrics/usage.json` - Tool usage history
- `~/.mcp/meta-server/context/snapshots.json` - Context snapshots

### Workflow Dependencies

When executing workflows, you can reference results from previous steps:
```json
{
  "steps": [
    {
      "tool": "read_file",
      "arguments": { "path": "data.csv" }
    },
    {
      "tool": "analyze_csv",
      "arguments": { "content": "$0.content" },
      "dependsOn": [0]
    }
  ]
}
```

## Troubleshooting

### Server Not Connecting

If the meta-server isn't connecting to other servers:
1. Check that all server commands in your config are correct
2. Verify that required npm packages are installed globally or locally
3. Check the meta-server logs for connection errors

### Performance Issues

If you experience slow performance:
1. Use `analyze_usage` to identify slow tools
2. Run `optimize_routing` to get optimization recommendations
3. Consider adjusting the routing threshold in optimization settings

### Missing Tools

If expected tools aren't appearing:
1. Run `discover_servers` with `rescan: true` to force rediscovery
2. Check that the underlying servers are properly configured
3. Verify tool names haven't changed in server updates

## Best Practices

### Regular Monitoring

Periodically run usage analysis to understand patterns and identify issues:
- Weekly performance reviews with `analyze_usage`
- Monthly routing optimization checks
- Regular context snapshots for debugging

### Workflow Design

When designing workflows:
- Keep steps focused and single-purpose
- Use clear dependency relationships
- Include error handling in critical workflows
- Test workflows incrementally

### Context Management

The meta-server's context awareness improves over time:
- Allow it to build usage history for better routing
- Regularly save context snapshots for important tasks
- Use context-aware prompts for complex operations

## Extending the Meta-Server

The meta-server is designed to be extensible. You can add:
- Custom routing algorithms
- New meta-tools for specific use cases
- Integration with external monitoring systems
- Custom persistence backends

To add new functionality, modify the `src/index.ts` file and rebuild the project.

## Security Considerations

The meta-server has access to all your MCP servers, so:
- Keep the meta-server code secure and up-to-date
- Review server configurations regularly
- Monitor unusual usage patterns
- Restrict file system access appropriately

## Conclusion

The MCP Meta-Server transforms your collection of individual MCP servers into a cohesive, intelligent system. By providing usage analytics, performance optimization, and workflow capabilities, it enables you to work more efficiently and effectively with AI assistants like Cursor.

Start with basic discovery and routing, then gradually explore advanced features like workflows and optimization as you become familiar with the system. The meta-server will learn from your usage patterns and continuously improve its performance over time.