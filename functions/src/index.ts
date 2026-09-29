/**
 * Firebase Cloud Function (2nd gen) for /api/places/*.
 * Firebase Hosting rewrites /api/places/** to this function (see firebase.json).
 * Bundled together with server/places.ts by `npm run build:functions` into functions/index.js.
 *
 * Secret:  firebase functions:secrets:set GOOGLE_MAPS_API_KEY
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { handlePlacesRequest } from '../../server/places';

const apiKey = defineSecret('GOOGLE_MAPS_API_KEY');
const allowedOrigins = defineString('ALLOWED_ORIGINS', { default: '' });

const first = (v: unknown): string | undefined => (Array.isArray(v) ? first(v[0]) : typeof v === 'string' ? v : undefined);

export const places = onRequest(
  // maxInstances caps cost if someone floods the endpoint.
  { secrets: [apiKey], region: 'europe-west1', maxInstances: 3, memory: '256MiB', timeoutSeconds: 30 },
  async (req, res) => {
    const query: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.query)) query[k] = first(v);

    const result = await handlePlacesRequest(
      {
        action: req.path.split('/').filter(Boolean).pop() ?? '',
        method: req.method,
        query,
        body: req.body,
        ip: first(req.headers['x-forwarded-for'])?.split(',')[0]?.trim() ?? req.ip,
        origin: first(req.headers.origin),
      },
      { apiKey: apiKey.value(), allowedOrigins: allowedOrigins.value(), log: (m: string) => console.error(m) },
    );

    for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
    res.status(result.status).json(result.body);
  },
);
