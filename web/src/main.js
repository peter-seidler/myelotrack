import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { $ } from './lib/dom.js';
import { store } from './state/store.js';
import { fmtDate } from './lib/format.js';
import { initSheet } from './ui/sheet.js';
import { initRouter } from './router.js';

/** Bootstrap the app: fill chrome, wire the sheet, start the router. */
function main() {
  const { user } = store.state;
  $('#navDate').textContent = fmtDate(new Date(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).toUpperCase();
  $('#navAvatar').textContent = user.initials;

  initSheet();
  initRouter();
}

main();
