// เอนจินจัดหน้า: วาดองค์ประกอบเป็น HTML ขนาดจริง (A4) ตามค่าจากไฟล์ Word ต้นแบบ แล้วแบ่งหน้า
(function () {
  const px = U.tw2px;
  const cm = U.cm2px;
  // ความสูงบรรทัดเดี่ยวของ TH Sarabun = (winAscent + winDescent + lineGap) / unitsPerEm
  const LINE_FACTOR = (844 + 457 + 30) / 1000;
  const FONT = '"TH SarabunPSK","TH Sarabun New","THSarabunNew",sans-serif';

  // ค่าของหน้ากระดาษ (ซม.) — จาก sectPr / header / footer ของไฟล์ต้นแบบ
  const BASES = {
    daily: {
      pageW: 21.0, pageH: 29.7,
      left: 1701, right: 1134, // twips
      bodyTop: 2.8, bodyBottom: 28.22,
      logo: { x: 8.55, y: 0.03, w: 4.895, h: 2.736 },
      line: { x1: 2.8, x2: 19.29, y: 2.81, w: 1 },
      footer: { size: 12, top: 28.27, center: 11.0, width: 18 },
    },
    letter: {
      pageW: 21.0, pageH: 29.7,
      left: 1701, right: 1133,
      bodyTop: 3.75, bodyBottom: 27.2,
      logo: { x: 8.37, y: 0.5, w: 5.336, h: 3.0 },
      line: null,
      footer: { size: 14, top: 28.15, center: 10.95, width: 20 },
    },
  };
  BASES.daily.contentTw = 11906 - BASES.daily.left - BASES.daily.right;
  BASES.letter.contentTw = 11906 - BASES.letter.left - BASES.letter.right;

  // ขนาดตาราง/รูป (จากไฟล์ต้นแบบ)
  const GEO = {
    photo: { ind: 960, col: 3544, rowH: 2130, imgW: 5.33, imgH: 3.0 },
    inc: { ind: -147, cols: [6238, 3402], imgW: 5.33, imgH: 2.99, textFmt: { before: 0, after: 160, line: 259, align: 'thaiDistribute', indLeft: 0, hanging: 0, firstLine: 0, tabs: [], list: false, bold: false, size: 16 } },
    grid: { ind: -380, cols: [5012, 4774], imgW: 8.42, imgH: 4.74, gapFirst: 153, gap: 255 },
    cellMar: 108,
  };

  const Layout = { BASES, GEO, LINE_FACTOR, FONT };

  // ---------- ข้อมูลหัว/ท้ายกระดาษจากไฟล์โครง Word ----------
  const skelCache = {};
  Layout.skeleton = async (base) => {
    if (skelCache[base]) return skelCache[base];
    const zip = await JSZip.loadAsync(U.base64ToBytes(window.SKELETONS[base]));
    const out = { logoUrl: null, footerLines: [] };
    const hrels = zip.file('word/_rels/header1.xml.rels');
    if (hrels) {
      const m = (await hrels.async('string')).match(/Target="media\/([^"]+)"/);
      if (m) out.logoUrl = URL.createObjectURL(new Blob([await zip.file('word/media/' + m[1]).async('uint8array')], { type: 'image/jpeg' }));
    }
    const f = zip.file('word/footer1.xml');
    if (f) {
      let x = await f.async('string');
      x = x.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '');
      const paras = x.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
      for (const p of paras) {
        const t = (p.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map((s) => s.replace(/<[^>]+>/g, '')).join('');
        if (t.trim()) out.footerLines.push(t.replace(/&amp;/g, '&'));
      }
    }
    skelCache[base] = out;
    return out;
  };

  // ---------- วัดความกว้างข้อความ (สำหรับคำนวณตำแหน่งแท็บ) ----------
  let mctx = null;
  function measure(text, sizePt, bold) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = `${bold ? 'bold ' : ''}${sizePt * U.PX_PER_PT}px ${FONT}`;
    return mctx.measureText(text).width;
  }

  function lineHeightPx(fmt) {
    if (fmt.lineRule === 'exact') return px(fmt.line);
    return fmt.size * U.PX_PER_PT * LINE_FACTOR * ((fmt.line || 240) / 240);
  }

  // วาดย่อหน้า (ตาม pPr ของ Word)
  function renderPara(text, fmt, eb, ea) {
    const f = fmt;
    const el = U.h('div.wp');
    el.style.paddingTop = px(eb != null ? eb : f.before || 0) + 'px';
    el.style.paddingBottom = px(ea != null ? ea : f.after || 0) + 'px';
    el.style.paddingLeft = px(f.indLeft || 0) + 'px';
    el.style.fontSize = f.size + 'pt';
    el.style.fontWeight = f.bold ? '700' : '400';
    el.style.lineHeight = lineHeightPx(f) + 'px';
    const justify = f.align === 'thaiDistribute' || f.align === 'both' || f.align === 'distribute';
    el.style.textAlign = justify ? 'justify' : f.align === 'center' ? 'center' : f.align === 'right' ? 'right' : 'left';
    if (justify && f.align !== 'both') el.classList.add('dist');
    const segs = String(text || '').split('\n');
    segs.forEach((seg, si) => {
      const s = U.h('div.seg');
      const firstOffsetTw = si === 0 ? (f.firstLine || 0) - (f.hanging || 0) : 0;
      if (firstOffsetTw) s.style.textIndent = px(firstOffsetTw) + 'px';
      if (justify && si < segs.length - 1) s.style.textAlignLast = 'justify';
      if (seg.indexOf('\t') >= 0) {
        // คำนวณแท็บ: ตำแหน่งวัดจากขอบซ้ายของเนื้อหา
        const stops = (f.tabs || []).slice().sort((a, b) => a - b);
        const maxCustom = stops.length ? stops[stops.length - 1] : 0;
        if (f.hanging) stops.push(f.indLeft || 0);
        let x = (f.indLeft || 0) + firstOffsetTw; // twips
        const parts = seg.split('\t');
        parts.forEach((part, pi) => {
          if (part) s.appendChild(document.createTextNode(part));
          x += (measure(part, f.size, f.bold) / U.PX_PER_PT) * 20;
          if (pi < parts.length - 1) {
            // แท็บที่กำหนดเอง (+ ตำแหน่งย่อหน้าแขวน) ก่อน แล้วจึงแท็บเริ่มต้นทุก 1.27 ซม. ที่อยู่ถัดจากแท็บที่กำหนดเอง
            let next = stops.filter((t) => t > x + 1).sort((a, b) => a - b)[0];
            if (next == null) {
              next = (Math.floor(Math.max(x, maxCustom) / 720) + 1) * 720;
              while (next <= x + 1) next += 720;
            }
            const w = px(next - x);
            s.appendChild(U.h('span.tab', { style: { width: w + 'px' } }));
            x = next;
          }
        });
      } else {
        s.textContent = seg || ' ';
      }
      if (!seg) s.textContent = ' ';
      el.appendChild(s);
    });
    return el;
  }

  function imgBox(id, imgs, wcm, hcm, placeholder) {
    const box = U.h('div.imgbox', { style: { width: cm(wcm) + 'px', height: cm(hcm) + 'px' } });
    const info = id && imgs[id];
    if (info) box.appendChild(U.h('img', { src: info.url, draggable: false }));
    else if (placeholder) box.appendChild(U.h('div.ph', 'รูปภาพ'));
    else if (id) box.appendChild(U.h('div.ph.missing', 'ไม่พบรูป'));
    else box.classList.add('empty');
    return box;
  }

  // วาดแต่ละองค์ประกอบเป็น DOM
  function renderItem(it, ctx) {
    const { imgs, base } = ctx;
    if (it.k === 'para') return renderPara(it.text, it.fmt, it.eb, it.ea);
    if (it.k === 'photoRow') {
      const g = GEO.photo;
      const row = U.h('div.trow.photo' + (it.first ? '.first' : ''), { style: { marginLeft: px(g.ind) + 'px', height: px(g.rowH) + 'px' } });
      it.imgs.forEach((id) => row.appendChild(U.h('div.tcell', { style: { width: px(g.col) + 'px' } }, imgBox(id, imgs, g.imgW, g.imgH, it.ph))));
      return row;
    }
    if (it.k === 'incRow') {
      const g = GEO.inc;
      const row = U.h('div.trow.incrow' + (it.first ? '.first' : ''), { style: { marginLeft: px(g.ind) + 'px' } });
      const c1 = U.h('div.tcell', { style: { width: px(g.cols[0]) + 'px', padding: `0 ${px(GEO.cellMar)}px` } }, renderPara(it.text, g.textFmt));
      const c2 = U.h('div.tcell.imgs', { style: { width: px(g.cols[1]) + 'px' } });
      it.imgs.forEach((id) => c2.appendChild(U.h('div.incimg', imgBox(id, imgs, g.imgW, g.imgH, false))));
      row.append(c1, c2);
      return row;
    }
    if (it.k === 'gridRow') {
      const g = GEO.grid;
      const row = U.h('div.grrow', { style: { marginLeft: px(g.ind) + 'px', paddingTop: px(it.first ? g.gapFirst : g.gap) + 'px' } });
      it.imgs.forEach((id, i) => {
        if (id === undefined) return;
        row.appendChild(U.h('div.gcell', { style: { width: px(g.cols[i]) + 'px' } }, imgBox(id, imgs, g.imgW, g.imgH, it.ph)));
      });
      return row;
    }
    if (it.k === 'break') return U.h('div.pbreak');
    return U.h('div');
  }
  Layout.renderItem = renderItem;

  // ระยะห่างแบบ contextualSpacing (List Paragraph ติดกันไม่เว้นระยะ)
  function applyContextual(items) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.k !== 'para') continue;
      it.eb = null; it.ea = null;
    }
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1], b = items[i];
      if (a.k === 'para' && b.k === 'para' && a.fmt.list && b.fmt.list) { a.ea = 0; b.eb = 0; }
    }
  }

  // กลุ่มที่ควรอยู่หน้าเดียวกัน: หัวข้อ/ย่อหน้าที่ต่อเนื่องกัน + แถวแรกของตารางที่ตามมา
  // (ส่งออกเป็น keepNext ในไฟล์ Word ด้วย เพื่อให้ Word แบ่งหน้าแบบเดียวกัน)
  Layout.keepFlags = (items) => items.map((it, i) => {
    if (it.k !== 'para') return false;
    const nx = items[i + 1];
    if (!nx || nx.k === 'break') return false;
    if (it.fmt.keepNext) return true;
    if (!String(it.text).trim()) return false;
    if (nx.k === 'para') return !!String(nx.text).trim() && (it.fmt.bold || it.fmt.list || nx.fmt.list) && it.text.length < 400;
    return nx.first === true;
  });

  // ---------- แบ่งหน้า ----------
  // คืนค่า [{items:[...], forced:boolean}] (forced = หน้านี้เริ่มจากตัวแบ่งหน้าในเทมเพลต)
  Layout.paginate = async (items, base, imgs) => {
    const B = BASES[base];
    const widthPx = px(B.contentTw);
    const pageH = cm(B.bodyBottom - B.bodyTop);
    applyContextual(items);
    const host = U.h('div.measure', { style: { width: widthPx + 'px' } });
    document.body.appendChild(host);
    const ctx = { imgs, base };
    const hs = items.map((it) => {
      if (it.k === 'break') return 0;
      const el = renderItem(it, ctx);
      host.appendChild(el);
      const r = el.getBoundingClientRect().height;
      host.removeChild(el);
      return r;
    });
    host.remove();

    const keepWithNext = Layout.keepFlags(items);

    const pages = [];
    let cur = { items: [], forced: false };
    let used = 0;
    const push = () => { pages.push(cur); cur = { items: [], forced: false }; used = 0; };
    let i = 0;
    while (i < items.length) {
      const it = items[i];
      if (it.k === 'break') {
        push();
        cur.forced = true;
        i++;
        continue;
      }
      // หาความสูงของกลุ่ม
      let j = i, gh = hs[i];
      while (keepWithNext[j] && j + 1 < items.length && items[j + 1].k !== 'break') { j++; gh += hs[j]; }
      if (gh > pageH * 0.6) { j = i; gh = hs[i]; }
      if (used + gh > pageH + 0.5 && cur.items.length) push();
      for (let k = i; k <= j; k++) { cur.items.push(items[k]); used += hs[k]; }
      i = j + 1;
    }
    if (cur.items.length || !pages.length) pages.push(cur);
    pages.forEach((p, n) => { p.key = 'a' + n; });
    return pages;
  };

  // ---------- วาดหน้า ----------
  Layout.renderPage = async (page, base, imgs, { scale = 1 } = {}) => {
    const B = BASES[base];
    const sk = await Layout.skeleton(base);
    const el = U.h('div.page', { style: { width: cm(B.pageW) + 'px', height: cm(B.pageH) + 'px' } });
    if (sk.logoUrl) el.appendChild(U.h('img.logo', { src: sk.logoUrl, style: { left: cm(B.logo.x) + 'px', top: cm(B.logo.y) + 'px', width: cm(B.logo.w) + 'px', height: cm(B.logo.h) + 'px' } }));
    if (B.line) el.appendChild(U.h('div.hline', { style: { left: cm(B.line.x1) + 'px', top: cm(B.line.y) + 'px', width: cm(B.line.x2 - B.line.x1) + 'px', borderTopWidth: B.line.w * U.PX_PER_PT + 'px' } }));
    const ft = U.h('div.footer', { style: { top: cm(B.footer.top) + 'px', left: cm(B.footer.center - B.footer.width / 2) + 'px', width: cm(B.footer.width) + 'px', fontSize: B.footer.size + 'pt', lineHeight: B.footer.size * U.PX_PER_PT * LINE_FACTOR + 'px' } });
    sk.footerLines.forEach((l) => ft.appendChild(U.h('div', l)));
    el.appendChild(ft);
    const body = U.h('div.pbody', { style: { left: px(B.left) + 'px', top: cm(B.bodyTop) + 'px', width: px(B.contentTw) + 'px' } });
    const items = page.items;
    applyContextual(items);
    const ctx = { imgs, base };
    items.forEach((it) => body.appendChild(renderItem(it, ctx)));
    el.appendChild(body);
    if (scale !== 1) {
      const wrap = U.h('div.page-wrap', { style: { width: cm(B.pageW) * scale + 'px', height: cm(B.pageH) * scale + 'px' } });
      el.style.transform = `scale(${scale})`;
      el.style.transformOrigin = '0 0';
      wrap.appendChild(el);
      return wrap;
    }
    return el;
  };

  // ---------- ลำดับหน้าสุดท้าย (หลังจัดหน้า: ซ่อน/ย้าย/แทรก) ----------
  Layout.finalPages = (autoPages, layout) => {
    layout = layout || {};
    const extras = layout.extras || {};
    const hidden = new Set(layout.hidden || []);
    const autoKeys = autoPages.map((p) => p.key);
    let order = (layout.order || []).filter((k) => autoKeys.includes(k) || (k.startsWith('x:') && extras[k.slice(2)]));
    // ใส่หน้าอัตโนมัติที่ยังไม่อยู่ในลำดับ (เช่น เนื้อหายาวขึ้นจนมีหน้าเพิ่ม)
    autoKeys.forEach((k, idx) => {
      if (order.includes(k)) return;
      const prev = autoKeys.slice(0, idx).reverse().find((p) => order.includes(p));
      if (prev == null) order.unshift(k);
      else order.splice(order.indexOf(prev) + 1, 0, k);
    });
    Object.keys(extras).forEach((id) => { if (!order.includes('x:' + id)) order.push('x:' + id); });
    const byKey = Object.fromEntries(autoPages.map((p) => [p.key, p]));
    return order.map((k) => (k.startsWith('x:') ? { key: k, extra: extras[k.slice(2)], extraId: k.slice(2) } : Object.assign({}, byKey[k], { hidden: hidden.has(k) })));
  };

  // เตรียมหน้าทั้งหมดของรายงาน: คืน {base, pages(final), imgs}
  Layout.build = async (report, opts = {}) => {
    await Layout.fontsReady();
    const base = report.tpl.base;
    const items = Report.expand(report, opts);
    const extras = (report.pageLayout && report.pageLayout.extras) || {};
    const ids = [];
    items.forEach((it) => it.imgs && ids.push(...it.imgs));
    Object.values(extras).forEach((x) => ids.push(...(x.images || [])));
    const imgs = await Images.resolve(ids);
    const auto = await Layout.paginate(items, base, imgs);
    const pages = [];
    for (const p of Layout.finalPages(auto, report.pageLayout)) {
      if (!p.extra) { pages.push(p); continue; }
      // หน้าแทรกที่มีรูปมากเกินหนึ่งหน้า -> แบ่งเป็นหลายหน้า (ย้าย/ลบไปด้วยกัน)
      const sub = await Layout.paginate(Report.expandExtra(p.extra, report), base, imgs);
      sub.forEach((s, i) => pages.push(Object.assign({}, p, { items: s.items, sub: i })));
    }
    return { base, pages, imgs, auto };
  };

  let fontsP = null;
  Layout.fontsReady = () => {
    if (!fontsP) {
      fontsP = Promise.all([
        document.fonts.load('16pt "TH SarabunPSK"', 'ก'),
        document.fonts.load('bold 16pt "TH SarabunPSK"', 'ก'),
        document.fonts.load('italic bold 12pt "TH SarabunPSK"', 'ก'),
      ]).catch(() => null);
    }
    return fontsP;
  };

  window.Layout = Layout;
})();
