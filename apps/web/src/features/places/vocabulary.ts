/** App categories produced by scripts/import-places (see TRD mapping table). */
export const CATEGORIES = ['한식', '중식', '일식', '양식', '분식', '아시안', '패스트푸드', '뷔페', '기타'] as const;

/** Tags users can put on a place; 혼밥 and 가성비 also drive home filters (PRD F-05). */
export const TAGS = ['혼밥', '가성비', '단체석'] as const;
export const FILTER_TAGS = ['혼밥', '가성비'] as const;

/** "도보 5분" filter, in estimated walking minutes. */
export const NEAR_WALK_MINUTES = 5;
