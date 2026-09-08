// Reports the settled content height in the document title so build.sh can size
// each capture to its content. Without this, a page that grows silently gets
// clipped by --window-size.
//
// Measures the body box rather than scrollHeight: scrollHeight floors at the
// viewport height, which makes short pages (the popup) measure far too tall.
addEventListener('load', async () => {
  const contentHeight = () => {
    const rect = document.body.getBoundingClientRect();
    const marginBottom = parseFloat(getComputedStyle(document.body).marginBottom) || 0;
    return Math.ceil(rect.bottom + marginBottom);
  };

  let height = 0;
  let stable = 0;
  while (stable < 3) {
    await new Promise((r) => setTimeout(r, 100));
    const measured = contentHeight();
    if (measured === height) stable++;
    else {
      height = measured;
      stable = 0;
    }
  }
  document.title = `H:${height}`;
});
