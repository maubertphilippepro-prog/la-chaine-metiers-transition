import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { reduireImage } from './images';

describe('reduireImage', () => {
  it('réduit une grande image en JPEG base64', async () => {
    const dossier = await mkdtemp(path.join(os.tmpdir(), 'pmt-image-'));
    const source = path.join(dossier, 'grande.png');
    execFileSync('python', ['-c', `from PIL import Image; Image.new("RGBA", (2000, 1000), (255, 0, 0, 128)).save(r"${source}")`]);
    const image = await reduireImage(source);
    expect(image?.media_type).toBe('image/jpeg');
    expect(image?.nom).toBe('grande.png');
    const octets = Buffer.from(image!.data, 'base64');
    expect(octets.subarray(0, 2).toString('hex')).toBe('ffd8');
  });
  it('ignore les SVG', async () => {
    expect(await reduireImage('logo.svg')).toBeNull();
  });
});
