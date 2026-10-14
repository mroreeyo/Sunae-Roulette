import proj4 from 'proj4';
import type { LatLng } from '@lunch/core';

/**
 * EPSG:5174 (Korean 1985 / Modified Central Belt) with the standard Bessel→WGS84 shift.
 * Checked on 2026-10-14 against shops named after 수내·정자·서현역: median distance to
 * the station was 170–240 m, versus 390–490 m without the datum shift and 250–430 m
 * with EPSG:2097.
 */
export const EPSG_5174 =
  '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 ' +
  '+ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43';

const converter = proj4(EPSG_5174, 'WGS84');

export function epsg5174ToWgs84(x: number, y: number): LatLng {
  const [lng, lat] = converter.forward([x, y]);
  if (lng === undefined || lat === undefined) throw new Error(`Coordinate conversion failed: ${x}, ${y}`);
  return { lat, lng };
}
