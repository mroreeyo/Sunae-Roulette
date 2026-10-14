import { describe, expect, it } from 'vitest';
import { kakaoMapUrl, naverMapUrl } from './mapLinks.ts';

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

  it('searches by name alone when the address has no neighbourhood', () => {
    expect(naverMapUrl({ ...located, address: null })).toBe(
      `https://map.naver.com/p/search/${encodeURIComponent('소월곰탕, 분당점')}`,
    );
  });
});
