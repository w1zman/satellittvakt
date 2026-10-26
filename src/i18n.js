// Language: English (default) or Simplified Chinese.
// Chosen by ?lang=zh / ?lang=en, then the saved choice, then the browser language.
// Runs before the page is shown, so the text never flashes in the wrong language.
(function () {
  const pick = v => (v === 'zh' || v === 'en') ? v : null;
  let lang = null;
  try { lang = pick(new URLSearchParams(location.search).get('lang')); } catch (e) {}
  if (lang) { try { localStorage.setItem('sv-lang', lang); } catch (e) {} }
  if (!lang) { try { lang = pick(localStorage.getItem('sv-lang')); } catch (e) {} }
  if (!lang) lang = (navigator.languages || [navigator.language || '']).some(l => /^zh\b/i.test(l || '')) ? 'zh' : 'en';
  const ZH = lang === 'zh';
  window.SV_LANG = lang;
  window.L = (en, zh) => ZH ? zh : en;
  document.documentElement.lang = ZH ? 'zh-CN' : 'en';
  document.documentElement.classList.toggle('lang-zh', ZH);

  // Static page text in Chinese, keyed by data-i18n / data-i18n-aria / data-i18n-title.
  const T = {
    eyebrow: ' · 实时星空',
    placeGroup: '选择地点',
    myLocTitle: '使用我的位置',
    myLoc: '我的位置',
    narvik: '纳尔维克',
    tromso: '特罗姆瑟',
    h1: '<em class="pname">纳尔维克</em>上空的卫星',
    lede: '这些光点是此刻在镇子上空被阳光照亮的卫星和火箭箭体，绿色的光是 NOAA 的北极光预报。拖动可旋转视图，双指捏合或滚动可缩放，点按光点或列表中的一行可查看详情。用“我的位置”查看你所在地的星空，在“仰望”模式中打开指南针，把手机平放，就能看到你头顶的天空。',
    view3d: '3D 视图',
    loading: '正在加载轨道数据 …',
    viewGroup: '视图',
    sky: '天空',
    look: '仰望',
    earth: '地球',
    compass: '指南针',
    fullscreen: '全屏',
    live: '实时',
    timeRange: '距现在的时间（分钟）',
    now: '现在',
    speedGroup: '速度',
    layersGroup: '图层',
    stations: '空间站',
    bright: '亮目标',
    starlink: '星链',
    aurora: '北极光',
    shade: '显示地球阴影中的目标',
    method: '卫星位置由浏览器根据 <a href="https://celestrak.org/NORAD/elements/" target="_blank" rel="noopener">CelesTrak</a> 的轨道数据，用简化的 SGP4 模型计算。数据新鲜时，天空中的位置误差约为一度；数据越旧，误差越大。目标被阳光照亮、高于地平线至少 10°，并且所选地点的太阳低于地平线 6° 以上时，才算可见。“亮目标”是 CelesTrak 列出的约 150 个最亮的卫星和火箭箭体。星链图层显示的是从挪威北部高空经过的那些轨道上的卫星。轨道数据每天自动更新两次，“轨道数据”一栏显示最近一次获取的时间。3D 北极光是 NOAA 对未来 30–60 分钟的 OVATION 预报，绘制在 100–250 公里高度，只有在时间轴接近现在时才显示。闪烁的绿色圆环标出视野中最近的、被阳光照亮的卫星，优先选择正在靠近的那颗。星星用于辨认方向。',
    auroraNow: '当前北极光',
    loadingShort: '加载中 …',
    auroraLoading: '正在从 NOAA 和挪威气象研究所加载数据 …',
    probOver: '<span class="pname">纳尔维克</span>上空的概率',
    kpNow: '当前 Kp 指数',
    cloudIn: '<span class="pname">纳尔维克</span>的云量',
    kpFc: 'Kp 预报，未来 24 小时',
    cloudFc: '云量，未来 12 小时',
    alertTitle: '北极光提醒',
    alertState: '挪威或芬兰出现北极光时通知你',
    auroraSrc: '来源：<a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener">NOAA SWPC</a>（OVATION 预报、Kp、太阳风）和<a href="https://api.met.no" target="_blank" rel="noopener">挪威气象局</a>（云量，CC BY 4.0）。每隔几分钟更新一次。',
    passes: '接下来的明亮过境',
    passesInfo: '未来 12 小时内天色足够暗的时段。列出最高点时间、最大高度角和方向。点按即可跳到那个时刻。',
    colTime: '时间',
    colObject: '目标',
    colMax: '最高',
    colDir: '方向',
    calcPasses: '正在计算过境 …',
    spaceStations: '空间站',
    calculating: '计算中 …',
    iss: '国际空间站',
    tiangong: '天宫',
    orbitData: '轨道数据',
    fetched: '获取时间',
    langGroup: '语言',
  };
  function apply() {
    if (ZH) {
      document.querySelectorAll('[data-i18n]').forEach(el => { const v = T[el.dataset.i18n]; if (v != null) el.innerHTML = v; });
      document.querySelectorAll('[data-i18n-aria]').forEach(el => { const v = T[el.dataset.i18nAria]; if (v != null) el.setAttribute('aria-label', v); });
      document.querySelectorAll('[data-i18n-title]').forEach(el => { const v = T[el.dataset.i18nTitle]; if (v != null) el.title = v; });
    }
    document.querySelectorAll('.lang button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
      b.addEventListener('click', () => {
        if (b.dataset.lang === lang) return;
        try { localStorage.setItem('sv-lang', b.dataset.lang); } catch (e) {}
        const u = new URL(location.href); u.searchParams.set('lang', b.dataset.lang);
        location.replace(u.toString());
      });
    });
  }
  apply();
})();
