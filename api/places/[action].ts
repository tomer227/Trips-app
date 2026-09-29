/** Vercel Serverless Function: /api/places/<action>. Set GOOGLE_MAPS_API_KEY in the project's env vars. */
import { handlePlacesRequest } from '../../server/places';

interface VercelRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelResponse {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const query: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.query)) query[k] = first(v);

  const result = await handlePlacesRequest(
    {
      action: query.action ?? '',
      method: req.method ?? 'GET',
      query,
      body: typeof req.body === 'string' ? safeJson(req.body) : req.body,
      ip: first(req.headers['x-forwarded-for'])?.split(',')[0]?.trim(),
      origin: first(req.headers.origin),
    },
    { apiKey: process.env.GOOGLE_MAPS_API_KEY, allowedOrigins: process.env.ALLOWED_ORIGINS, log: (m) => console.error(m) },
  );

  for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
  res.status(result.status).json(result.body);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
