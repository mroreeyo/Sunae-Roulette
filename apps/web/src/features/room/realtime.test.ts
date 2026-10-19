import type { RealtimeChannel } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { subscribeWithRefresh } from './realtime.ts';

/** A channel that hands its system listener and subscribe callback back to the test. */
function fakeChannel() {
  const handlers: { system?: (payload: unknown) => void; status?: (status: string) => void } = {};
  const channel = {
    on: (type: string, _filter: unknown, callback: (payload: unknown) => void) => {
      if (type === 'system') handlers.system = callback;
      return channel;
    },
    subscribe: (callback: (status: string) => void) => {
      handlers.status = callback;
      return channel;
    },
  };
  return { channel: channel as unknown as RealtimeChannel, handlers };
}

describe('subscribeWithRefresh', () => {
  it('refreshes when the join is acknowledged and again when the Postgres subscription is live', () => {
    const { channel, handlers } = fakeChannel();
    const refresh = vi.fn();
    subscribeWithRefresh(channel, refresh);

    handlers.status!('SUBSCRIBED');
    expect(refresh).toHaveBeenCalledTimes(1);
    handlers.system!({ extension: 'postgres_changes', status: 'ok', message: 'Subscribed to PostgreSQL', channel: 'room:1' });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('ignores other statuses and system messages', () => {
    const { channel, handlers } = fakeChannel();
    const refresh = vi.fn();
    subscribeWithRefresh(channel, refresh);

    handlers.status!('CHANNEL_ERROR');
    handlers.status!('TIMED_OUT');
    handlers.system!({ extension: 'postgres_changes', status: 'error', message: 'Subscribing to PostgreSQL failed', channel: 'room:1' });
    handlers.system!({ extension: 'system', status: 'ok', message: 'Replication connection established', channel: 'room:1' });
    expect(refresh).not.toHaveBeenCalled();
  });
});
