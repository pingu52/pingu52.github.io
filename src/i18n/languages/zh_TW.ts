import Key from "../i18nKey";
import type { Translation } from "../translation";

export const zh_TW: Translation = {
	[Key.home]: "首頁",
	[Key.about]: "關於",
	[Key.archive]: "彙整",
	[Key.search]: "搜尋",

	[Key.tags]: "標籤",
	[Key.categories]: "分類",
	[Key.recentPosts]: "最新文章",

	[Key.comments]: "評論",
	[Key.visitorCounter]: "訪客數",
	[Key.visitorCounterProvider]: "資料來源：{provider}",
	[Key.visitorCounterRange]: "最近 {days} 天的訪客數",
	[Key.visitorCounterTotal]: "累計訪客數",
	[Key.visitorCounterRecent]: "最近 {days} 天",
	[Key.visitorCounterLoading]: "正在載入訪客數…",
	[Key.visitorCounterUnavailable]: "無法載入訪客數",

	[Key.untitled]: "無標題",
	[Key.uncategorized]: "未分類",
	[Key.noTags]: "無標籤",

	[Key.wordCount]: "字",
	[Key.wordsCount]: "字",
	[Key.minuteCount]: "分鐘",
	[Key.minutesCount]: "分鐘",
	[Key.postCount]: "篇文章",
	[Key.postsCount]: "篇文章",

	[Key.themeColor]: "主題色",

	[Key.lightMode]: "亮色",
	[Key.darkMode]: "暗色",
	[Key.systemMode]: "跟隨系統",

	[Key.more]: "更多",

	[Key.author]: "作者",
	[Key.publishedAt]: "發佈於",
	[Key.license]: "許可協議",

	[Key.taxonomyCategoryDescription]: "Posts in category {name}.",
	[Key.taxonomyTagDescription]: "Posts tagged {name}.",
	[Key.taxonomySummaryCount]: "{count} posts",
	[Key.taxonomySummaryPage]: "Page {current}/{total}",
	[Key.archiveNoJsNotice]:
		"JavaScript is required for archive filtering and legacy redirects. Use the sidebar Tags/Categories or open the canonical /tag/... or /category/... URLs.",
	[Key.archiveDescription]:
		"Browse all posts by publication date. Use tags/categories for filtered feeds.",
};
