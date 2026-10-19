import type { IncomingMessage } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { handlePlacesRequest } from './places';

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

/** Serves /api/places/* during `npm run dev` / `npm run preview`, reading GOOGLE_MAPS_API_KEY from .env.local. */
export function placesDevProxy(): Plugin {
  let env: Record<string, string> = {};

  const middleware = async (req: IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const match = url.pathname.match(/^\/api\/places\/([a-z]+)$/);
    if (!match) return next();

    const result = await handlePlacesRequest(
      {
        action: match[1],
        method: req.method ?? 'GET',
        query: Object.fromEntries(url.searchParams),
        body: req.method === 'POST' ? await readJson(req) : undefined,
        ip: req.socket.remoteAddress,
        origin: req.headers.origin,
      },
      { apiKey: env.GOOGLE_MAPS_API_KEY, allowedOrigins: env.ALLOWED_ORIGINS, log: (m) => console.error(m) },
    );
    res.statusCode = result.status;
    res.setHeader('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
    res.end(JSON.stringify(result.body));
  };

  return {
    name: 'places-dev-proxy',
    config(_, { mode }) {
      // '' prefix: also read non-VITE_ variables. They stay server-side and are never exposed to the client bundle.
      env = loadEnv(mode, process.cwd(), '');
    },
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}
