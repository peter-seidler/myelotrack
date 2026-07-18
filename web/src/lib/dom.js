/** Tiny DOM helpers — no framework, just ergonomics. */

/** querySelector shorthand. */
export const $ = (selector, root = document) => root.querySelector(selector);

/** querySelectorAll shorthand, returned as a real array. */
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/**
 * Create an element.
 * @param {string} tag
 * @param {Object} [attrs] - attributes; `class`, `html`, and `on*` handlers are special-cased.
 * @param {(Node|string|null)|(Node|string|null)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else {
      node.setAttribute(key, value);
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const child of kids) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

/** Remove all children of a node. */
export function clear(node) {
  node.replaceChildren();
  return node;
}
