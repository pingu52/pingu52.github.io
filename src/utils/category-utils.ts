import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { isBlank, normalizeLower, trimOrEmpty } from "@utils/string-utils";

export function getUncategorizedLabel(): string {
	return i18n(I18nKey.uncategorized);
}

export function normalizeCategoryName(category: string | null | undefined): string {
	return trimOrEmpty(category);
}

export function isUncategorizedCategory(category: string | null | undefined): boolean {
	if (isBlank(category)) return true;
	return normalizeLower(category) === normalizeLower(getUncategorizedLabel());
}
