/**
 * Plain URL links to map services. These are not API calls, so nothing from
 * the map providers is stored (their APIs forbid storing responses).
 */
export interface MapTarget {
  name: string;
}

/** Searches by the place name alone; nothing else is added to the query. */
export function kakaoMapUrl(target: MapTarget): string {
  return `https://map.kakao.com/link/search/${encodeURIComponent(target.name)}`;
}

/** Searches by the place name alone; nothing else is added to the query. */
export function naverMapUrl(target: MapTarget): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(target.name)}`;
}
