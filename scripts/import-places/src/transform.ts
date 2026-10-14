import { distanceMeters, type LatLng } from '@lunch/core';
import { isKnownBusinessType, toCategory } from './categories.ts';
import { epsg5174ToWgs84 } from './coords.ts';

export const OPEN_STATUS = '영업/정상';
export const CLOSED_STATUS = '폐업';

export interface ImportOptions {
  /** Address fragment that limits the import area, e.g. "성남시 분당구". */
  district: string;
  base: LatLng;
  radiusM: number;
}

/** Shape sent to the import_places database function. */
export interface PlaceRecord {
  source_id: string;
  name: string;
  category: string;
  category_raw: string;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
}

export interface ImportStats {
  rowsRead: number;
  outsideDistrict: number;
  closed: number;
  otherStatus: number;
  missingCoords: number;
  excluded: number;
  outsideRadius: number;
  accepted: number;
  unknownBusinessTypes: Record<string, number>;
}

export interface TransformResult {
  records: PlaceRecord[];
  /** 관리번호 of closed businesses in the district, used to deactivate existing rows. */
  closedSourceIds: string[];
  stats: ImportStats;
}

const REQUIRED_COLUMNS = [
  '관리번호',
  '사업장명',
  '업태구분명',
  '영업상태명',
  '도로명주소',
  '지번주소',
  '전화번호',
  '좌표정보(X)',
  '좌표정보(Y)',
] as const;
type Column = (typeof REQUIRED_COLUMNS)[number];

export function transformRows(table: string[][], options: ImportOptions): TransformResult {
  const [header, ...rows] = table;
  if (!header) throw new Error('CSV is empty');
  const index = new Map(header.map((name, i) => [name.trim(), i]));
  const missing = REQUIRED_COLUMNS.filter((c) => !index.has(c));
  if (missing.length > 0) throw new Error(`CSV is missing columns: ${missing.join(', ')}`);
  const get = (row: string[], column: Column) => (row[index.get(column)!] ?? '').trim();

  const stats: ImportStats = {
    rowsRead: 0,
    outsideDistrict: 0,
    closed: 0,
    otherStatus: 0,
    missingCoords: 0,
    excluded: 0,
    outsideRadius: 0,
    accepted: 0,
    unknownBusinessTypes: {},
  };
  const records: PlaceRecord[] = [];
  const closedSourceIds: string[] = [];

  for (const row of rows) {
    if (row.length === 1 && row[0] === '') continue; // trailing blank line
    stats.rowsRead += 1;

    const roadAddress = get(row, '도로명주소');
    const lotAddress = get(row, '지번주소');
    if (!`${roadAddress} ${lotAddress}`.includes(options.district)) {
      stats.outsideDistrict += 1;
      continue;
    }

    const status = get(row, '영업상태명');
    if (status === CLOSED_STATUS) {
      stats.closed += 1;
      closedSourceIds.push(get(row, '관리번호'));
      continue;
    }
    if (status !== OPEN_STATUS) {
      stats.otherStatus += 1;
      continue;
    }

    const x = Number.parseFloat(get(row, '좌표정보(X)'));
    const y = Number.parseFloat(get(row, '좌표정보(Y)'));
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      stats.missingCoords += 1;
      continue;
    }

    const businessType = get(row, '업태구분명');
    const name = get(row, '사업장명');
    const category = toCategory(businessType, name);
    if (!isKnownBusinessType(businessType)) {
      stats.unknownBusinessTypes[businessType] = (stats.unknownBusinessTypes[businessType] ?? 0) + 1;
    }
    if (category === null) {
      stats.excluded += 1;
      continue;
    }

    const position = epsg5174ToWgs84(x, y);
    if (distanceMeters(options.base, position) > options.radiusM) {
      stats.outsideRadius += 1;
      continue;
    }

    stats.accepted += 1;
    records.push({
      source_id: get(row, '관리번호'),
      name,
      category,
      category_raw: businessType,
      lat: position.lat,
      lng: position.lng,
      address: roadAddress || lotAddress || null,
      phone: get(row, '전화번호') || null,
    });
  }

  return { records, closedSourceIds, stats };
}
