import type { PPTElementOutline, PPTElementShadow } from '@openmaic/dsl';

export interface PresetTheme {
  background: string;
  fontColor: string;
  fontname: string;
  colors: string[];
  borderColor?: string;
  outline?: PPTElementOutline;
  shadow?: PPTElementShadow;
}

export const PRESET_THEMES: PresetTheme[] = [
  {
    background: '#CCD3BA',
    fontColor: '#B7F03E',
    borderColor: '#3C3C36',
    fontname: 'IBM Plex Sans',
    colors: ['#B7F03E', '#F3EEDD', '#8B967C', '#5E6656', '#C3CCAE'],
    outline: { color: '#3C3C36', width: 1, style: 'solid' },
  },
];
