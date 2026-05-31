import { Context } from "hono";
import { BlankEnv, BlankInput } from "hono/types";
import { logger } from "./logger";

export const readObjectBody = async <T extends object>(c: Context): Promise<T | null> => {
  try {
    const body = await c.req.json<unknown>();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as T;
  } catch (err) {
    logger.debug("hono", "invalid JSON body", err);
  }
  return null;
};

/**
 * Checks if a DEGOOG_I18N environment variable exists, if not uses
 * the Accept-Language header to determine the locale.
 *
 * @param c - The Hono context object.
 * @returns The locale string.
 */
export function getLocale(
  c: Context<BlankEnv, "/", BlankInput>,
): string | undefined {
  const override = process.env.DEGOOG_I18N?.trim();

  if (override) {
    logger.debug(
      "translation",
      `Locale forced by DEGOOG_I18N: "${override}"`,
      undefined,
    );
    return override;
  }
  return c.req.header("Accept-Language")?.split(",")[0].trim() || "en";
}
