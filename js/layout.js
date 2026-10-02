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
      bodyTop: 3.56, bodyBottom: 27.2,
      logo: { x: 8.37, y: 0.28, w: 5.336, h: 3.0 },
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

  const BULLET_TW = 147; // ความกว้างสัญลักษณ์ • (Symbol) ที่ 16pt
  const spPx = (sp) => ((sp || 0) / 20) * U.PX_PER_PT; // ระยะห่างตัวอักษร (1/20 pt) -> px
  let segmenter = null;
  const graphemes = (t) => {
    if (!segmenter && window.Intl && Intl.Segmenter) segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
    return segmenter ? Array.from(segmenter.segment(t), (x) => x.segment) : Array.from(t);
  };

  // วาดย่อหน้า (ตาม pPr/rPr ของ Word) — runs: [[ข้อความ, ตัวหนา, ระยะห่างตัวอักษร]]
  function renderPara(text, fmt, eb, ea, runs) {
    const f = fmt;
    const el = U.h('div.wp');
    el.style.paddingTop = px(eb != null ? eb : f.before || 0) + 'px';
    el.style.paddingBottom = px(ea != null ? ea : f.after || 0) + 'px';
    el.style.paddingLeft = px(f.indLeft || 0) + 'px';
    el.style.fontSize = f.size + 'pt';
    el.style.lineHeight = lineHeightPx(f) + 'px';
    const justify = f.align === 'thaiDistribute' || f.align === 'both' || f.align === 'distribute';
    el.style.textAlign = f.align === 'center' ? 'center' : f.align === 'right' ? 'right' : 'left';
    if (justify) el.dataset.dist = '1';
    const list = runs && runs.length ? runs : [[String(text || ''), !!f.bold, f.charSpacing || 0]];
    // แบ่งเป็นบรรทัดตาม \n (Shift+Enter ใน Word)
    const segs = [[]];
    for (const [t, b, sp] of list) {
      String(t).split('\n').forEach((part, i) => {
        if (i > 0) segs.push([]);
        if (part) segs[segs.length - 1].push([part, b, sp]);
      });
    }
    // หาตำแหน่งแท็บถัดไป (วัดจากขอบซ้ายของเนื้อหา, หน่วย twips)
    const stops = (f.tabs || []).slice().sort((a, b) => a - b);
    const maxCustom = stops.length ? stops[stops.length - 1] : 0;
    if (f.hanging) stops.push(f.indLeft || 0);
    const nextStop = (x) => {
      let next = stops.filter((t) => t > x + 1).sort((a, b) => a - b)[0];
      if (next == null) { next = (Math.floor(Math.max(x, maxCustom) / 720) + 1) * 720; while (next <= x + 1) next += 720; }
      return next;
    };
    const span = (t, b, sp) => {
      const e = U.h('span', t);
      if (b) e.style.fontWeight = '700';
      if (sp) e.style.letterSpacing = spPx(sp) + 'px';
      return e;
    };
    segs.forEach((pieces, si) => {
      const s = U.h('div.seg');
      const firstOffsetTw = si === 0 ? (f.firstLine || 0) - (f.hanging || 0) : 0;
      if (firstOffsetTw) s.style.textIndent = px(firstOffsetTw) + 'px';
      if (justify && si < segs.length - 1) s.dataset.br = '1';
      let x = (f.indLeft || 0) + firstOffsetTw;
      if (si === 0 && f.numId) {
        // สัญลักษณ์หัวข้อ (bullet) ตามด้วยแท็บ เหมือน Word
        s.appendChild(U.h('span.bullet', { style: { width: px(BULLET_TW) + 'px' } }, '•'));
        x += BULLET_TW;
        const nx = nextStop(x);
        s.appendChild(U.h('span.tab', { style: { width: px(nx - x) + 'px' } }));
        x = nx;
      }
      for (const [t, b, sp] of pieces) {
        const parts = t.split('\t');
        parts.forEach((part, pi) => {
          if (part) {
            s.appendChild(span(part, b, sp));
            x += ((measure(part, f.size, b) + graphemes(part).length * spPx(sp)) / U.PX_PER_PT) * 20;
          }
          if (pi < parts.length - 1) {
            const nx = nextStop(x);
            s.appendChild(U.h('span.tab', { style: { width: px(nx - x) + 'px' } }));
            x = nx;
          }
        });
      }
      if (!s.childNodes.length) s.textContent = ' ';
      el.appendChild(s);
    });
    return el;
  }

  // จัดแบบ "กระจายแบบไทย" (thaiDistribute) ของ Word: เพิ่มระยะห่างระหว่างตัวอักษรให้เต็มบรรทัด
  // (ไม่ใช่ขยายเฉพาะช่องว่าง) — ต้องเรียกหลังจากองค์ประกอบอยู่ในหน้าเว็บแล้ว
  function distribute(root) {
    const paras = root.matches && root.matches('.wp[data-dist]') ? [root] : Array.from(root.querySelectorAll('.wp[data-dist]'));
    for (const p of paras) {
      const segs = Array.from(p.children).filter((c) => c.classList.contains('seg'));
      segs.forEach((seg, si) => {
        const lastSeg = si === segs.length - 1;
        const segRect = seg.getBoundingClientRect();
        // เก็บตำแหน่งของทุกตัวอักษร (grapheme) / แท็บ / bullet
        const units = [];
        for (const node of Array.from(seg.childNodes)) {
          if (node.nodeType !== 1) continue;
          if (node.classList.contains('tab') || node.classList.contains('bullet')) {
            const r = node.getBoundingClientRect();
            units.push({ el: node, left: r.left, right: r.right, top: r.top, kind: 'box' });
            continue;
          }
          const tn = node.firstChild;
          if (!tn) continue;
          let off = 0;
          for (const g of graphemes(tn.data)) {
            const rg = document.createRange();
            rg.setStart(tn, off);
            rg.setEnd(tn, off + g.length);
            off += g.length;
            const rects = rg.getClientRects();
            const r = rects.length ? rects[rects.length - 1] : rg.getBoundingClientRect();
            units.push({ g, src: node, left: r.left, right: r.right, top: r.top, kind: 'ch' });
          }
        }
        if (!units.length) return;
        // แบ่งเป็นบรรทัดตามตำแหน่งแนวตั้งของตัวอักษร (แท็บ/bullet ไปอยู่บรรทัดเดียวกับตัวอักษรถัดไป)
        const lh = parseFloat(p.style.lineHeight) || 20;
        const lines = [];
        let cur = null;
        let pendingBoxes = [];
        for (const u of units) {
          if (u.kind === 'box') { pendingBoxes.push(u); continue; }
          if (!cur || u.top > cur.top + lh * 0.5) { cur = { top: u.top, units: [] }; lines.push(cur); }
          if (pendingBoxes.length) { cur.units.push(...pendingBoxes); pendingBoxes = []; }
          cur.units.push(u);
        }
        if (pendingBoxes.length) {
          if (!cur) { cur = { top: 0, units: [] }; lines.push(cur); }
          cur.units.push(...pendingBoxes);
        }
        seg.innerHTML = '';
        seg.style.textIndent = '0';
        lines.forEach((ln, li) => {
          // ตัดช่องว่างท้ายบรรทัด (Word ไม่นับ)
          let us = ln.units;
          while (us.length && us[us.length - 1].kind === 'ch' && /^\s+$/.test(us[us.length - 1].g)) us = us.slice(0, -1);
          const lineEl = U.h('div.ln');
          if (!us.length) { lineEl.textContent = ' '; seg.appendChild(lineEl); return; }
          const startX = us[0].left - segRect.left;
          if (Math.abs(startX) > 0.3) lineEl.style.marginLeft = startX + 'px';
          const natural = us[us.length - 1].right - us[0].left;
          const avail = segRect.right - us[0].left;
          const isLast = lastSeg && li === lines.length - 1;
          const chars = us.filter((u) => u.kind === 'ch').length;
          const extra = !isLast && chars > 1 ? Math.max(0, (avail - natural) / (chars - 1)) : 0;
          // สร้างบรรทัดใหม่: รวมตัวอักษรที่มาจาก span เดียวกันเข้าด้วยกัน
          let run = null;
          for (const u of us) {
            if (u.kind === 'box') { run = null; lineEl.appendChild(u.el); continue; }
            if (!run || run.src !== u.src) {
              run = { src: u.src, el: U.h('span') };
              if (u.src.style.fontWeight) run.el.style.fontWeight = u.src.style.fontWeight;
              const base = parseFloat(u.src.style.letterSpacing) || 0;
              run.el.style.letterSpacing = base + extra + 'px';
              lineEl.appendChild(run.el);
            }
            run.el.textContent += u.g;
          }
          seg.appendChild(lineEl);
        });
      });
    }
  }
  Layout.distribute = distribute;

  function imgBox(id, imgs, wcm, hcm, placeholder) {
    const box = U.h('div.imgbox', { style: { width: cm(wcm) + 'px', height: cm(hcm) + 'px' } });
    const info = id && imgs[id];
    if (info) box.appendChild(U.h('img', { src: info.url, draggable: false }));
    else if (placeholder) box.appendChild(U.h('div.ph', 'รูปภาพ'));
    else if (id) box.appendChild(U.h('div.ph.missing', 'ไม่พบรูป'));
    else box.classList.add('empty');
    return box;
  }

  function htmlToEl(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content.firstElementChild;
  }

  // วาดแต่ละองค์ประกอบเป็น DOM
  function renderItem(it, ctx) {
    const { imgs, base } = ctx;
    if (it.html) return htmlToEl(it.html);
    if (it.k === 'para') return renderPara(it.text, it.fmt, it.eb, it.ea, it.runs);
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
      delete it.html;
      const el = renderItem(it, ctx);
      host.appendChild(el);
      distribute(el);
      // เก็บผลการจัดบรรทัดไว้ใช้ตอนวาดหน้าจริง (ตัดบรรทัดเหมือนกันทุกครั้ง)
      if (el.querySelector('.wp[data-dist]') || el.matches('.wp[data-dist]')) it.html = el.outerHTML;
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
