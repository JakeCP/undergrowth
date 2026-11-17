const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} tag
 * @param {Record<string, string|number>} attrs
 * @param {Element} [parent]
 * @returns {SVGElement}
 */
export function el(tag, attrs, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    e.setAttribute(k, String(v));
  }
  if (parent !== undefined) parent.appendChild(e);
  return e;
}
