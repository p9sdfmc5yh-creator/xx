// fonts.js — every typeface the films may use. All are SIL OFL 1.1; tools/fetch-fonts.sh downloads them to assets/fonts/.
// `required: false` fonts are optional extras: if the file is missing the film still renders (with a fallback face).
export const FONT_FILES = [
  { family: 'GJ Serif', file: 'NotoSerifSC.ttf', desc: { weight: '200 900' }, required: true },   // 思源宋体 (variable)
  { family: 'GJ Brush', file: 'MaShanZheng.ttf', desc: {}, required: true },                      // 马善政楷书
  { family: 'GJ XiaoWei', file: 'ZCOOLXiaoWei.ttf', desc: {}, required: true },                   // 站酷小薇
  { family: 'GJ Cao', file: 'LiuJianMaoCao.ttf', desc: {}, required: true },                      // 刘建毛草
  { family: 'GJ Latin', file: 'CormorantGaramond.ttf', desc: { weight: '300 700' }, required: true },
  { family: 'GJ WenKai', file: 'LXGWWenKai-Medium.ttf', desc: {}, required: false },              // 霞鹜文楷
  { family: 'GJ WenKaiLight', file: 'LXGWWenKai-Light.ttf', desc: {}, required: false },
  { family: 'GJ WenKaiRegular', file: 'LXGWWenKai-Regular.ttf', desc: {}, required: false },
  { family: 'GJ LongCang', file: 'LongCang.ttf', desc: {}, required: false },                     // 龙藏体 (行书)
  { family: 'GJ ZhiMang', file: 'ZhiMangXing.ttf', desc: {}, required: false },                   // 志莽行书
  { family: 'GJ SerifTC', file: 'NotoSerifTC.ttf', desc: { weight: '200 900' }, required: false },
  { family: 'GJ HuangYou', file: 'ZCOOLQingKeHuangYou.ttf', desc: {}, required: false },          // 站酷庆科黄油体
];
