import { siteConfig } from "../config";
import type I18nKey from "./i18nKey";
import { en } from "./languages/en";
import { ja } from "./languages/ja";
import { ko } from "./languages/ko";

export type Translation = Partial<Record<I18nKey, string>>;

const defaultTranslation = en;

const map: { [key: string]: Translation } = {
	en: en,
	en_us: en,
	en_gb: en,
	en_au: en,
	ja: ja,
	ja_jp: ja,
	ko: ko,
	ko_kr: ko,
};

export function getTranslation(lang: string): Translation {
	return map[lang.toLowerCase()] || defaultTranslation;
}

export function i18n(key: I18nKey): string {
	const lang = siteConfig.lang || "en";
	const translation = getTranslation(lang);
	return translation[key] ?? defaultTranslation[key] ?? "";
}

/**
 * Simple template interpolation for translations.
 * Replaces occurrences of `{name}` with the corresponding value in `params`.
 */
export function i18nFormat(
	key: I18nKey,
	params: Record<string, string | number>,
): string {
	const template = i18n(key);
	return template.replace(/\{(\w+)\}/g, (_m, k) => {
		const v = params[k];
		return v === undefined || v === null ? "" : String(v);
	});
}
