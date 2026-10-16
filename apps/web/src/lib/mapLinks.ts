/**
 * Plain URL links to map services. These are not API calls, so nothing from
 * the map providers is stored (their APIs forbid storing responses).
 */
export interface MapTarget {
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
}

/** "(수내동)" or "수내동 12-3" → "수내동". Helps map search find the right branch. */
function neighbourhood(address: string | null): string | null {
  return address?.match(/([가-힣0-9]+동)(?:[\s,)]|$)/)?.[1] ?? null;
}

function searchQuery(target: MapTarget): string {
  const area = neighbourhood(target.address);
  return area ? `${target.name} ${area}` : target.name;
}

export function kakaoMapUrl(target: MapTarget): string {
  if (target.lat !== null && target.lng !== null) {
    // The link format is "name,lat,lng", so commas in the name must go.
    const name = target.name.replaceAll(',', ' ');
    return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${target.lat},${target.lng}`;
  }
  return `https://map.kakao.com/link/search/${encodeURIComponent(searchQuery(target))}`;
}

/** Searches by the place name alone; nothing else is added to the query. */
export function naverMapUrl(target: MapTarget): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(target.name)}`;
}
