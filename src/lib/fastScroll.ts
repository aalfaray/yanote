export const FAST_SCROLL_MULTIPLIER = 5;

/** Alt is read from each wheel event, so releasing it restores native scrolling immediately. */
export function installFastScroll() {
  const onWheel = (event: WheelEvent) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || !event.cancelable || event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    // xterm already accelerates Alt+wheel; the tab strip translates vertical wheel itself.
    if (target.closest('.xterm, [data-horizontal-wheel]')) return;

    const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const delta = horizontal ? event.deltaX || event.deltaY : event.deltaY;
    if (!delta) return;

    for (let element: Element | null = target; element; element = element.parentElement) {
      if (!(element instanceof HTMLElement)) continue;
      const style = getComputedStyle(element);
      const overflow = horizontal ? style.overflowX : style.overflowY;
      if (!/^(auto|scroll|overlay)$/.test(overflow)) continue;
      const viewport = horizontal ? element.clientWidth : element.clientHeight;
      const extent = horizontal ? element.scrollWidth : element.scrollHeight;
      const position = horizontal ? element.scrollLeft : element.scrollTop;
      if (extent <= viewport || (delta < 0 ? position <= 0 : position >= extent - viewport - 1)) continue;

      const unit = event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? viewport
        : event.deltaMode === WheelEvent.DOM_DELTA_LINE ? parseFloat(style.lineHeight) || 16 : 1;
      event.preventDefault();
      // Prevent embedded editor wheel handlers from applying the same movement a second time.
      event.stopPropagation();
      element.scrollBy({
        [horizontal ? 'left' : 'top']: delta * unit * FAST_SCROLL_MULTIPLIER,
        behavior: 'instant',
      });
      return;
    }
  };
  document.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return () => document.removeEventListener('wheel', onWheel, true);
}
