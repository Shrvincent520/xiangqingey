export type ContentBlockType = 'text' | 'image';

export interface HeaderImage {
  id: string;
  url: string;
  crop?: {
    x: number;
    y: number;
    scale: number;
  };
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  value: string; // text content (HTML) or image url
  style?: {
    height?: number; // In pixels. 0 or undefined means 'auto'
    objectPosition?: 'top' | 'center' | 'bottom'; // Defaults to 'center'
    textAlign?: 'left' | 'center' | 'right' | 'justify'; // Defaults to 'justify'
  };
}

export interface PosterDetail {
  id: string;
  label: string;
  value: string;
  style?: {
    textAlign?: 'left' | 'center' | 'right' | 'justify';
  };
}

export interface PosterData {
  subTitle: string;
  details: PosterDetail[];
  marketingCopy: string;
  content: ContentBlock[];
}

export interface ImageConfig {
  url: string | null;
  x: number;
  y: number;
  scale: number;
}