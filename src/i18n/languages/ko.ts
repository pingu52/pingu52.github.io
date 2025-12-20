import Key from "../i18nKey";
import type { Translation } from "../translation";

export const ko: Translation = {
	[Key.home]: "홈",
	[Key.about]: "소개",
	[Key.archive]: "아카이브",
	[Key.search]: "검색",

	[Key.tags]: "태그",
	[Key.categories]: "카테고리",
	[Key.recentPosts]: "최근 게시물",

	[Key.comments]: "댓글",

	[Key.untitled]: "제목 없음",
	[Key.uncategorized]: "분류되지 않음",
	[Key.noTags]: "태그 없음",

	[Key.wordCount]: "단어",
	[Key.wordsCount]: "단어",
	[Key.minuteCount]: "분",
	[Key.minutesCount]: "분",
	[Key.postCount]: "게시물",
	[Key.postsCount]: "게시물",

	[Key.themeColor]: "테마 색상",

	[Key.lightMode]: "밝은 모드",
	[Key.darkMode]: "어두운 모드",
	[Key.systemMode]: "시스템 모드",

	[Key.more]: "더 보기",

	[Key.author]: "저자",
	[Key.publishedAt]: "게시일",
	[Key.license]: "라이선스",

	[Key.taxonomyCategoryDescription]: "{name} 카테고리의 글 목록입니다.",
	[Key.taxonomyTagDescription]: "{name} 태그의 글 목록입니다.",
	[Key.taxonomySummaryCount]: "총 {count}개 글",
	[Key.taxonomySummaryPage]: "{current}/{total} 페이지",
	[Key.archiveNoJsNotice]: "아카이브 필터 및 구형 링크 리다이렉트는 JavaScript가 필요합니다. 사이드바의 태그/카테고리를 이용하거나 /tag/... 또는 /category/... 주소로 이동해주세요.",
	[Key.archiveDescription]: "게시일 기준으로 전체 글을 모아봅니다. 필터된 피드는 태그/카테고리를 이용하세요.",
};
