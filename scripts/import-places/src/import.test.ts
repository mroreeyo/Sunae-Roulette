import { describe, expect, it } from 'vitest';
import { isKnownBusinessType, toCategory } from './categories.ts';
import { epsg5174ToWgs84 } from './coords.ts';
import { parseCsv } from './csv.ts';
import { transformRows } from './transform.ts';

describe('parseCsv', () => {
  it('handles quoted commas, escaped quotes and CRLF', () => {
    const text = 'a,b,c\r\n"1,2","say ""hi""",3\r\nx,,z\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1,2', 'say "hi"', '3'],
      ['x', '', 'z'],
    ]);
  });
});

describe('toCategory', () => {
  it('maps licence business types to app categories', () => {
    expect(toCategory('한식', '소월곰탕')).toBe('한식');
    expect(toCategory('횟집', '수내어촌')).toBe('일식');
    expect(toCategory('패밀리레스트랑', '알레피자&파스타')).toBe('양식');
    expect(toCategory('외국음식전문점(인도,태국등)', '란반 정자역점')).toBe('아시안');
  });

  it('excludes drinking places, cafes and convenience stores', () => {
    expect(toCategory('호프/통닭', '김복남맥주')).toBeNull();
    expect(toCategory('커피숍', '사과나무')).toBeNull();
    expect(toCategory('편의점', 'GS25 분당중앙점')).toBeNull();
  });

  it('excludes cafes hidden under generic business types by name', () => {
    expect(toCategory('기타', '메가엠지씨커피 분당느티마을점')).toBeNull();
    expect(toCategory('패스트푸드', '할리스커피숍(양지점)')).toBeNull();
    expect(toCategory('기타', '포케올데이 서현역점')).toBe('기타');
  });

  it('excludes PC rooms, poker pubs and bars that hold a restaurant licence', () => {
    expect(toCategory('기타', '레벨업 pc방 수내점')).toBeNull();
    expect(toCategory('기타', '피씨테그(PC-TAG 수내역점)')).toBeNull();
    expect(toCategory('기타', 'ABC 홀덤펍')).toBeNull();
    expect(toCategory('기타', '야화혼술바 분당수내점')).toBeNull();
    expect(toCategory('기타', '백스비어 분당수내점')).toBeNull();
    expect(toCategory('기타', '신전떡볶이 수내점')).toBe('기타');
    expect(toCategory('기타', '샐러디수내점')).toBe('기타');
  });

  it('falls back to 기타 for unknown business types', () => {
    expect(toCategory('새로운업태', '식당')).toBe('기타');
    expect(isKnownBusinessType('새로운업태')).toBe(false);
    expect(isKnownBusinessType('한식')).toBe(true);
  });
});

describe('epsg5174ToWgs84', () => {
  it('converts a shop near 수내역 to the expected WGS84 position', () => {
    // 화덕생선구이 어반 수내역점, from the 2026-10 성남시 file.
    const { lat, lng } = epsg5174ToWgs84(209876.830404608, 430679.509978282);
    expect(lat).toBeCloseTo(37.378137, 5);
    expect(lng).toBeCloseTo(127.112305, 5);
  });
});

const HEADER = ['관리번호', '사업장명', '업태구분명', '영업상태명', '도로명주소', '지번주소', '전화번호', '좌표정보(X)', '좌표정보(Y)', '홈페이지'];
const NEAR = ['209876.830404608', '430679.509978282']; // ~180 m from 수내역
const FAR = ['211461.348662582', '432866.895220942']; // 이매동, well over 500 m
const OPTIONS = { district: '성남시 분당구', base: { lat: 37.3784, lng: 127.1143 }, radiusM: 500 };

function row(id: string, name: string, type: string, status: string, coords: string[], road = '경기도 성남시 분당구 황새울로 1') {
  return [id, name, type, status, road, '경기도 성남시 분당구 수내동 1', '031-000-0000', coords[0] ?? '', coords[1] ?? '', ''];
}

describe('transformRows', () => {
  it('keeps open places in the district and radius, and reports the rest', () => {
    const table = [
      HEADER,
      row('ok-1', '소월곰탕', '한식', '영업/정상', NEAR),
      row('closed-1', '옛날집', '한식', '폐업', NEAR),
      row('far-1', '샤브향', '한식', '영업/정상', FAR),
      row('cafe-1', '이디야커피', '기타', '영업/정상', NEAR),
      row('nocoord-1', '좌표없음', '한식', '영업/정상', ['', '']),
      ['other-1', '중원구집', '한식', '영업/정상', '경기도 성남시 중원구 1', '경기도 성남시 중원구 성남동 1', '', NEAR[0]!, NEAR[1]!, ''],
      row('new-1', '신규업태집', '새로운업태', '영업/정상', NEAR, ''),
      [''],
    ];
    const { records, deactivateSourceIds, stats } = transformRows(table, OPTIONS);

    expect(records.map((r) => r.source_id)).toEqual(['ok-1', 'new-1']);
    // Closed rows and rows excluded by the rules are both sent for deactivation.
    expect(deactivateSourceIds).toEqual(['closed-1', 'cafe-1']);
    expect(stats).toMatchObject({
      rowsRead: 7,
      outsideDistrict: 1,
      closed: 1,
      missingCoords: 1,
      excluded: 1,
      outsideRadius: 1,
      accepted: 2,
      unknownBusinessTypes: { 새로운업태: 1 },
    });
  });

  it('builds records with the road address first and falls back to the lot address', () => {
    const { records } = transformRows(
      [HEADER, row('ok-1', '소월곰탕', '한식', '영업/정상', NEAR), row('new-1', '분식집', '분식', '영업/정상', NEAR, '')],
      OPTIONS,
    );
    expect(records[0]).toMatchObject({
      name: '소월곰탕',
      category: '한식',
      category_raw: '한식',
      address: '경기도 성남시 분당구 황새울로 1',
      phone: '031-000-0000',
    });
    expect(records[0]!.lat).toBeCloseTo(37.378137, 5);
    expect(records[1]!.address).toBe('경기도 성남시 분당구 수내동 1');
  });

  it('fails fast when a required column is missing', () => {
    expect(() => transformRows([['관리번호', '사업장명']], OPTIONS)).toThrow(/missing columns/);
  });
});
