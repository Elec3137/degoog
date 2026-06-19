import { getBase } from "../../utils/base-url";
import { showHome } from "../../utils/navigation";

export const goHome = (): void => showHome();

export const goSettings = (): void => {
  window.location.href = `${getBase()}/settings`;
};
