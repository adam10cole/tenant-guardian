/**
 * Unit tests for offline sync queue business logic.
 *
 * These tests mock expo-sqlite and the Supabase client
 * to verify the queue state machine in isolation.
 */

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

// Mock expo-file-system (v19 class-based API)
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ exists: true })),
}));

// Mock supabase client
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: { id: 'server-uuid-123' }, error: null }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          lt: jest.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }),
    storage: {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null }),
      }),
    },
  },
}));

// Mock the database client
jest.mock('@/lib/database/client', () => ({
  getDb: jest.fn(),
}));

import { getPendingCount, getFailedEntries } from '../sync/queue';
import { getDb } from '@/lib/database/client';

const mockGetDb = getDb as jest.MockedFunction<typeof getDb>;

function makeMockDb(syncQueueRows: Array<{ count?: number; id?: number; attempts?: number }> = []) {
  return {
    getFirstAsync: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return Promise.resolve({ count: syncQueueRows[0]?.count ?? 0 });
      }
      return Promise.resolve(null);
    }),
    getAllAsync: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('attempts >=')) {
        return Promise.resolve(syncQueueRows.filter((r) => (r.attempts ?? 0) >= 5));
      }
      return Promise.resolve(syncQueueRows);
    }),
    runAsync: jest.fn().mockResolvedValue(undefined),
    execAsync: jest.fn().mockResolvedValue(undefined),
    withTransactionAsync: jest.fn().mockImplementation((fn: () => Promise<void>) => fn()),
  };
}

// -------------------------------------------------------

describe('getPendingCount', () => {
  it('returns 0 when queue is empty', async () => {
    mockGetDb.mockResolvedValue(makeMockDb([{ count: 0 }]) as ReturnType<typeof makeMockDb>);
    expect(await getPendingCount()).toBe(0);
  });

  it('returns the count from the database', async () => {
    mockGetDb.mockResolvedValue(makeMockDb([{ count: 5 }]) as ReturnType<typeof makeMockDb>);
    expect(await getPendingCount()).toBe(5);
  });
});

describe('getFailedEntries', () => {
  it('returns empty array when no entries have failed', async () => {
    mockGetDb.mockResolvedValue(
      makeMockDb([{ id: 1, attempts: 3 }]) as ReturnType<typeof makeMockDb>,
    );
    const failed = await getFailedEntries();
    expect(failed).toHaveLength(0);
  });

  it('returns entries with 5 or more attempts', async () => {
    mockGetDb.mockResolvedValue(
      makeMockDb([
        { id: 1, attempts: 5 },
        { id: 2, attempts: 6 },
        { id: 3, attempts: 3 },
      ]) as ReturnType<typeof makeMockDb>,
    );
    const failed = await getFailedEntries();
    expect(failed).toHaveLength(2);
  });
});
