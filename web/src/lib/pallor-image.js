import { clamp } from './format.js';

/**
 * Generate a stand-in conjunctiva image as a data: URI.
 *
 * The real app captures a photo and computes redness over a region of
 * interest; this lets the prototype show a plausible image without a camera.
 * Lower score = paler (more anemic-looking), higher = healthier red.
 *
 * @param {number} score 0..1
 * @returns {string} data:image/svg+xml URI
 */
export function pallorSwatch(score) {
  const healthy = { r: 198, g: 64, b: 74 };
  const pale = { r: 224, g: 176, b: 178 };
  const t = clamp(score, 0, 1);
  const mix = (a, b) => Math.round(a + (b - a) * t);
  const r = mix(pale.r, healthy.r);
  const g = mix(pale.g, healthy.g);
  const b = mix(pale.b, healthy.b);

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='180'>
    <defs><radialGradient id='g' cx='50%' cy='40%' r='75%'>
      <stop offset='0%' stop-color='rgb(${r + 18},${g + 22},${b + 22})'/>
      <stop offset='60%' stop-color='rgb(${r},${g},${b})'/>
      <stop offset='100%' stop-color='rgb(${Math.round(r * 0.7)},${Math.round(
        g * 0.6,
      )},${Math.round(b * 0.6)})'/>
    </radialGradient></defs>
    <rect width='240' height='180' fill='#141414'/>
    <path d='M0 78 Q120 20 240 78 Q120 150 0 78 Z' fill='url(#g)'/>
    <path d='M0 78 Q120 20 240 78' fill='none' stroke='rgba(255,255,255,0.12)' stroke-width='2'/>
    <ellipse cx='120' cy='80' rx='30' ry='30' fill='rgba(40,30,40,0.85)'/>
    <circle cx='120' cy='80' r='13' fill='#0b0b0e'/>
    <circle cx='113' cy='73' r='4' fill='rgba(255,255,255,0.5)'/>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
