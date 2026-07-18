import { $ } from '../lib/dom.js';

let hideTimer;

/** Show a transient toast message. */
export function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => node.classList.remove('show'), 1900);
}
