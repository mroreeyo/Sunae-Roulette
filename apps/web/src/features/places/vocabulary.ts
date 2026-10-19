/** App categories produced by scripts/import-places (see TRD mapping table). */
export const CATEGORIES = ['한식', '중식', '일식', '양식', '분식', '아시안', '패스트푸드', '뷔페', '기타'] as const;

/**
 * Category colours, used only in the history stats: elsewhere categories stay neutral so each
 * screen keeps one point of focus. Similar hues differ in lightness too.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  한식: '#e07a5f',
  중식: '#e9b949',
  일식: '#8fc1a0',
  양식: '#c3a0da',
  분식: '#f290a8',
  아시안: '#63c3b4',
  패스트푸드: '#b8c66a',
  뷔페: '#7db8cf',
  기타: '#9aa7b8',
};

/** Tags users can put on a place; 혼밥 also drives a home filter (PRD F-05). */
export const TAGS = ['혼밥', '가성비', '단체석'] as const;
export const FILTER_TAGS: readonly string[] = ['혼밥'];

/** "도보 5분" filter, in estimated walking minutes. */
export const NEAR_WALK_MINUTES = 5;
