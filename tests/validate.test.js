import { describe, it, expect } from 'vitest';
import { isValidDate, isValidLogRow, isPositiveInt, isValidWeight } from '../functions/api/_validate.js';

describe('isValidDate', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(isValidDate('2026-10-14')).toBe(true);
  });
  it('rejects other shapes', () => {
    expect(isValidDate('2026/10/14')).toBe(false);
    expect(isValidDate('20261014')).toBe(false);
    expect(isValidDate('')).toBe(false);
    expect(isValidDate(20261014)).toBe(false);
    expect(isValidDate(null)).toBe(false);
  });
});

describe('isValidLogRow', () => {
  const row = { plan_exercise_id: 1, set_no: 2, weight: 22.5, reps: 10 };
  it('accepts a normal row and an empty-weight row', () => {
    expect(isValidLogRow(row)).toBe(true);
    expect(isValidLogRow({ ...row, weight: null, reps: null })).toBe(true);
  });
  it('rejects bad ids', () => {
    expect(isValidLogRow({ ...row, plan_exercise_id: 0 })).toBe(false);
    expect(isValidLogRow({ ...row, plan_exercise_id: '1' })).toBe(false);
    expect(isValidLogRow({ ...row, set_no: 1.5 })).toBe(false);
    expect(isValidLogRow(null)).toBe(false);
  });
  it('rejects out-of-range or wrongly typed values', () => {
    expect(isValidLogRow({ ...row, weight: -5 })).toBe(false);
    expect(isValidLogRow({ ...row, weight: 2000 })).toBe(false);
    expect(isValidLogRow({ ...row, weight: '25' })).toBe(false);
    expect(isValidLogRow({ ...row, reps: 1.2 })).toBe(false);
    expect(isValidLogRow({ ...row, reps: NaN })).toBe(false);
  });
});

describe('isPositiveInt', () => {
  it('accepts positive integers', () => {
    expect(isPositiveInt(1)).toBe(true);
    expect(isPositiveInt(42)).toBe(true);
  });
  it('rejects zero, negatives, floats, strings, non-numbers', () => {
    expect(isPositiveInt(0)).toBe(false);
    expect(isPositiveInt(-1)).toBe(false);
    expect(isPositiveInt(1.5)).toBe(false);
    expect(isPositiveInt('1')).toBe(false);
    expect(isPositiveInt(NaN)).toBe(false);
    expect(isPositiveInt(null)).toBe(false);
  });
});

describe('isValidWeight', () => {
  it('accepts a realistic weight', () => {
    expect(isValidWeight(72.5)).toBe(true);
    expect(isValidWeight(0.5)).toBe(true);
    expect(isValidWeight(500)).toBe(true);
  });
  it('rejects zero, negatives, oversize, NaN, strings', () => {
    expect(isValidWeight(0)).toBe(false);
    expect(isValidWeight(-5)).toBe(false);
    expect(isValidWeight(501)).toBe(false);
    expect(isValidWeight(NaN)).toBe(false);
    expect(isValidWeight(Infinity)).toBe(false);
    expect(isValidWeight('72')).toBe(false);
    expect(isValidWeight(null)).toBe(false);
  });
});
