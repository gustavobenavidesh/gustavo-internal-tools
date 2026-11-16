/**
 * Flags the document as idle whenever the board isn't the thing you're looking
 * at. The stylesheet pauses every animation while the flag is set; see the
 * `html[data-idle]` rule in `globals.css`.
 *
 * Hidden is not enough on its own. The Page Visibility API only fires when the
 * window is minimised, in a background tab or *fully* covered — and this board
 * lives in a Dock window that is usually half-visible beside whatever has focus,
 * which is the exact state where its animations kept running at full frame rate
 * for nobody. So the flag follows window focus as well: a visible but unfocused
 * window is still a window nobody is watching.
 *
 * `document.hasFocus()` rather than tracking the blur/focus events alone, so the
 * first run gets it right on a page that loads into the background.
 *
 * Inline and dependency-free so it's listening before the first paint, and
 * attribute-based rather than React state because nothing in the tree needs to
 * re-render for it — the pause is entirely the stylesheet's job.
 */
export const IDLE_SCRIPT = `
(function () {
  var el = document.documentElement;
  var sync = function () {
    if (document.hidden || !document.hasFocus()) el.setAttribute('data-idle', '');
    else el.removeAttribute('data-idle');
  };
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('focus', sync);
  window.addEventListener('blur', sync);
  sync();
})();
`;
