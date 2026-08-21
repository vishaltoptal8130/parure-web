/**
 * Persist Meta click ID (fbclid) as _fbc before the Pixel PageView fires,
 * so later waitlist CAPI events can still attribute an ad click.
 */
(function persistMetaClickId() {
  try {
    var params = new URLSearchParams(window.location.search);
    var fbclid = params.get('fbclid');
    if (!fbclid) return;
    if (/(?:^|; )_fbc=/.test(document.cookie)) return;
    var fbc = 'fb.1.' + Math.floor(Date.now() / 1000) + '.' + fbclid;
    document.cookie = '_fbc=' + encodeURIComponent(fbc) + ';max-age=7776000;path=/;SameSite=Lax';
  } catch (err) {
    /* ignore */
  }
})();
