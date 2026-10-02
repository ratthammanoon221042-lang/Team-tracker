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
      wsLine: 20.95, // ความสูงบรรทัดที่มีแต่แท็บ/ช่องว่าง (ตามฟอนต์สไตล์ปกติของไฟล์ต้นแบบ) pt
      logo: { x: 8.55, y: 0.03, w: 4.895, h: 2.736 },
      line: { x1: 2.8, x2: 19.29, y: 2.81, w: 1 },
      footer: { size: 12, top: 28.27, center: 11.0, width: 18 },
    },
    letter: {
      pageW: 21.0, pageH: 29.7,
      left: 1701, right: 1133,
      bodyTop: 3.56, bodyBottom: 27.2,
      wsLine: 12.8,
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
    // Word ไม่ใช้ kerning กับข้อความนี้ -> ปิดให้วัดความกว้างตรงกัน
    if ('fontKerning' in mctx) mctx.fontKerning = 'none';
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

  // ---------- ความกว้างตัวอักษรจากไฟล์ฟอนต์ (หน่วย twips) ----------
  // ใช้ตัดบรรทัดเองเหมือน Word แทนการให้เบราว์เซอร์ตัด (เบราว์เซอร์ปัดเศษความกว้างต่างกันแต่ละเครื่อง)
  const FM = window.FONT_METRICS;
  function graphemeTw(g, bold, sizePt) {
    const m = FM && (bold ? FM.b : FM.r);
    let w = 0;
    for (const ch of g) {
      const a = m && m[ch.codePointAt(0)];
      w += a != null ? (a / FM.upem) * sizePt * 20 : (measure(ch, sizePt, bold) / U.PX_PER_PT) * 20;
    }
    return w;
  }
  let wordSeg = null;
  const words = (t) => {
    if (!wordSeg && window.Intl && Intl.Segmenter) wordSeg = new Intl.Segmenter('th', { granularity: 'word' });
    return wordSeg ? Array.from(wordSeg.segment(t), (x) => x.segment) : t.split(/(\s+)/).filter(Boolean);
  };

  // วาดย่อหน้า (ตาม pPr/rPr ของ Word) — runs: [[ข้อความ, ตัวหนา, ระยะห่างตัวอักษร]]
  function renderPara(text, fmt, eb, ea, runs, widthTw = 9072) {
    const f = fmt;
    const size = f.size || 16;
    const el = U.h('div.wp');
    el.style.paddingTop = px(eb != null ? eb : f.before || 0) + 'px';
    el.style.paddingBottom = px(ea != null ? ea : f.after || 0) + 'px';
    el.style.paddingLeft = px(f.indLeft || 0) + 'px';
    el.style.fontSize = size + 'pt';
    el.style.lineHeight = lineHeightPx(f) + 'px';
    const justify = f.align === 'thaiDistribute' || f.align === 'both' || f.align === 'distribute';
    const align = f.align === 'center' ? 'center' : f.align === 'right' ? 'right' : 'left';
    if (justify) el.dataset.dist = '1';
    const list = runs && runs.length ? runs : [[String(text || ''), !!f.bold, f.charSpacing || 0]];
    // แบ่งเป็นช่วงตาม \n (Shift+Enter ใน Word): แต่ละช่วงเป็นรายการตัวอักษร (grapheme) พร้อมรูปแบบ
    const segs = [[]];
    for (const [t, b, sp] of list) {
      String(t).split('\n').forEach((part, i) => {
        if (i > 0) segs.push([]);
        if (part) segs[segs.length - 1].push([part, !!b, sp || 0]);
      });
    }
    const R = widthTw; // ขอบขวาของเนื้อหา (twips จากขอบซ้าย)
    const stops = (f.tabs || []).slice().sort((a, b) => a - b);
    const maxCustom = stops.length ? stops[stops.length - 1] : 0;
    if (f.hanging) stops.push(f.indLeft || 0);
    const nextStop = (x) => {
      let next = stops.filter((t) => t > x + 1).sort((a, b) => a - b)[0];
      if (next == null) { next = (Math.floor(Math.max(x, maxCustom) / 720) + 1) * 720; while (next <= x + 1) next += 720; }
      return next;
    };
    segs.forEach((pieces, si) => {
      // แปลงเป็นคำ (จุดที่ตัดบรรทัดได้) -> แต่ละคำเป็นรายการตัวอักษรพร้อมรูปแบบและความกว้าง
      const plain = pieces.map((p) => p[0]).join('');
      const props = [];
      pieces.forEach(([t, b, sp]) => { for (let i = 0; i < t.length; i++) props.push([b, sp]); });
      const toks = [];
      let off = 0;
      for (const w of words(plain)) {
        if (w === '\t' || w.indexOf('\t') >= 0) {
          for (const ch of w) { if (ch === '\t') toks.push({ tab: true }); else toks.push({ chars: [mk(ch, off)], space: /\s/.test(ch) }); off += ch.length; }
          continue;
        }
        const chars = [];
        let o = off;
        for (const g of graphemes(w)) { chars.push(mk(g, o)); o += g.length; }
        toks.push({ chars, space: /^\s+$/.test(w) });
        off += w.length;
      }
      function mk(g, o) {
        const [b, sp] = props[o] || [false, 0];
        return { g, b, sp, w: graphemeTw(g, b, size) + sp };
      }
      // ตัดบรรทัดแบบ Word: ใส่คำจนเกินความกว้าง แล้วขึ้นบรรทัดใหม่ (ช่องว่างท้ายบรรทัดไม่นับ)
      const firstOffsetTw = si === 0 ? (f.firstLine || 0) - (f.hanging || 0) : 0;
      const lines = [];
      let cur = { x0: (f.indLeft || 0) + firstOffsetTw, items: [] };
      let x = cur.x0;
      let hasText = false;
      if (si === 0 && f.numId) {
        cur.items.push({ bullet: true, w: BULLET_TW });
        x += BULLET_TW;
        const nx = nextStop(x);
        cur.items.push({ tab: true, w: nx - x });
        x = nx;
      }
      const newLine = () => { lines.push(cur); cur = { x0: f.indLeft || 0, items: [] }; x = cur.x0; hasText = false; };
      for (const tk of toks) {
        if (tk.tab) { const nx = nextStop(x); cur.items.push({ tab: true, w: nx - x }); x = nx; continue; }
        const w = tk.chars.reduce((a, c) => a + c.w, 0);
        if (!tk.space && hasText && x + w > R + 0.5) newLine();
        if (!tk.space && !hasText && x + w > R + 0.5 && tk.chars.length > 1) {
          // คำเดียวยาวเกินบรรทัด -> ตัดตามตัวอักษร
          for (const c of tk.chars) { if (hasText && x + c.w > R + 0.5) newLine(); cur.items.push(c); x += c.w; hasText = true; }
          continue;
        }
        for (const c of tk.chars) cur.items.push(c);
        x += w;
        if (!tk.space) hasText = true;
      }
      lines.push(cur);
      // วาดแต่ละบรรทัด
      const segEl = U.h('div.seg');
      lines.forEach((ln, li) => {
        let items = ln.items;
        while (items.length && items[items.length - 1].g && /^\s+$/.test(items[items.length - 1].g)) items = items.slice(0, -1);
        const lineEl = U.h('div.ln', { style: { textAlign: align } });
        const off2 = ln.x0 - (f.indLeft || 0);
        if (off2) lineEl.style.marginLeft = px(off2) + 'px';
        const isLast = si === segs.length - 1 && li === lines.length - 1;
        if (justify && !isLast) lineEl.dataset.j = '1';
        let run = null;
        for (const it of items) {
          if (it.bullet) { run = null; lineEl.appendChild(U.h('span.bullet', { style: { width: px(it.w) + 'px' } }, '•')); continue; }
          if (it.tab) { run = null; lineEl.appendChild(U.h('span.tab', { style: { width: px(it.w) + 'px' } })); continue; }
          if (!run || run.b !== it.b || run.sp !== it.sp) {
            run = { b: it.b, sp: it.sp, el: U.h('span') };
            if (it.b) run.el.style.fontWeight = '700';
            if (it.sp) run.el.style.letterSpacing = spPx(it.sp) + 'px';
            run.el.dataset.sp = spPx(it.sp);
            lineEl.appendChild(run.el);
          }
          run.el.textContent += it.g;
        }
        if (!lineEl.childNodes.length) lineEl.textContent = ' ';
        segEl.appendChild(lineEl);
      });
      el.appendChild(segEl);
    });
    return el;
  }

  // จัดแบบ "กระจายแบบไทย" (thaiDistribute) ของ Word: เพิ่ม/ลดระยะห่างระหว่างตัวอักษรให้เต็มบรรทัดพอดี
  // (บรรทัดถูกตัดไว้แล้วตามความกว้างจริงของฟอนต์) — ต้องเรียกหลังจากองค์ประกอบอยู่ในหน้าเว็บแล้ว
  function distribute(root) {
    const lines = root.matches && root.matches('.ln[data-j]') ? [root] : Array.from(root.querySelectorAll('.ln[data-j]'));
    // ขอบขวาจริงของตัวอักษรสุดท้ายในบรรทัด (Range ของทั้งบรรทัดวัดข้อความไทยที่มีระยะตัวอักษรได้ไม่ถูกต้อง)
    const lastRight = (spans) => {
      const s = spans[spans.length - 1];
      const tn = s && s.firstChild;
      if (!tn) return null;
      const gs = graphemes(tn.data);
      const last = gs[gs.length - 1];
      const rg = document.createRange();
      rg.setStart(tn, tn.length - last.length);
      rg.setEnd(tn, tn.length);
      const rects = rg.getClientRects();
      const r = rects.length ? rects[rects.length - 1] : rg.getBoundingClientRect();
      // ไม่นับระยะตัวอักษรท้ายสุด (เพิ่มหลังตัวสุดท้าย)
      return r.right - (parseFloat(s.style.letterSpacing) || 0);
    };
    for (const ln of lines) {
      const spans = Array.from(ln.children).filter((c) => !c.classList.contains('tab') && !c.classList.contains('bullet') && c.firstChild);
      const n = spans.reduce((a, s) => a + graphemes(s.textContent).length, 0);
      if (n < 2) continue;
      const box = ln.getBoundingClientRect();
      let extra = 0;
      // 2 รอบ: รอบแรกคำนวณ รอบสองแก้ส่วนต่างที่เหลือ
      for (let pass = 0; pass < 2; pass++) {
        const end = lastRight(spans);
        if (end == null) break;
        const diff = box.right - end;
        if (Math.abs(diff) < 0.3) break;
        extra += diff / (n - 1);
        for (const s of spans) s.style.letterSpacing = (Number(s.dataset.sp) || 0) + extra + 'px';
      }
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
    if (it.k === 'para') {
      const f = it.ws ? Object.assign({}, it.fmt, { lineRule: 'exact', line: Math.round(BASES[base].wsLine * 20) }) : it.fmt;
      return renderPara(it.text, f, it.eb, it.ea, it.runs, BASES[base].contentTw);
    }
    if (it.k === 'photoRow') {
      const g = GEO.photo;
      const row = U.h('div.trow.photo' + (it.first ? '.first' : ''), { style: { marginLeft: px(g.ind) + 'px', height: px(g.rowH) + 'px' } });
      it.imgs.forEach((id) => row.appendChild(U.h('div.tcell', { style: { width: px(g.col) + 'px' } }, imgBox(id, imgs, g.imgW, g.imgH, it.ph))));
      return row;
    }
    if (it.k === 'incRow') {
      const g = GEO.inc;
      const row = U.h('div.trow.incrow' + (it.first ? '.first' : ''), { style: { marginLeft: px(g.ind) + 'px' } });
      const c1 = U.h('div.tcell', { style: { width: px(g.cols[0]) + 'px', padding: `0 ${px(GEO.cellMar)}px` } }, renderPara(it.text, g.textFmt, null, null, null, g.cols[0] - 2 * GEO.cellMar));
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
      if (el.querySelector('.ln[data-j]') || el.matches('.ln[data-j]')) it.html = el.outerHTML;
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
