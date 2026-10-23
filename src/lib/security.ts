import { randomInt } from 'node:crypto';

// No 0/O, 1/I/L: codes are read off paper or a screen.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8; // 31^8 ≈ 8.5e11; with bcrypt + lockout that is plenty

export function generateLoginCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function formatParticipantId(number: number): string {
  return `P${number}`;
}

export function parseParticipantId(input: string): number | null {
  const match = /^P?(\d{1,6})$/i.exec(input.trim());
  return match ? Number(match[1]) : null;
}

const SECRET_KEY = /code|password|token|secret/i;

// Drops secret-looking fields before a value is written to the audit log.
export function redactSecrets(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEY.test(key)));
}
