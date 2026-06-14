const t = window.scopedT("core");

export const setShortcutsNavVisible = (visible: boolean): void => {
  document.querySelectorAll<HTMLElement>("[data-shortcuts-nav]").forEach((el) => {
    el.style.display = visible ? "" : "none";
  });
  const select = document.getElementById("settings-tab-select");
  let opt = document.getElementById(
    "settings-tab-shortcuts-option",
  ) as HTMLOptionElement | null;
  if (visible && select && !opt) {
    opt = document.createElement("option");
    opt.id = "settings-tab-shortcuts-option";
    opt.value = "shortcuts";
    opt.textContent = t("settings-page.nav.shortcuts");
    select.appendChild(opt);
  } else if (!visible && opt) {
    opt.remove();
  }
};
