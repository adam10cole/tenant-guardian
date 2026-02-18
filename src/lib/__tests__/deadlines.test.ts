/**
 * Unit tests for src/lib/deadlines.ts
 *
 * These tests have legal consequences — verify every number against statute.
 * Run with: npm test
 */

import {
  getDeadlineEntry,
  getDeadlineDays,
  computeDeadlineDate,
  isDeadlinePassed,
  daysUntilDeadline,
  getSupportedJurisdictions,
} from '../deadlines';

// -------------------------------------------------------
// getDeadlineDays
// -------------------------------------------------------

describe('getDeadlineDays', () => {
  describe('MI-GENERAL', () => {
    it('returns 24 days for water', () => {
      expect(getDeadlineDays('MI-GENERAL', 'water')).toBe(24);
    });

    it('returns 24 days for heat', () => {
      expect(getDeadlineDays('MI-GENERAL', 'heat')).toBe(24);
    });

    it('returns 30 days for pests', () => {
      expect(getDeadlineDays('MI-GENERAL', 'pests')).toBe(30);
    });

    it('returns 14 days for mold', () => {
      expect(getDeadlineDays('MI-GENERAL', 'mold')).toBe(14);
    });

    it('returns 30 days for structural', () => {
      expect(getDeadlineDays('MI-GENERAL', 'structural')).toBe(30);
    });

    it('returns 24 days for electrical', () => {
      expect(getDeadlineDays('MI-GENERAL', 'electrical')).toBe(24);
    });

    it('returns 24 days for security', () => {
      expect(getDeadlineDays('MI-GENERAL', 'security')).toBe(24);
    });

    it('returns 14 days for sanitation', () => {
      expect(getDeadlineDays('MI-GENERAL', 'sanitation')).toBe(14);
    });

    it('returns 30 days for other', () => {
      expect(getDeadlineDays('MI-GENERAL', 'other')).toBe(30);
    });
  });

  describe('MI-ANN-ARBOR (stricter than state)', () => {
    it('returns 12 days for heat (overrides state 24h)', () => {
      expect(getDeadlineDays('MI-ANN-ARBOR', 'heat')).toBe(12);
    });

    it('returns 12 days for water (overrides state 24h)', () => {
      expect(getDeadlineDays('MI-ANN-ARBOR', 'water')).toBe(12);
    });

    it('returns 14 days for pests (overrides state 30d)', () => {
      expect(getDeadlineDays('MI-ANN-ARBOR', 'pests')).toBe(14);
    });

    it('inherits state deadline for mold (no Ann Arbor override)', () => {
      expect(getDeadlineDays('MI-ANN-ARBOR', 'mold')).toBe(14);
    });
  });

  describe('MI-DETROIT', () => {
    it('returns 24 days for heat', () => {
      expect(getDeadlineDays('MI-DETROIT', 'heat')).toBe(24);
    });

    it('returns 21 days for pests', () => {
      expect(getDeadlineDays('MI-DETROIT', 'pests')).toBe(21);
    });
  });

  describe('unknown jurisdiction', () => {
    it('falls back to MI-GENERAL for known category', () => {
      expect(getDeadlineDays('XX-UNKNOWN', 'water')).toBe(24);
    });

    it('returns null for truly unknown category in unknown jurisdiction', () => {
      // @ts-expect-error testing invalid input
      expect(getDeadlineDays('XX-UNKNOWN', 'nonexistent')).toBeNull();
    });
  });
});

// -------------------------------------------------------
// getDeadlineEntry
// -------------------------------------------------------

describe('getDeadlineEntry', () => {
  it('returns an entry with citation for MI-GENERAL water', () => {
    const entry = getDeadlineEntry('MI-GENERAL', 'water');
    expect(entry).not.toBeNull();
    expect(entry!.citation).toMatch(/MCL/);
    expect(entry!.days).toBe(24);
    expect(entry!.description).toBeTruthy();
  });

  it('returns Ann Arbor citation for MI-ANN-ARBOR heat', () => {
    const entry = getDeadlineEntry('MI-ANN-ARBOR', 'heat');
    expect(entry!.citation).toMatch(/Ann Arbor/);
  });
});

