// title — 片名卡 for 《中国古钱币》. Card logic is shared (lib/titlecard.js); the opening shot supplies the image the camera tilts back onto.
import { makeTitleScene } from '../../../lib/titlecard.js';
import { initOpening, drawOpening, TITLE_TILT } from './s01-furnace-rim.js';
import { STYLE, TITLE } from '../timeline.js';

export default makeTitleScene({ initOpening, drawOpening, title: TITLE.title, seal: TITLE.seal, cta: TITLE.cta, brand: TITLE.brand, tilt0: TITLE_TILT || 720, style: () => STYLE.title });
