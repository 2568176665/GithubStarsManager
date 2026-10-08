import { beforeEach, describe, expect, it } from 'vitest';
import { logger } from './logger';
import type { LogEntry } from './logger';

function lastEntry(): LogEntry {
  const entries = logger.getEntries();
  expect(entries.length).toBeGreaterThan(0);
  return entries[entries.length - 1];
}

describe('logger', () => {
  beforeEach(() => {
    logger.clear();
    logger.setLevel('info');
  });

  it('serializes nested Error values with sanitized name, message, and stack', () => {
    const token = `ghp_${'a'.repeat(36)}`;
    logger.warn('githubApi', 'request failed', {
      nested: { error: new TypeError(`boom with ${token}`) },
      errors: [new Error('timeout')],
    });

    const data = lastEntry().data as {
      nested: { error: { name?: string; message?: string; stack?: string } };
      errors: Array<{ name?: string; message?: string; stack?: string }>;
    };
    expect(data.nested.error.name).toBe('TypeError');
    expect(data.nested.error.message).toContain('***aaaa');
    expect(data.nested.error.message).not.toContain(token);
    expect(typeof data.nested.error.stack).toBe('string');
    expect(data.errors[0].message).toBe('timeout');
  });

  it('preserves DOMException name and message', () => {
    logger.warn('net', 'request aborted', new DOMException('signal is aborted', 'AbortError'));

    expect(lastEntry().data).toMatchObject({
      name: 'AbortError',
      message: 'signal is aborted',
    });
  });

  it('redacts credentials embedded in Error text and caps custom names and stacks', () => {
    const error = new Error('request to https://api.example.com/v1?token=supersecret99 failed');
    error.name = `TokenLeak ghp_${'a'.repeat(36)}`;
    error.stack = 'stack line\n'.repeat(1000);
    logger.warn('net', 'request failed', error);

    const data = lastEntry().data as { name: string; message: string; stack: string };
    expect(data.message).toContain('token=***');
    expect(data.message).not.toContain('supersecret99');
    expect(data.name).toContain('***aaaa');
    expect(data.name.length).toBeLessThanOrEqual(120);
    expect(data.stack.length).toBe(8000);
  });

  it('keeps enumerable Error fields and sanitizes them', () => {
    const error = Object.assign(new Error('failed'), { code: 'ETIMEDOUT', token: 'value-token-123456' });
    logger.warn('githubApi', 'request failed', error);

    expect(lastEntry().data).toMatchObject({
      code: 'ETIMEDOUT',
      token: '***3456',
      name: 'Error',
      message: 'failed',
    });
  });

  it('keeps circular non-Error data loggable', () => {
    const circular: Record<string, unknown> = { name: 'root' };
    circular.self = circular;
    logger.info('app', 'circular data', circular);

    expect(lastEntry().data).toMatchObject({ name: 'root', self: '[Circular]' });
  });
});
