/**
 * Full page load, on purpose: after sign-in steps, role switches and sign-out
 * the server layout must re-read the session cookie, so a client transition is not enough.
 */
export function hardNavigate(path: string): void {
  window.location.href = path;
}
