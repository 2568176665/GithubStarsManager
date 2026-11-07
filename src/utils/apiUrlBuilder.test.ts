import { describe, expect, it } from 'vitest';

import { buildFinalApiUrl } from './apiUrlBuilder';

describe('buildFinalApiUrl for openai-compatible', () => {
  it('completes a bare version root to the chat completions endpoint', () => {
    expect(buildFinalApiUrl('https://example.test/v1', 'openai-compatible'))
      .toBe('https://example.test/v1/chat/completions');
  });

  it('ignores trailing slashes on a bare version root', () => {
    expect(buildFinalApiUrl('https://example.test/v1/', 'openai-compatible'))
      .toBe('https://example.test/v1/chat/completions');
    expect(buildFinalApiUrl('https://example.test/v1///', 'openai-compatible'))
      .toBe('https://example.test/v1/chat/completions');
  });

  it('completes beta and alpha version roots', () => {
    expect(buildFinalApiUrl('https://example.test/v1beta', 'openai-compatible'))
      .toBe('https://example.test/v1beta/chat/completions');
    expect(buildFinalApiUrl('https://example.test/v2alpha', 'openai-compatible'))
      .toBe('https://example.test/v2alpha/chat/completions');
  });

  it('preserves a query string such as api-version', () => {
    expect(buildFinalApiUrl('https://example.test/v1?api-version=2024-02-01', 'openai-compatible'))
      .toBe('https://example.test/v1/chat/completions?api-version=2024-02-01');
  });

  it('leaves a full endpoint untouched', () => {
    expect(buildFinalApiUrl('https://example.test/v1/chat/completions', 'openai-compatible'))
      .toBe('https://example.test/v1/chat/completions');
  });

  it('leaves a nested v1 path untouched', () => {
    expect(buildFinalApiUrl('https://example.test/api/v1', 'openai-compatible'))
      .toBe('https://example.test/api/v1');
    expect(buildFinalApiUrl('https://example.test/invoke/v1', 'openai-compatible'))
      .toBe('https://example.test/invoke/v1');
  });

  it('leaves a host root untouched', () => {
    expect(buildFinalApiUrl('https://example.test/', 'openai-compatible'))
      .toBe('https://example.test');
  });

  it('falls back to plain trimming for values that are not absolute URLs', () => {
    expect(buildFinalApiUrl('not a url/v1', 'openai-compatible'))
      .toBe('not a url/v1');
  });
});

describe('buildFinalApiUrl for other API types', () => {
  it('appends the chat completions path for openai and deepseek', () => {
    expect(buildFinalApiUrl('https://example.test', 'openai'))
      .toBe('https://example.test/v1/chat/completions');
    expect(buildFinalApiUrl('https://example.test', 'deepseek'))
      .toBe('https://example.test/v1/chat/completions');
  });

  it('appends the responses path for openai-responses', () => {
    expect(buildFinalApiUrl('https://example.test', 'openai-responses'))
      .toBe('https://example.test/v1/responses');
  });

  it('keeps the model placeholder for gemini', () => {
    // `new URL()` percent-encodes the braces; aiService substitutes the model
    // into this template before the request is sent, so this is expected.
    expect(buildFinalApiUrl('https://example.test', 'gemini'))
      .toBe('https://example.test/v1beta/models/%7Bmodel%7D:generateContent');
  });
});
