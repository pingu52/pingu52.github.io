import Key from "../i18nKey";
import type { Translation } from "../translation";

export const ja: Translation = {
	[Key.home]: "Home",
	[Key.about]: "About",
	[Key.archive]: "Archive",
	[Key.search]: "検索",

	[Key.tags]: "タグ",
	[Key.categories]: "カテゴリ",
	[Key.recentPosts]: "最近の投稿",

	[Key.comments]: "コメント",

	[Key.untitled]: "タイトルなし",
	[Key.uncategorized]: "カテゴリなし",
	[Key.noTags]: "タグなし",

	[Key.wordCount]: "文字",
	[Key.wordsCount]: "文字",
	[Key.minuteCount]: "分",
	[Key.minutesCount]: "分",
	[Key.postCount]: "件の投稿",
	[Key.postsCount]: "件の投稿",

	[Key.themeColor]: "テーマカラー",

	[Key.lightMode]: "ライト",
	[Key.darkMode]: "ダーク",
	[Key.systemMode]: "システム",

	[Key.more]: "もっと",

	[Key.author]: "作者",
	[Key.publishedAt]: "公開日",
	[Key.license]: "ライセンス",

	[Key.taxonomyCategoryDescription]: "Posts in category {name}.",
	[Key.taxonomyTagDescription]: "Posts tagged {name}.",
	[Key.taxonomySummaryCount]: "{count} posts",
	[Key.taxonomySummaryPage]: "Page {current}/{total}",
	[Key.archiveNoJsNotice]:
		"JavaScript is required for archive filtering and legacy redirects. Use the sidebar Tags/Categories or open the canonical /tag/... or /category/... URLs.",
	[Key.archiveDescription]:
		"Browse all posts by publication date. Use tags/categories for filtered feeds.",
};
