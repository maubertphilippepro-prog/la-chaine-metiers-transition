import { loadFont } from '@remotion/google-fonts/OpenSans';

export const { fontFamily: police } = loadFont('normal', {
  weights: ['300', '400', '700', '800'],
  subsets: ['latin', 'latin-ext'],
});
