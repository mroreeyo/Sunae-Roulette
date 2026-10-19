import type { RealtimeChannel, RealtimeSystemPayload } from '@supabase/supabase-js';

/**
 * Subscribes `channel` and calls `refresh` whenever it may have missed changes.
 *
 * Realtime does not replay changes made before a channel joined or while it was reconnecting, so
 * the data is fetched again once the join is acknowledged. The server acknowledges the join before
 * it has created the Postgres Changes subscription behind it, though, and never sends changes
 * committed in between: a few milliseconds normally, but seconds when it restarts replication
 * after sitting idle (a guest who joined then stayed hidden until the next poll). The server
 * announces the live subscription with a `system` message, so the data is fetched again then too.
 */
export function subscribeWithRefresh(channel: RealtimeChannel, refresh: () => void): RealtimeChannel {
  return channel
    .on('system', {}, (payload: RealtimeSystemPayload) => {
      if (payload.extension === 'postgres_changes' && payload.status === 'ok') refresh();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') refresh();
    });
}
