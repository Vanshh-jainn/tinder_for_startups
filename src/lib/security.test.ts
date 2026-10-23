import { describe, expect, it } from 'vitest';
import { generateLoginCode, normaliseCode, parseParticipantId, redactSecrets } from './security';

describe('generateLoginCode', () => {
  it('is 8 chars from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) expect(generateLoginCode()).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
  });

  it('does not repeat', () => {
    const codes = new Set(Array.from({ length: 1000 }, generateLoginCode));
    expect(codes.size).toBe(1000);
  });
});

describe('normaliseCode', () => {
  it('ignores case, spaces and dashes', () => {
    expect(normaliseCode(' abcd-23 45 ')).toBe('ABCD2345');
  });
});

describe('parseParticipantId', () => {
  it('accepts P12, p12 and 12', () => {
    expect(parseParticipantId('P12')).toBe(12);
    expect(parseParticipantId(' p12 ')).toBe(12);
    expect(parseParticipantId('12')).toBe(12);
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'P', 'X12', 'P1 2', '12a', 'P1234567']) expect(parseParticipantId(bad)).toBeNull();
  });
});

describe('redactSecrets', () => {
  it('drops secret fields and keeps the rest', () => {
    expect(
      redactSecrets({ id: '1', display_name: 'A', code_hash: 'x', login_code: 'y', password: 'z', token_hash: 't' }),
    ).toEqual({ id: '1', display_name: 'A' });
  });

  it('maps empty to null', () => {
    expect(redactSecrets(undefined)).toBeNull();
  });
});
