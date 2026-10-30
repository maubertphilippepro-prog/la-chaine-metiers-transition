import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { copierSiDifferent } from './mail-outils';

describe('copie vers SharePoint', () => {
  it('copie, puis ne recopie pas un fichier de même taille', async () => {
    const d = await mkdtemp(path.join(os.tmpdir(), 'pmt-mail-'));
    const source = path.join(d, 'a.mp4');
    const cible = path.join(d, 'sp', 'b.mp4');
    await writeFile(source, 'video');
    expect(await copierSiDifferent(source, cible)).toBe(true);
    expect(await readFile(cible, 'utf-8')).toBe('video');
    expect(await copierSiDifferent(source, cible)).toBe(false);
    await writeFile(source, 'video plus longue');
    expect(await copierSiDifferent(source, cible)).toBe(true);
  });
});
