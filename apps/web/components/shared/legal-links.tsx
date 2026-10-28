/** "terms of use" / "privacy policy" links for consent checkboxes; a new tab keeps the form filled in. */
export function TermsLink() {
  return (
    <a
      href="/terms"
      target="_blank"
      rel="noopener"
      className="font-semibold underline underline-offset-2"
    >
      terms of use
    </a>
  );
}

export function PrivacyLink() {
  return (
    <a
      href="/privacy"
      target="_blank"
      rel="noopener"
      className="font-semibold underline underline-offset-2"
    >
      privacy policy
    </a>
  );
}
