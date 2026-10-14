/** Calendar date in Asia/Seoul, formatted as YYYY-MM-DD. */
export type IsoDate = string;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place {
  id: string;
  name: string;
  /** Top-level category such as 한식, 일식, 중식. */
  category: string;
  /** Null for manually added places whose location is unknown. */
  lat: number | null;
  lng: number | null;
  isActive: boolean;
}

export interface Meal {
  placeId: string;
  /** Carried on the meal so history still works after a place is deactivated. */
  category: string;
  eatenOn: IsoDate;
}

export interface PlacePref {
  placeId: string;
  isFavorite: boolean;
  isHidden: boolean;
  tags: readonly string[];
}

export interface Filters {
  maxWalkMinutes?: number;
  excludedCategories?: readonly string[];
  /** Empty or missing means every category is allowed. */
  includedCategories?: readonly string[];
  /** Places without any tags still pass, because most places start untagged. */
  requiredTags?: readonly string[];
}

/** Returns a float in [0, 1), like Math.random. */
export type Rng = () => number;
