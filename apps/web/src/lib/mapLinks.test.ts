import { describe, expect, it } from 'vitest';
import { kakaoMapUrl, naverMapUrl, naverMenuUrl } from './mapLinks.ts';

const located = {
  name: '소월곰탕, 분당점',
  lat: 37.378137,
  lng: 127.112305,
  address: '경기도 성남시 분당구 황새울로 200 (수내동)',
};

describe('kakaoMapUrl', () => {
  it('builds a directions link and strips commas from the name', () => {
    expect(kakaoMapUrl(located)).toBe(
      `https://map.kakao.com/link/to/${encodeURIComponent('소월곰탕  분당점')},37.378137,127.112305`,
    );
  });

  it('falls back to a search link when the place has no location', () => {
    expect(kakaoMapUrl({ ...located, lat: null, lng: null })).toBe(
      `https://map.kakao.com/link/search/${encodeURIComponent('소월곰탕, 분당점 수내동')}`,
    );
  });
});

describe('naverMapUrl', () => {
  it('searches by name plus neighbourhood', () => {
    expect(naverMapUrl(located)).toBe(
      `https://map.naver.com/p/search/${encodeURIComponent('소월곰탕, 분당점 수내동')}`,
    );
  });

  it('uses the neighbourhood in parentheses, not an apartment building number', () => {
    const address = '경기도 성남시 분당구 내정로165번길 38, 602동 상가지층 29호 (수내동, 양지마을금호아파트)';
    expect(naverMapUrl({ ...located, name: '통영댁', address })).toBe(
      `https://map.naver.com/p/search/${encodeURIComponent('통영댁 수내동')}`,
    );
    const inside = '경기도 성남시 분당구 내정로165번길 38 (수내동,양지마을602동 2층 204,205호)';
    expect(naverMapUrl({ ...located, name: '통영댁', address: inside })).toBe(
      `https://map.naver.com/p/search/${encodeURIComponent('통영댁 수내동')}`,
    );
  });

  it('reads a typed address without parentheses but skips building numbers', () => {
    expect(naverMapUrl({ ...located, name: '국수집', address: '수내동 12-3' })).toBe(
      `https://map.naver.com/p/search/${encodeURIComponent('국수집 수내동')}`,
    );
    expect(naverMapUrl({ ...located, name: '국수집', address: '내정로 38, 602동 1층' })).toBe(
      `https://map.naver.com/p/search/${encodeURIComponent('국수집')}`,
    );
  });

  it('searches by name alone when the address has no neighbourhood', () => {
    expect(naverMapUrl({ ...located, address: null })).toBe(
      `https://map.naver.com/p/search/${encodeURIComponent('소월곰탕, 분당점')}`,
    );
  });
});

describe('naverMenuUrl', () => {
  it('searches Naver for the menu by name plus neighbourhood', () => {
    expect(naverMenuUrl(located)).toBe(
      `https://search.naver.com/search.naver?query=${encodeURIComponent('소월곰탕, 분당점 수내동 메뉴')}`,
    );
  });

  it('works for a place added without a location or address', () => {
    expect(naverMenuUrl({ name: '국수집', lat: null, lng: null, address: null })).toBe(
      `https://search.naver.com/search.naver?query=${encodeURIComponent('국수집 메뉴')}`,
    );
  });
});
