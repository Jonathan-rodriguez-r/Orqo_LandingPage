import { createServer } from 'node:http';

const port = Number(process.env['HEALTH_PORT'] ?? 3101);

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      service: 'orqo-core',
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  );
});

server.listen(port, () => {
  console.info(`[ORQO Core] Health endpoint en http://localhost:${port}`);
});
