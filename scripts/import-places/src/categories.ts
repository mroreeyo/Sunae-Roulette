/**
 * Maps 업태구분명 from the 일반음식점/휴게음식점 licence data to app categories.
 * Values were taken from the 2026-10 성남시 files; anything unknown becomes 기타.
 */
const CATEGORY_BY_BUSINESS_TYPE: Readonly<Record<string, string>> = {
  한식: '한식',
  '식육(숯불구이)': '한식',
  '탕류(보신용)': '한식',
  냉면집: '한식',
  중국식: '중식',
  일식: '일식',
  횟집: '일식',
  복어취급: '일식',
  경양식: '양식',
  패밀리레스트랑: '양식',
  분식: '분식',
  '김밥(도시락)': '분식',
  '외국음식전문점(인도,태국등)': '아시안',
  '통닭(치킨)': '패스트푸드',
  패스트푸드: '패스트푸드',
  뷔페식: '뷔페',
  기타: '기타',
  일반조리판매: '기타',
  '기타 휴게음식점': '기타',
};

/** Drinking places, cafes, desserts, convenience stores and non-restaurant venues. */
const EXCLUDED_BUSINESS_TYPES: ReadonlySet<string> = new Set([
  '호프/통닭',
  '정종/대포집/소주방',
  '감성주점',
  '라이브카페',
  '까페',
  '키즈카페',
  '출장조리',
  '이동조리',
  '커피숍',
  '편의점',
  '아이스크림',
  '떡카페',
  '과자점',
  '전통찻집',
  '다방',
  '백화점',
  '철도역구내',
  '푸드트럭',
]);

/**
 * Many coffee and dessert shops are registered as 기타 or 패스트푸드,
 * so the business name is checked as well.
 */
const CAFE_NAME =
  /커피|카페|cafe|coffee|에스프레소|espresso|디저트|베이커리|베이킹|제과|젤라또|아이스크림|요거트|빙수|호두|배스킨|베스킨|스타벅스|투썸|이디야|빽다방|컴포즈|메가엠지씨|할리스|폴바셋|공차|바나프레소/i;

/**
 * Venues licensed to sell food but not lunch places: PC rooms, poker pubs, bars.
 * Found in the 2026-10 성남시 data under 기타.
 */
const NON_LUNCH_NAME = /pc방|피씨|pc-|홀덤|펍|pub|비어|beer|와인|wine|술바|혼술|노래|당구|볼링|스크린/i;

export const DEFAULT_CATEGORY = '기타';

/** Returns the app category, or null when the place should not be imported. */
export function toCategory(businessType: string, name: string): string | null {
  const type = businessType.trim();
  if (EXCLUDED_BUSINESS_TYPES.has(type)) return null;
  if (CAFE_NAME.test(name) || NON_LUNCH_NAME.test(name)) return null;
  return CATEGORY_BY_BUSINESS_TYPE[type] ?? DEFAULT_CATEGORY;
}

export function isKnownBusinessType(businessType: string): boolean {
  const type = businessType.trim();
  return type in CATEGORY_BY_BUSINESS_TYPE || EXCLUDED_BUSINESS_TYPES.has(type);
}
