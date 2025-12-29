import Key from "../i18nKey";
import type { Translation } from "../translation";

export const id: Translation = {
	[Key.home]: "Beranda",
	[Key.about]: "Tentang",
	[Key.archive]: "Arsip",
	[Key.search]: "Cari",

	[Key.tags]: "Tag",
	[Key.categories]: "Kategori",
	[Key.recentPosts]: "Postingan Terbaru",

	[Key.comments]: "Komentar",

	[Key.untitled]: "Tanpa Judul",
	[Key.uncategorized]: "Tanpa Kategori",
	[Key.noTags]: "Tanpa Tag",

	[Key.wordCount]: "kata",
	[Key.wordsCount]: "kata",
	[Key.minuteCount]: "menit",
	[Key.minutesCount]: "menit",
	[Key.postCount]: "postingan",
	[Key.postsCount]: "postingan",

	[Key.themeColor]: "Warna Tema",

	[Key.lightMode]: "Terang",
	[Key.darkMode]: "Gelap",
	[Key.systemMode]: "Sistem",

	[Key.more]: "Lainnya",

	[Key.author]: "Penulis",
	[Key.publishedAt]: "Diterbitkan pada",
	[Key.license]: "Lisensi",

	[Key.taxonomyCategoryDescription]: "Posts in category {name}.",
	[Key.taxonomyTagDescription]: "Posts tagged {name}.",
	[Key.taxonomySummaryCount]: "{count} posts",
	[Key.taxonomySummaryPage]: "Page {current}/{total}",
	[Key.archiveNoJsNotice]:
		"JavaScript is required for archive filtering and legacy redirects. Use the sidebar Tags/Categories or open the canonical /tag/... or /category/... URLs.",
	[Key.archiveDescription]:
		"Browse all posts by publication date. Use tags/categories for filtered feeds.",
};
