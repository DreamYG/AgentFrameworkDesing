import { createServer } from 'node:http';
import { ConsoleModel, renderConsoleHtml } from './index.js';

/**
 * Console 独立调试服务：只负责输出前端调试页，不持有业务状态。
 */
const model = new ConsoleModel();
const port = Number(process.env['PORT'] ?? 3001);
const gatewayBaseUrl = process.env['NEXUS_GATEWAY_URL'] ?? '';

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (url.pathname !== '/' && url.pathname !== '/console') {
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(renderConsoleHtml(model, { gatewayBaseUrl }));
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Nexus Debug Console listening on http://0.0.0.0:${port}\n`);
});
