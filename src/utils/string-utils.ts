export function trimOrEmpty(value: string | null | undefined): string {
	return (value ?? "").trim();
}

export function isBlank(value: string | null | undefined): boolean {
	return trimOrEmpty(value) === "";
}

export function normalizeLower(value: string | null | undefined): string {
	return trimOrEmpty(value).toLowerCase();
}
