/** Netlify Function (v2): served at /api/places/<action>. Set GOOGLE_MAPS_API_KEY in the site's env vars. */
import { handlePlacesRequest } from '../../server/places';

export const config = { path: '/api/places/:action' };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query: Record<string, string | undefined> = Object.fromEntries(url.searchParams);
  const action = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const body = req.method === 'POST' ? await req.json().catch(() => undefined) : undefined;

  const result = await handlePlacesRequest(
    {
      action,
      method: req.method,
      query,
      body,
      ip: req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
      origin: req.headers.get('origin') ?? undefined,
    },
    { apiKey: process.env.GOOGLE_MAPS_API_KEY, allowedOrigins: process.env.ALLOWED_ORIGINS, log: (m) => console.error(m) },
  );

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json', ...result.headers },
  });
}
