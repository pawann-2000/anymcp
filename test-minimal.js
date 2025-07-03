import { spawn } from 'child_process';

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Handle server stderr (should contain our debug messages)
server.stderr.on('data', (data) => {
  console.log('Server stderr:', data.toString());
});

// Handle server stdout (should contain JSON-RPC responses)
server.stdout.on('data', (data) => {
  console.log('Server stdout raw:', JSON.stringify(data.toString()));
  console.log('Server stdout parsed:', data.toString());
});

// Send initialize request
const initRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "test-client",
      version: "1.0.0"
    }
  }
};

console.log('Sending initialize request...');
server.stdin.write(JSON.stringify(initRequest) + '\n');

// Wait a bit then send tools/list request
setTimeout(() => {
  const toolsRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  };
  
  console.log('Sending tools/list request...');
  server.stdin.write(JSON.stringify(toolsRequest) + '\n');
}, 1000);

// Clean up after 5 seconds
setTimeout(() => {
  server.kill();
  process.exit(0);
}, 5000); 