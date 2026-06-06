const SAFE_TYPE = /^[a-z0-9][a-z0-9-]*$/;

export const safeSlug = (type: string): string => {
  const slug = type.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!SAFE_TYPE.test(slug)) throw new Error(`invalid type: ${type}`);
  return slug;
};
