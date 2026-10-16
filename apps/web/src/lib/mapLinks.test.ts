import { describe, expect, it } from 'vitest';
import { kakaoMapUrl, naverMapUrl } from './mapLinks.ts';

const place = {
  name: '소월곰탕, 분당점',
  lat: 37.378137,
  lng: 127.112305,
  address: '경기도 성남시 분당구 황새울로 200 (수내동)',
};

describe('kakaoMapUrl', () => {
  it('searches by the place name only, not directions to its location', () => {
    expect(kakaoMapUrl(place)).toBe(`https://map.kakao.com/link/search/${encodeURIComponent('소월곰탕, 분당점')}`);
  });
});

describe('naverMapUrl', () => {
  it('searches by the place name only, without the neighbourhood', () => {
    expect(naverMapUrl(place)).toBe(`https://map.naver.com/p/search/${encodeURIComponent('소월곰탕, 분당점')}`);
  });
});
