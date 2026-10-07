import { loadFont } from '@remotion/google-fonts/OpenSans';

export const { fontFamily: police } = loadFont('normal', {
  weights: ['400', '700'],
  subsets: ['latin', 'latin-ext'],
});
