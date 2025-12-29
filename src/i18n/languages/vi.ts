import Key from "../i18nKey";
import type { Translation } from "../translation";

export const vi: Translation = {
	[Key.home]: "Trang chủ",
	[Key.about]: "Giới thiệu",
	[Key.archive]: "Kho bài",
	[Key.search]: "Tìm kiếm",

	[Key.tags]: "Thẻ",
	[Key.categories]: "Danh mục",
	[Key.recentPosts]: "Bài viết mới nhất",

	[Key.comments]: "Bình luận",

	[Key.untitled]: "Không tiêu đề",
	[Key.uncategorized]: "Chưa phân loại",
	[Key.noTags]: "Chưa có thẻ",

	[Key.wordCount]: "từ",
	[Key.wordsCount]: "từ",
	[Key.minuteCount]: "phút đọc",
	[Key.minutesCount]: "phút đọc",
	[Key.postCount]: "bài viết",
	[Key.postsCount]: "bài viết",

	[Key.themeColor]: "Màu giao diện",

	[Key.lightMode]: "Sáng",
	[Key.darkMode]: "Tối",
	[Key.systemMode]: "Hệ thống",

	[Key.more]: "Thêm",

	[Key.author]: "Tác giả",
	[Key.publishedAt]: "Đăng vào lúc",
	[Key.license]: "Giấy phép bản quyền",

	[Key.taxonomyCategoryDescription]: "Posts in category {name}.",
	[Key.taxonomyTagDescription]: "Posts tagged {name}.",
	[Key.taxonomySummaryCount]: "{count} posts",
	[Key.taxonomySummaryPage]: "Page {current}/{total}",
	[Key.archiveNoJsNotice]:
		"JavaScript is required for archive filtering and legacy redirects. Use the sidebar Tags/Categories or open the canonical /tag/... or /category/... URLs.",
	[Key.archiveDescription]:
		"Browse all posts by publication date. Use tags/categories for filtered feeds.",
};
