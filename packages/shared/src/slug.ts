/** Public page slugs: fitcoach.app/coach/<slug>. Lowercase letters, digits and single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;

/** Slugs that would be confusing or impersonate the product. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "beta",
  "client",
  "coach",
  "fitcoach",
  "help",
  "login",
  "logout",
  "platform",
  "pricing",
  "privacy",
  "settings",
  "signup",
  "support",
  "terms",
]);

/** Suggests a slug from a business name ("Asha's Fitness Studio" → "ashas-fitness-studio"). */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}
