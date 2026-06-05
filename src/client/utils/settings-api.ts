import { getBase } from "./base-url";
import { jsonHeaders } from "./request";

const _post = async (
  path: string,
  body: Record<string, string>,
  getToken: () => string | null,
): Promise<boolean> => {
  try {
    const res = await fetch(`${getBase()}${path}`, {
      method: "POST",
      headers: jsonHeaders(getToken),
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
};

export const saveField = (
  key: string,
  value: string,
  getToken: () => string | null,
): Promise<boolean> =>
  _post("/api/settings/field", { key, value }, getToken);

export const saveBatch = (
  fields: Record<string, string>,
  getToken: () => string | null,
): Promise<boolean> =>
  _post("/api/settings/general", fields, getToken);
