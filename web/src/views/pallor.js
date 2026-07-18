import { el, clear } from '../lib/dom.js';
import { store } from '../state/store.js';
import { fmtDate, clamp } from '../lib/format.js';
import { pallorSwatch } from '../lib/pallor-image.js';
import { openSheet, closeSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { latestDraw } from '../data/labs.js';
import { totalSymptomScore } from '../data/symptoms.js';

/** Render the Pallor tab: conjunctiva photo readings vs. hemoglobin context. */
export function renderPallor(container) {
  const { state } = store;
  clear(container);

  const latest = state.pallor[0];
  const previous = state.pallor[1];
  const trend = previous ? latest.pallorScore - previous.pallorScore : 0;
  const hemoglobin = latestDraw(state.labs, 'hemoglobin').value;

  // --- Summary ---
  const card = el('div', { class: 'card' });
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div>
        <div style="font-size:13px;color:var(--label-2)">Latest pallor reading</div>
        <div style="font-family:'Inter Tight';font-size:30px;font-weight:800">${Math.round(latest.pallorScore * 100)}
          <span style="font-size:15px;color:var(--label-2);font-weight:500">/ 100 redness</span></div>
      </div>
      <div style="text-align:right">
        <div class="pill" style="color:${trend < 0 ? 'var(--orange)' : 'var(--green)'};background:rgba(255,255,255,0.06)">
          ${trend < 0 ? '▼ paler' : '▲ pinker'} ${Math.abs(Math.round(trend * 100))}</div>
      </div>
    </div>
    <div style="font-size:13px;color:var(--label-3);margin-top:10px;line-height:1.45">
      Higher = pinker conjunctiva (more oxygen-carrying blood). Tracks loosely with hemoglobin
      (currently <b style="color:var(--label-2)">${hemoglobin} g/dL</b>) — a between-draws cue,
      never a substitute for a CBC.</div>`;
  container.append(card);

  // --- Capture ---
  container.append(el('div', { class: 'section-title' }, 'New reading'));
  container.append(
    el(
      'button',
      { class: 'btn secondary', onclick: openCaptureSheet },
      'Capture eye photo',
    ),
  );

  // --- History gallery ---
  container.append(el('div', { class: 'section-title' }, 'History'));
  const grid = el('div', { class: 'pallor-grid' });
  for (const reading of state.pallor) {
    grid.append(
      el('div', { class: 'pallor-cell' }, [
        el('img', {
          src: reading.img,
          alt: `Conjunctiva photo, ${fmtDate(reading.capturedAt, { month: 'short', day: 'numeric' })}`,
        }),
        el('div', { class: 'cap' }, [
          el('span', {}, fmtDate(reading.capturedAt, { month: 'short', day: 'numeric' })),
          el('span', { class: 'score' }, String(Math.round(reading.pallorScore * 100))),
        ]),
      ]),
    );
  }
  container.append(grid);
  container.append(
    el(
      'p',
      { class: 'disclaimer' },
      'Not a medical device. Conjunctival pallor is a rough, lighting-sensitive signal for anemia — use it to decide when to call, not to self-diagnose. Take photos in consistent natural light.',
    ),
  );
}

/** Open the capture sheet: try the real camera, fall back to a generated swatch. */
function openCaptureSheet() {
  let stream = null;

  openSheet(
    (sheet) => {
      sheet.append(
        el('h2', {}, 'Capture eye photo'),
        el(
          'p',
          { class: 'lede' },
          'Pull down your lower eyelid and photograph the inner rim (palpebral conjunctiva) in even, natural light.',
        ),
      );

      const preview = el('div', {
        style:
          'aspect-ratio:4/3;border-radius:14px;overflow:hidden;background:#000;margin-bottom:14px;display:grid;place-items:center',
      });
      const video = el('video', {
        autoplay: '',
        playsinline: '',
        muted: '',
        style: 'width:100%;height:100%;object-fit:cover;display:none',
      });
      const placeholder = el(
        'div',
        { class: 'empty', style: 'padding:0' },
        'Camera preview will appear here',
      );
      preview.append(video, placeholder);
      sheet.append(preview);

      const shootBtn = el(
        'button',
        {
          class: 'btn',
          disabled: '',
          onclick: () => {
            // A real build grabs a frame and computes redness over the ROI.
            // Prototype: synthesize a plausible next reading near the last one.
            const base = store.state.pallor[0]?.pallorScore ?? 0.42;
            const jitter =
              Math.round((totalSymptomScore(store.state.todayItems) % 7) - 3) / 100;
            const score = clamp(base + jitter, 0.2, 0.8);
            store.commit((s) => {
              s.pallor.unshift({
                id: `p${s.pallor.length + 1}`,
                capturedAt: new Date(),
                eye: 'right',
                pallorScore: Number(score.toFixed(2)),
                img: pallorSwatch(score),
              });
            });
            if (stream) stream.getTracks().forEach((t) => t.stop());
            closeSheet();
            toast('Reading saved');
          },
        },
        'Take photo',
      );

      const startBtn = el(
        'button',
        {
          class: 'btn secondary',
          onclick: async () => {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
              });
              video.srcObject = stream;
              video.style.display = 'block';
              placeholder.style.display = 'none';
              startBtn.style.display = 'none';
              shootBtn.disabled = false;
            } catch {
              toast('Camera unavailable — using sample');
              shootBtn.disabled = false;
            }
          },
        },
        'Start camera',
      );

      sheet.append(startBtn, shootBtn);
    },
    {
      onClose: () => {
        if (stream) stream.getTracks().forEach((t) => t.stop());
      },
    },
  );
}
