import { environmentManager, hydrate, MutationObserver, QueryClient, type MutationState } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { isFailedUnwatchedSave, keepFailedUnwatchedSaves, restoredMutationMeta, saveMealOptions, type SaveMealInput } from './queries.ts';

// The real client needs the Supabase env vars; these tests never reach the network.
vi.mock('../../lib/supabase.ts', () => ({ supabase: {}, ensureSession: vi.fn() }));

const input: SaveMealInput = { placeId: 'place-1', eatenOn: '2026-10-15', spinCount: 2, decisionSeconds: 30 };
const GC_DEFAULT_MS = 5 * 60 * 1000;

/** A client with the keeper running, and a save request the test fails when it wants to. */
function setup() {
  const client = new QueryClient();
  keepFailedUnwatchedSaves(client);
  let fail: (error: Error) => void = () => {};
  const request = new Promise<void>((_resolve, reject) => {
    fail = reject;
  });
  /** What `useMutation` builds for a screen that saves a meal. */
  const observeSave = () =>
    new MutationObserver<void, Error, SaveMealInput>(client, { mutationKey: saveMealOptions.mutationKey, mutationFn: () => request });
  return { client, request, fail, observeSave };
}

describe('keepFailedUnwatchedSaves', () => {
  // Node counts as a server, where mutations are never garbage collected. Act like the browser.
  beforeAll(() => environmentManager.setIsServer(() => false));
  afterAll(() => environmentManager.setIsServer(() => typeof window === 'undefined'));
  afterEach(() => vi.useRealTimers());

  it('keeps a save that fails after its screen went away, marked for the notice', async () => {
    vi.useFakeTimers();
    const { client, fail, observeSave } = setup();
    const observer = observeSave();
    const unsubscribe = observer.subscribe(() => {});
    const done = observer.mutate(input).catch(() => {});
    // The home screen is left while the save waits for the connection.
    unsubscribe();

    fail(new Error('Failed to fetch'));
    await done;
    // Well past the default garbage collection of an unwatched mutation.
    await vi.advanceTimersByTimeAsync(2 * GC_DEFAULT_MS);

    const kept = client.getMutationCache().getAll();
    expect(kept).toHaveLength(1);
    expect(isFailedUnwatchedSave(kept[0]!)).toBe(true);
    expect(kept[0]!.meta).toEqual({ leftBehind: true });
    expect(kept[0]!.state.variables).toEqual(input);
    expect(kept[0]!.state.error?.message).toBe('Failed to fetch');
  });

  it('leaves a save that fails in front of its result card to the card', async () => {
    const { client, fail, observeSave } = setup();
    const observer = observeSave();
    observer.subscribe(() => {});
    const done = observer.mutate(input).catch(() => {});

    fail(new Error('Failed to fetch'));
    await done;

    expect(observer.getCurrentResult().error?.message).toBe('Failed to fetch');
    expect(client.getMutationCache().findAll({ predicate: isFailedUnwatchedSave })).toHaveLength(0);
  });

  it('does not touch a restored save, which is already marked', async () => {
    const { client, request, fail } = setup();
    client.setMutationDefaults(saveMealOptions.mutationKey, { mutationFn: () => request });
    const paused: MutationState<void, Error, SaveMealInput, unknown> = {
      context: undefined,
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isPaused: true,
      status: 'pending',
      variables: input,
      submittedAt: 0,
    };
    hydrate(
      client,
      { mutations: [{ mutationKey: saveMealOptions.mutationKey, state: paused }], queries: [] },
      { defaultOptions: { mutations: { meta: restoredMutationMeta, gcTime: Infinity } } },
    );
    const [restored] = client.getMutationCache().getAll();

    const resumed = client.resumePausedMutations();
    fail(new Error('Failed to fetch'));
    await resumed;

    expect(client.getMutationCache().getAll()).toEqual([restored]);
    expect(isFailedUnwatchedSave(restored!)).toBe(true);
  });
});
