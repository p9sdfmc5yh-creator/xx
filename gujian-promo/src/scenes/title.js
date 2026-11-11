// title — 片名卡 for 《中国古建筑》. The shared card logic lives in lib/titlecard.js; this file only supplies the film's own words
// and its opening image (the Great Wall dawn), which the camera tilts back down onto so the film loops.
import { makeTitleScene } from '../lib/titlecard.js';
import { initDawn, drawDawn } from './s01-great-wall-dawn.js';
import { STYLE } from '../timeline.js';

export default makeTitleScene({
  initOpening: initDawn,
  drawOpening: drawDawn,
  title: '中国古建筑',
  seal: '营造',
  cta: ['千年营造', '等你发现'],
  tilt0: 720,
  style: () => STYLE.title,
});
