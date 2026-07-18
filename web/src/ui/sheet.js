import { $, el } from '../lib/dom.js';

let onCloseHook = null;

/**
 * Open the reusable bottom sheet.
 * @param {(sheet: HTMLElement) => void} build - populate the sheet body.
 * @param {{ onClose?: () => void }} [options]
 */
export function openSheet(build, options = {}) {
  const sheet = $('#sheet');
  const backdrop = $('#sheetBackdrop');
  onCloseHook = options.onClose || null;

  sheet.replaceChildren(el('div', { class: 'grabber' }));
  build(sheet);

  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    sheet.classList.add('open');
  });
}

/** Close the sheet, running any registered onClose hook. */
export function closeSheet() {
  const sheet = $('#sheet');
  const backdrop = $('#sheetBackdrop');
  if (onCloseHook) {
    onCloseHook();
    onCloseHook = null;
  }
  backdrop.classList.remove('open');
  sheet.classList.remove('open');
}

/** Wire the backdrop click-to-dismiss (called once at startup). */
export function initSheet() {
  $('#sheetBackdrop').addEventListener('click', closeSheet);
}
