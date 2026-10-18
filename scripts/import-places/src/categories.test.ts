import { describe, expect, it } from 'vitest';
import { isKnownBusinessType, toCategory } from './categories.ts';

// Names and business types below are taken from the 2026-10 성남시 files.
describe('toCategory', () => {
  it('maps licence business types to app categories', () => {
    expect(toCategory('한식', '소월곰탕')).toBe('한식');
    expect(toCategory('횟집', '수내어촌')).toBe('일식');
    expect(toCategory('패밀리레스트랑', '알레피자&파스타')).toBe('양식');
    expect(toCategory('외국음식전문점(인도,태국등)', '란반 정자역점')).toBe('아시안');
    expect(toCategory('분식', '청년다방수내점')).toBe('분식');
  });

  it('excludes drinking places, cafes and convenience stores by business type', () => {
    expect(toCategory('호프/통닭', '김복남맥주')).toBeNull();
    expect(toCategory('커피숍', '사과나무')).toBeNull();
    expect(toCategory('편의점', 'GS25 분당중앙점')).toBeNull();
  });

  it('excludes cafes hidden under generic business types by name', () => {
    expect(toCategory('기타', '메가엠지씨커피 분당느티마을점')).toBeNull();
    expect(toCategory('패스트푸드', '할리스커피숍(양지점)')).toBeNull();
    expect(toCategory('한식', '설빙 분당수내역점')).toBeNull();
    expect(toCategory('기타', '포케올데이 서현역점')).toBe('기타');
  });

  it('excludes PC rooms, poker pubs and bars that hold a restaurant licence', () => {
    expect(toCategory('기타', '레벨업 pc방 수내점')).toBeNull();
    expect(toCategory('기타', '피씨테그(PC-TAG 수내역점)')).toBeNull();
    expect(toCategory('기타', 'ABC 홀덤펍')).toBeNull();
    expect(toCategory('기타', '야화혼술바 분당수내점')).toBeNull();
    expect(toCategory('기타', '백스비어 분당수내점')).toBeNull();
    expect(toCategory('한식', '역전할머니맥주 분당수내역점')).toBeNull();
    expect(toCategory('한식', '수내포차')).toBeNull();
    expect(toCategory('한식', '동네술집')).toBeNull();
    expect(toCategory('기타', '샐러디수내점')).toBe('기타');
  });

  it('excludes convenience store chains licensed under other business types', () => {
    expect(toCategory('패스트푸드', '세븐일레븐 분당초림점')).toBeNull();
    expect(toCategory('기타 휴게음식점', 'GS25분당파크뷰점')).toBeNull();
    expect(toCategory('기타 휴게음식점', '씨유 분당차병원점')).toBeNull();
    expect(toCategory('일반조리판매', 'CU분당수내푸른점')).toBeNull();
    expect(toCategory('편의점', '씨유(cu) 분당수내역점')).toBeNull();
    expect(toCategory('기타 휴게음식점', '이마트24 수내역점')).toBeNull();
    expect(toCategory('기타 휴게음식점', '미니스톱 정자점')).toBeNull();
  });

  it('does not mistake similar names for convenience stores', () => {
    expect(toCategory('기타', '앰프일레븐(Amp 11)')).toBe('기타');
    expect(toCategory('경양식', '라쿠치나(La Cucina)')).toBe('양식');
    expect(toCategory('외국음식전문점(인도,태국등)', '홍대쌀국수(이마트분당점)')).toBe('아시안');
  });

  it('puts snack shops registered under generic business types into 분식', () => {
    expect(toCategory('일반조리판매', '신전떡볶이 수내점')).toBe('분식');
    expect(toCategory('일반조리판매', '1996 조아분식')).toBe('분식');
    expect(toCategory('일반조리판매', '수내왕만두')).toBe('분식');
    expect(toCategory('기타', '부산진오뎅')).toBe('분식');
    expect(toCategory('기타 휴게음식점', '진김밥')).toBe('분식');
    expect(toCategory('새로운업태', '우리할매떡볶이')).toBe('분식');
  });

  it('keeps the business type category when it is more specific than 기타', () => {
    expect(toCategory('한식', '불닭발땡초동대문엽기떡볶이 분당수내점')).toBe('한식');
    expect(toCategory('일식', '오토김밥 수내점')).toBe('일식');
    expect(toCategory('한식', '백암황금순대')).toBe('한식');
  });

  it('applies exclusion rules before the snack rule', () => {
    expect(toCategory('일반조리판매', '부산빨간어묵포차 분당점')).toBeNull();
  });

  it('falls back to 기타 for unknown business types', () => {
    expect(toCategory('새로운업태', '식당')).toBe('기타');
    expect(isKnownBusinessType('새로운업태')).toBe(false);
    expect(isKnownBusinessType('한식')).toBe(true);
  });
});
