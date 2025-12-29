import Key from "../i18nKey";
import type { Translation } from "../translation";

export const tr: Translation = {
	[Key.home]: "Anasayfa",
	[Key.about]: "Hakkında",
	[Key.archive]: "Arşiv",
	[Key.search]: "Ara",

	[Key.tags]: "Taglar",
	[Key.categories]: "Katagoriler",
	[Key.recentPosts]: "Son Paylaşımlar",

	[Key.comments]: "Yorumlar",

	[Key.untitled]: "Başlıksız",
	[Key.uncategorized]: "Katagorisiz",
	[Key.noTags]: "Tag Bulunamadı",

	[Key.wordCount]: "kelime",
	[Key.wordsCount]: "kelime",
	[Key.minuteCount]: "dakika",
	[Key.minutesCount]: "dakika",
	[Key.postCount]: "gönderi",
	[Key.postsCount]: "gönderiler",

	[Key.themeColor]: "Tema Rengi",

	[Key.lightMode]: "Aydınlık",
	[Key.darkMode]: "Koyu",
	[Key.systemMode]: "Sistem",

	[Key.more]: "Daha Fazla",

	[Key.author]: "Yazar",
	[Key.publishedAt]: "Yayınlanma:",
	[Key.license]: "Lisans",

	[Key.taxonomyCategoryDescription]: "Posts in category {name}.",
	[Key.taxonomyTagDescription]: "Posts tagged {name}.",
	[Key.taxonomySummaryCount]: "{count} posts",
	[Key.taxonomySummaryPage]: "Page {current}/{total}",
	[Key.archiveNoJsNotice]:
		"JavaScript is required for archive filtering and legacy redirects. Use the sidebar Tags/Categories or open the canonical /tag/... or /category/... URLs.",
	[Key.archiveDescription]:
		"Browse all posts by publication date. Use tags/categories for filtered feeds.",
};
