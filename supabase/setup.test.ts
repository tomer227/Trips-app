import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
// @ts-expect-error plain .mjs build script without type declarations
import { buildSetup } from '../scripts/build-supabase-setup.mjs';

it('supabase/setup_all.sql is up to date with the migrations (run: node scripts/build-supabase-setup.mjs)', () => {
  expect(readFileSync('supabase/setup_all.sql', 'utf8')).toBe(buildSetup());
});
