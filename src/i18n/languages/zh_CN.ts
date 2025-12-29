import Key from "../i18nKey";
import type { Translation } from "../translation";

export const zh_CN: Translation = {
	[Key.home]: "主页",
	[Key.about]: "关于",
	[Key.archive]: "归档",
	[Key.search]: "搜索",

	[Key.tags]: "标签",
	[Key.categories]: "分类",
	[Key.recentPosts]: "最新文章",

	[Key.comments]: "评论",
	[Key.visitorCounter]: "访问量",
	[Key.visitorCounterProvider]: "数据来源：{provider}",
	[Key.visitorCounterRange]: "最近 {days} 天的访问量",
	[Key.visitorCounterDaily]: "最近 1 天",
	[Key.visitorCounterTotal]: "累计访问量",
	[Key.visitorCounterRecent]: "最近 {days} 天",
	[Key.visitorCounterLoading]: "正在加载访问量…",
	[Key.visitorCounterUnavailable]: "无法加载访问量",

	[Key.untitled]: "无标题",
	[Key.uncategorized]: "未分类",
	[Key.noTags]: "无标签",

	[Key.wordCount]: "字",
	[Key.wordsCount]: "字",
	[Key.minuteCount]: "分钟",
	[Key.minutesCount]: "分钟",
	[Key.postCount]: "篇文章",
	[Key.postsCount]: "篇文章",

	[Key.themeColor]: "主题色",

	[Key.lightMode]: "亮色",
	[Key.darkMode]: "暗色",
	[Key.systemMode]: "跟随系统",

	[Key.more]: "更多",

	[Key.author]: "作者",
	[Key.publishedAt]: "发布于",
	[Key.license]: "许可协议",

	[Key.taxonomyCategoryDescription]: "Posts in category {name}.",
	[Key.taxonomyTagDescription]: "Posts tagged {name}.",
	[Key.taxonomySummaryCount]: "{count} posts",
	[Key.taxonomySummaryPage]: "Page {current}/{total}",
	[Key.archiveNoJsNotice]:
		"JavaScript is required for archive filtering and legacy redirects. Use the sidebar Tags/Categories or open the canonical /tag/... or /category/... URLs.",
	[Key.archiveDescription]:
		"Browse all posts by publication date. Use tags/categories for filtered feeds.",
};
