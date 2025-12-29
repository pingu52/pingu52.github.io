const COPY_BUTTON_SELECTOR = ".copy-btn";
const CODE_FRAGMENT_SELECTOR = ".code:not(summary *)";
const SUCCESS_CLASS = "success";
const SUCCESS_TIMEOUT_MS = 1000;

type Cleanup = () => void;

let activeCleanup: Cleanup | null = null;
let consumerCount = 0;

function findCopyButton(target: EventTarget | null): HTMLElement | null {
	if (!(target instanceof Element)) return null;
	const button = target.closest(COPY_BUTTON_SELECTOR);
	return button instanceof HTMLElement ? button : null;
}

function extractCode(button: HTMLElement): string {
	const preElement = button.closest("pre");
	const codeElement = preElement?.querySelector("code");

	const codeSegments =
		codeElement?.querySelectorAll<HTMLElement>(CODE_FRAGMENT_SELECTOR) ?? [];

	return Array.from(codeSegments)
		.map((element) => element.textContent ?? "")
		.map((text) => (text === "\n" ? "" : text))
		.join("\n");
}

function showCopySuccess(button: HTMLElement) {
	const existingTimeoutId = button.dataset.timeoutId;
	if (existingTimeoutId) {
		window.clearTimeout(Number(existingTimeoutId));
	}

	button.classList.add(SUCCESS_CLASS);

	const timeoutId = window.setTimeout(() => {
		button.classList.remove(SUCCESS_CLASS);
		delete button.dataset.timeoutId;
	}, SUCCESS_TIMEOUT_MS);

	button.dataset.timeoutId = String(timeoutId);
}

function onCopyButtonClick(event: Event) {
	const button = findCopyButton(event.target);
	if (!button) return;

	const code = extractCode(button);
	if (!code) return;

	void navigator.clipboard.writeText(code);
	showCopySuccess(button);
}

function cleanupButtons() {
	document
		.querySelectorAll<HTMLElement>(COPY_BUTTON_SELECTOR)
		.forEach((button) => {
			const timeoutId = button.dataset.timeoutId;
			if (timeoutId) {
				window.clearTimeout(Number(timeoutId));
				delete button.dataset.timeoutId;
			}
			button.classList.remove(SUCCESS_CLASS);
		});
}

export function initCopyToClipboard(
	root: Document | HTMLElement = document,
): Cleanup {
	consumerCount += 1;

	if (!activeCleanup) {
		const listener: EventListener = (event) => onCopyButtonClick(event);
		root.addEventListener("click", listener);

		activeCleanup = () => {
			root.removeEventListener("click", listener);
			cleanupButtons();
		};
	}

	let cleanedUp = false;

	return () => {
		if (cleanedUp) return;
		cleanedUp = true;
		consumerCount = Math.max(0, consumerCount - 1);

		if (consumerCount === 0 && activeCleanup) {
			activeCleanup();
			activeCleanup = null;
		}
	};
}
