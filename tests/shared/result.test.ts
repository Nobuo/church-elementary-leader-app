import { describe, it, expect } from 'vitest';
import { ok, err, map, flatMap, Result } from '@shared/result';

describe('Result', () => {
  it('ok creates a success result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('err creates a failure result', () => {
    const result = err('something went wrong');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('something went wrong');
    }
  });

  it('map transforms value on success', () => {
    const result = map(ok(5), (x) => x * 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(10);
  });

  it('map passes through error', () => {
    const result = map(err('fail') as Result<number>, (x) => x * 2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('fail');
  });

  it('flatMap chains on success', () => {
    const result = flatMap(ok(5), (x) => (x > 0 ? ok(x * 2) : err('negative')));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(10);
  });

  it('flatMap passes through error', () => {
    const result = flatMap(err('fail') as Result<number>, (x) => ok(x * 2));
    expect(result.ok).toBe(false);
  });
});