// -------------------------------------------------------
// computeDeadlineDate
// -------------------------------------------------------

describe('computeDeadlineDate', () => {
  const BASE_DATE = '2026-01-01T00:00:00.000Z';

  it('adds the correct number of days', () => {
    const deadline = computeDeadlineDate(BASE_DATE, 14);
    expect(deadline).toBe('2026-01-15T00:00:00.000Z');
  });

  it('adds 1 day correctly', () => {
    const deadline = computeDeadlineDate(BASE_DATE, 1);
    expect(deadline).toBe('2026-01-02T00:00:00.000Z');
  });

  it('handles month boundaries', () => {
    const deadline = computeDeadlineDate('2026-01-28T00:00:00.000Z', 14);
    expect(deadline).toBe('2026-02-11T00:00:00.000Z');
  });

  it('handles year boundaries', () => {
    const deadline = computeDeadlineDate('2025-12-25T00:00:00.000Z', 14);
    expect(deadline).toBe('2026-01-08T00:00:00.000Z');
  });

  it('returns null for invalid date', () => {
    expect(computeDeadlineDate('not-a-date', 14)).toBeNull();
  });

  it('returns null for zero deadline days', () => {
    expect(computeDeadlineDate(BASE_DATE, 0)).toBeNull();
  });

  it('returns null for negative deadline days', () => {
    expect(computeDeadlineDate(BASE_DATE, -1)).toBeNull();
  });
});

// -------------------------------------------------------
// isDeadlinePassed
// -------------------------------------------------------

describe('isDeadlinePassed', () => {
  const PAST = '2020-01-01T00:00:00.000Z';
  const FUTURE = '2030-01-01T00:00:00.000Z';
  const NOW = new Date('2026-01-01T00:00:00.000Z').getTime();

  it('returns true when deadline is in the past', () => {
    expect(isDeadlinePassed(PAST, NOW)).toBe(true);
  });

  it('returns false when deadline is in the future', () => {
    expect(isDeadlinePassed(FUTURE, NOW)).toBe(false);
  });

  it('returns false for null deadline', () => {
    expect(isDeadlinePassed(null, NOW)).toBe(false);
  });
});

// -------------------------------------------------------
// daysUntilDeadline
// -------------------------------------------------------

describe('daysUntilDeadline', () => {
  const NOW = new Date('2026-01-10T00:00:00.000Z').getTime();

  it('returns positive days when deadline is in the future', () => {
    const deadline = '2026-01-20T00:00:00.000Z';
    expect(daysUntilDeadline(deadline, NOW)).toBe(10);
  });

  it('returns negative days when deadline has passed', () => {
    const deadline = '2026-01-05T00:00:00.000Z';
    expect(daysUntilDeadline(deadline, NOW)).toBe(-5);
  });

  it('returns null for null deadline', () => {
    expect(daysUntilDeadline(null, NOW)).toBeNull();
  });

  it('rounds up partial days', () => {
    // 10 hours from now = 1 day (ceil)
    const tenHoursFromNow = new Date(NOW + 10 * 60 * 60 * 1000).toISOString();
    expect(daysUntilDeadline(tenHoursFromNow, NOW)).toBe(1);
  });
});

// -------------------------------------------------------
// getSupportedJurisdictions
// -------------------------------------------------------

describe('getSupportedJurisdictions', () => {
  it('returns an array of strings', () => {
    const jurisdictions = getSupportedJurisdictions();
    expect(Array.isArray(jurisdictions)).toBe(true);
    expect(jurisdictions.length).toBeGreaterThan(0);
  });

  it('includes MI-GENERAL', () => {
    expect(getSupportedJurisdictions()).toContain('MI-GENERAL');
  });

  it('includes MI-ANN-ARBOR', () => {
    expect(getSupportedJurisdictions()).toContain('MI-ANN-ARBOR');
  });
});
