// Usage (from the repo root): pnpm import:places <absolute csv path>...
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (scripts/import-places/.env, git-ignored).
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { decodeCp949, parseCsv } from './csv.ts';
import { transformRows, type PlaceRecord } from './transform.ts';

const DISTRICT = '성남시 분당구';

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error('Pass one or more CSV files');

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: config, error: configError } = await db
    .from('app_config')
    .select('base_lat, base_lng, radius_m')
    .single();
  if (configError) throw configError;
  const options = {
    district: DISTRICT,
    base: { lat: config.base_lat as number, lng: config.base_lng as number },
    radiusM: config.radius_m as number,
  };

  const records = new Map<string, PlaceRecord>();
  const deactivate = new Set<string>();
  for (const file of files) {
    const { records: fileRecords, deactivateSourceIds, stats } = transformRows(
      parseCsv(decodeCp949(readFileSync(file))),
      options,
    );
    fileRecords.forEach((r) => records.set(r.source_id, r));
    deactivateSourceIds.forEach((id) => deactivate.add(id));
    console.log(basename(file), stats);
  }

  const { data, error } = await db.rpc('import_places', {
    p_records: [...records.values()],
    // The DB parameter is named for closed rows; it deactivates any listed public row.
    p_closed_ids: [...deactivate],
    p_file_name: files.map((f) => basename(f)).join(', '),
  });
  if (error) throw error;
  console.log('import_places:', data);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
