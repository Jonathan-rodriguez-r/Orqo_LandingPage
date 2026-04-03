declare module '@modelcontextprotocol/sdk/client/index.js' {
  export class Client {
    constructor(...args: any[]);
    connect(transport: any): Promise<void>;
    listTools(): Promise<any>;
    callTool(args: any): Promise<any>;
    close(): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/client/stdio.js' {
  export class StdioClientTransport {
    constructor(...args: any[]);
  }
}

declare module '@modelcontextprotocol/sdk/client/sse.js' {
  export class SSEClientTransport {
    constructor(...args: any[]);
  }
}
