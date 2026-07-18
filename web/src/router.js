import { $, $$, el } from './lib/dom.js';
import { store } from './state/store.js';
import { renderToday } from './views/today.js';
import { renderMeds } from './views/meds.js';
import { renderLabs } from './views/labs.js';
import { renderPallor } from './views/pallor.js';

const ICONS = {
  today: '<path d="M3 12h4l2 6 4-14 2 8h6"/>',
  meds: '<rect x="3" y="8" width="18" height="12" rx="3"/><path d="M12 8V5a2 2 0 0 1 2-2h1M9 14h6"/>',
  labs: '<path d="M9 3v6l-5 8a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-8V3M9 3h6M8 15h8"/>',
  pallor:
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};

const TABS = [
  { id: 'today', title: 'Today', label: 'Today', render: renderToday },
  { id: 'meds', title: 'Medications', label: 'Meds', render: renderMeds },
  { id: 'labs', title: 'Labs', label: 'Labs', render: renderLabs },
  { id: 'pallor', title: 'Pallor', label: 'Pallor', render: renderPallor },
];

let activeId = 'today';

const tabById = (id) => TABS.find((t) => t.id === id);

/** Re-render the currently active tab from state. */
function renderActive() {
  const tab = tabById(activeId);
  tab.render($(`#view-${tab.id}`));
}

/** Switch to a tab: toggle visibility, update title, render, reset scroll. */
export function switchTab(id) {
  activeId = id;
  $$('.tab-view').forEach((v) => v.classList.toggle('active', v.id === `view-${id}`));
  $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  $('#navTitle').textContent = tabById(id).title;
  renderActive();
  $('#scroll').scrollTop = 0;
}

function buildTabBar() {
  const bar = $('#tabbar');
  for (const tab of TABS) {
    const button = el(
      'button',
      { 'data-tab': tab.id, onclick: () => switchTab(tab.id) },
      [tab.label],
    );
    button.insertAdjacentHTML(
      'afterbegin',
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">${ICONS[tab.id]}</svg>`,
    );
    bar.append(button);
  }
}

/** Initialize navigation: build the tab bar, wire scroll shadow + store subscription. */
export function initRouter() {
  buildTabBar();

  // Re-render the active tab whenever committed state changes.
  store.subscribe(() => renderActive());

  // Nav bar shadow appears once content scrolls under it.
  $('#scroll').addEventListener('scroll', (e) => {
    $('#navbar').classList.toggle('scrolled', e.target.scrollTop > 6);
  });

  switchTab('today');
}
