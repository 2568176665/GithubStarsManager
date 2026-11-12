/** Sanitization vectors for strings, objects, and error messages. */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sanitizeError, sanitizeForLog } from './logSanitizer';

const VECTORS = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'fixtures', 'sanitization-vectors.json'), 'utf8'),
) as {
  strings: { name: string; input: string; expected: string }[];
  objects: { name: string; input: unknown; expected: unknown }[];
  errorMessages: { name: string; input: string; expected: string }[];
};

describe('logSanitizer sanitization vectors', () => {
  for (const vector of VECTORS.strings) {
    it(`string: ${vector.name}`, () => {
      expect(sanitizeForLog(vector.input)).toBe(vector.expected);
    });
  }

  for (const vector of VECTORS.objects) {
    it(`object: ${vector.name}`, () => {
      expect(sanitizeForLog(vector.input)).toEqual(vector.expected);
    });
  }

  for (const vector of VECTORS.errorMessages) {
    it(`error text: ${vector.name}`, () => {
      expect(sanitizeError(new Error(vector.input)).message).toBe(vector.expected);
      expect(sanitizeError(vector.input).message).toBe(vector.expected);
    });
  }
});
