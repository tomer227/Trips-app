export type RegionId = 'asia' | 'south-america';

export interface Region {
  id: RegionId;
  name: string;
  emoji: string;
  tagline: string;
  intro: string;
  classicRoute: string[];
  recommendedLength: string;
}

export interface Country {
  id: string;
  region: RegionId;
  name: string;
  flag: string;
  /** Short one-liner shown on cards */
  vibe: string;
  /** Backpacker daily budget in USD: [low, comfortable] */
  dailyBudget: [number, number];
  currency: string;
  visa: string;
  bestSeason: string;
  language: string;
  plugs: string;
  emergency: string;
  highlights: { name: string; desc: string }[];
  tips: string[];
  chabad: boolean;
  /** Suggested number of days for a typical trip */
  suggestedDays: number;
}
