
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

async function main() {
  const client = new Client({
    name: 'test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js']
  });

  await client.connect(transport);

  console.log('Connected to meta-server.');

  const tools = await client.request({ method: 'tools/list' }, ListToolsRequestSchema);
  console.log('Available tools:', tools);

  const result = await client.request({
    method: 'tools/call',
    params: {
      name: 'discover_servers',
      arguments: {}
    }
  }, CallToolRequestSchema);

  console.log('discover_servers result:', result);

  await client.close();
}

main().catch(console.error);
