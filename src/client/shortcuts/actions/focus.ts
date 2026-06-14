export const focusSearch = (): void => {
  const input =
    document.getElementById("results-search-input") ??
    document.getElementById("search-input");
  if (input instanceof HTMLInputElement) {
    input.focus();
    input.select();
  }
};
