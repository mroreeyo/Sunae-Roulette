// Copies packages/core/src into supabase/functions/_shared/core. The Edge Runtime only sees
// files under supabase/functions, so create-room imports this copy (TRD: packages/core in Deno).
// Run through `pnpm functions:serve` / `pnpm functions:deploy`; the copy is git-ignored.
import { cpSync, rmSync } from 'node:fs';

const from = new URL('../packages/core/src/', import.meta.url);
const to = new URL('../supabase/functions/_shared/core/', import.meta.url);

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true, filter: (path) => !path.endsWith('.test.ts') });
console.log(`Copied packages/core into ${to.pathname}`);
