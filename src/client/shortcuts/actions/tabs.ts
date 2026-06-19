const _visibleTabs = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(".results-tab")).filter(
    (tab) => window.getComputedStyle(tab).display !== "none",
  );

export const hasTabs = (): boolean => _visibleTabs().length > 0;

export const cycleTab = (delta: number): void => {
  const tabs = _visibleTabs();
  if (!tabs.length) return;
  const activeIndex = tabs.findIndex((tab) => tab.classList.contains("active"));
  const base = activeIndex < 0 ? 0 : activeIndex;
  const next = (base + delta + tabs.length) % tabs.length;
  tabs[next].click();
};

export const selectTab = (index: number): void => {
  const tabs = _visibleTabs();
  if (index >= 0 && index < tabs.length) tabs[index].click();
};
