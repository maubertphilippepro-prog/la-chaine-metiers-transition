import { describe, expect, it } from 'vitest';
import { requeteAutorisee } from './origine';

describe('requeteAutorisee', () => {
  it('accepte Host local sans Origin', () => {
    expect(requeteAutorisee('127.0.0.1:5180', undefined, 5180)).toBe(true);
  });
  it('accepte une Origin locale', () => {
    expect(requeteAutorisee('localhost:5180', 'http://localhost:5180', 5180)).toBe(true);
  });
  it('refuse une Origin étrangère', () => {
    expect(requeteAutorisee('127.0.0.1:5180', 'https://exemple.org', 5180)).toBe(false);
    expect(requeteAutorisee('127.0.0.1:5180', 'null', 5180)).toBe(false);
  });
  it('refuse un Host étranger', () => {
    expect(requeteAutorisee('exemple.org:5180', undefined, 5180)).toBe(false);
  });
});
