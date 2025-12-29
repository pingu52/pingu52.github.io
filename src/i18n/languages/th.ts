import Key from "../i18nKey";
import type { Translation } from "../translation";

export const th: Translation = {
	[Key.home]: "หน้าแรก",
	[Key.about]: "เกี่ยวกับ",
	[Key.archive]: "คลัง",
	[Key.search]: "ค้นหา",

	[Key.tags]: "ป้ายกำกับ",
	[Key.categories]: "หมวดหมู่",
	[Key.recentPosts]: "โพสต์ล่าสุด",

	[Key.comments]: "ความคิดเห็น",

	[Key.untitled]: "ไม่ได้ตั้งชื่อ",
	[Key.uncategorized]: "ไม่ได้จัดหมวดหมู่",
	[Key.noTags]: "ไม่มีป้ายกำกับ",

	[Key.wordCount]: "คำ",
	[Key.wordsCount]: "คำ",
	[Key.minuteCount]: "นาที",
	[Key.minutesCount]: "นาที",
	[Key.postCount]: "โพสต์",
	[Key.postsCount]: "โพสต์",

	[Key.themeColor]: "สีของธีม",

	[Key.lightMode]: "สว่าง",
	[Key.darkMode]: "มืด",
	[Key.systemMode]: "ตามระบบ",

	[Key.more]: "ดูเพิ่ม",

	[Key.author]: "ผู้เขียน",
	[Key.publishedAt]: "เผยแพร่เมื่อ",
	[Key.license]: "สัญญาอนุญาต",

	[Key.taxonomyCategoryDescription]: "Posts in category {name}.",
	[Key.taxonomyTagDescription]: "Posts tagged {name}.",
	[Key.taxonomySummaryCount]: "{count} posts",
	[Key.taxonomySummaryPage]: "Page {current}/{total}",
	[Key.archiveNoJsNotice]:
		"JavaScript is required for archive filtering and legacy redirects. Use the sidebar Tags/Categories or open the canonical /tag/... or /category/... URLs.",
	[Key.archiveDescription]:
		"Browse all posts by publication date. Use tags/categories for filtered feeds.",
};
