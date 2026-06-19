const RESULT_SELECTOR = "#results-list a.result-title";

const _anchors = (): HTMLAnchorElement[] =>
  Array.from(document.querySelectorAll<HTMLAnchorElement>(RESULT_SELECTOR));

export const hasFocusedResult = (): boolean =>
  document.activeElement instanceof HTMLAnchorElement &&
  document.activeElement.classList.contains("result-title");

export const moveResult = (delta: number): void => {
  const anchors = _anchors();
  if (!anchors.length) return;
  const current = anchors.indexOf(document.activeElement as HTMLAnchorElement);
  const start = current < 0 ? (delta > 0 ? 0 : anchors.length - 1) : current + delta;
  const next = Math.max(0, Math.min(anchors.length - 1, start));
  anchors[next].focus();
  anchors[next].scrollIntoView({ block: "center", behavior: "smooth" });
};

export const openResult = (): void => {
  if (hasFocusedResult()) {
    (document.activeElement as HTMLAnchorElement).click();
  }
};
