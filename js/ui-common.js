// ส่วนติดต่อผู้ใช้ที่ใช้ร่วมกัน: ช่องรูปภาพ, พรีวิว/จัดหน้า, วันหยุด
(function () {
  const { h } = U;
  const UI = {};

  UI.typeBadge = (tid, name) => h('span.badge' + (tid === 'holiday' ? '.holiday' : tid === 'special' ? '.special' : ''), name || Defaults.TEMPLATE_NAMES[tid] || tid);

  // ---------- วันหยุด ----------
  UI.DEFAULT_HOLIDAYS = ['01-01', '04-06', '04-13', '04-14', '04-15', '05-01', '06-03', '07-28', '08-12', '10-13', '10-23', '12-05', '12-10', '12-31'];
  // เก็บในตาราง templates (id: _settings) เพื่อให้ซิงก์ไปทุกเครื่อง
  UI.holidays = async () => {
    const v = await DB.get('templates', '_settings');
    return (v && !v.deleted && v.holidays) || { recurring: UI.DEFAULT_HOLIDAYS.slice(), dates: [] };
  };
  UI.saveHolidays = async (holidays) => {
    const v = (await DB.get('templates', '_settings')) || { id: '_settings', kind: 'settings' };
    v.holidays = holidays;
    await DB.put('templates', v);
  };
  UI.isHoliday = async (iso) => {
    const d = U.parseDate(iso);
    if (d.getDay() === 0 || d.getDay() === 6) return 'เสาร์-อาทิตย์';
    const hs = await UI.holidays();
    if (hs.dates.includes(iso)) return 'วันหยุดพิเศษ';
    if (hs.recurring.includes(iso.slice(5))) return 'วันหยุดนักขัตฤกษ์';
    return '';
  };
  UI.autoTemplate = async (iso) => ((await UI.isHoliday(iso)) ? 'holiday' : 'weekday');

  // ---------- ช่องรูปภาพ ----------
  // images: อาร์เรย์ id (แก้ไขในที่), opts: { onChange, addable, big, label }
  UI.slotEditor = (images, opts = {}) => {
    const wrap = h('div');
    const grid = h('div.slots' + (opts.big ? '.big' : ''));
    wrap.appendChild(grid);
    const changed = () => { render(); opts.onChange && opts.onChange(); };

    async function fillFrom(files, start) {
      files = files.filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
      if (!files.length) return;
      const b = U.busy('กำลังเพิ่มรูป…');
      try {
        const ids = await Images.addMany(files, (i, n) => b.set(`กำลังเพิ่มรูป ${i + 1}/${n}`));
        let pos = start;
        for (const id of ids) {
          while (pos < images.length && images[pos]) pos++;
          if (pos < images.length) images[pos] = id;
          else if (opts.addable !== false) images.push(id);
          else break;
          pos++;
        }
      } finally { b.done(); }
      changed();
    }

    function slot(i) {
      const id = images[i];
      const el = h('div.slot', { tabindex: 0 });
      el.appendChild(h('span.num', String(i + 1)));
      const onDrop = (e) => { e.preventDefault(); el.classList.remove('drag'); fillFromDrop(e, i); };
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag'); });
      el.addEventListener('dragleave', () => el.classList.remove('drag'));
      el.addEventListener('drop', onDrop);
      if (!id) {
        el.appendChild(h('div', h('div', { style: { fontSize: '1.4rem' } }, '＋'), 'เพิ่มรูป'));
        el.addEventListener('click', async () => fillFrom(await U.pickFiles('image/*', true), i));
        el.addEventListener('keydown', async (e) => { if (e.key === 'Enter') fillFrom(await U.pickFiles('image/*', true), i); });
        return el;
      }
      el.classList.add('filled');
      const img = h('img', { alt: '' });
      Images.url(id).then((u) => { if (u) img.src = u; else el.appendChild(h('div', 'ไม่พบรูป')); });
      el.appendChild(img);
      const tools = h('div.tools',
        h('button', { title: 'เลื่อนไปก่อนหน้า', on: { click: () => { if (i > 0) { [images[i - 1], images[i]] = [images[i], images[i - 1]]; changed(); } } } }, '◀'),
        h('button', { title: 'หมุน 90°', on: { click: async () => { const b = U.busy('กำลังหมุนรูป…'); try { images[i] = await Images.rotate(id); } finally { b.done(); } changed(); } } }, '⟳'),
        h('button', { title: 'เปลี่ยนรูป', on: { click: async () => { const f = await U.pickFiles('image/*', false); if (f.length) { const b = U.busy('กำลังเพิ่มรูป…'); try { images[i] = await Images.add(f[0]); } finally { b.done(); } changed(); } } } }, 'เปลี่ยน'),
        h('button', { title: 'ลบรูปออกจากช่อง', on: { click: () => { images[i] = null; changed(); } } }, '✕'),
        h('button', { title: 'เลื่อนไปถัดไป', on: { click: () => { if (i < images.length - 1) { [images[i + 1], images[i]] = [images[i], images[i + 1]]; changed(); } } } }, '▶'));
      el.appendChild(tools);
      return el;
    }

    function fillFromDrop(e, i) {
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (files.length) {
        if (images[i]) images[i] = null;
        fillFrom(files, i);
      }
    }

    function render() {
      grid.innerHTML = '';
      for (let i = 0; i < images.length; i++) grid.appendChild(slot(i));
      const bar = wrap.querySelector('.slot-bar');
      if (bar) bar.remove();
      if (opts.addable !== false) {
        const step = opts.step || 2;
        const min = opts.minSlots != null ? opts.minSlots : 2;
        const b = h('div.row.slot-bar', { style: { marginTop: '.4rem' } },
          h('button.btn.sm', { on: { click: () => { for (let k = 0; k < step; k++) images.push(null); changed(); } } }, step === 1 ? '＋ เพิ่มช่องรูป' : '＋ เพิ่มแถวรูป (2 ช่อง)'),
          images.length > min ? h('button.btn.sm.ghost', { on: { click: () => { const n = Math.min(step, images.length - min); const last = images.slice(-n); if (last.some(Boolean) && !confirm('ช่องสุดท้ายมีรูปอยู่ ต้องการลบหรือไม่?')) return; images.splice(-n, n); changed(); } } }, step === 1 ? '－ ลบช่องสุดท้าย' : '－ ลบแถวสุดท้าย') : null);
        wrap.appendChild(b);
      }
    }
    render();
    return wrap;
  };

  // ---------- พรีวิวหน้า + จัดหน้า ----------
  // getReport(): คืนรายงานปัจจุบัน ; opts: { manage, onLayoutChange, placeholder, zoomKey }
  UI.previewPane = (getReport, opts = {}) => {
    const zoomKey = opts.zoomKey || 'dr-zoom';
    let scale = Number(localStorage.getItem(zoomKey) || 0.62);
    const scroller = h('div.preview-scroll');
    const info = h('span.muted.small');
    const zoomLbl = h('span.small', Math.round(scale * 100) + '%');
    const setZoom = (s) => { scale = Math.min(1.2, Math.max(0.3, s)); localStorage.setItem(zoomKey, scale); zoomLbl.textContent = Math.round(scale * 100) + '%'; refresh(); };
    const head = h('div.row.between', { style: { marginBottom: '.5rem' } },
      h('div.row', h('strong', 'ตัวอย่างเอกสาร'), info),
      h('div.zoom', h('button.btn.sm', { on: { click: () => setZoom(scale - 0.1) } }, '－'), zoomLbl, h('button.btn.sm', { on: { click: () => setZoom(scale + 0.1) } }, '＋')));
    const root = h('div', head, scroller);
    let seq = 0;
    let lastBuilt = null;

    async function refresh() {
      const my = ++seq;
      const r = getReport();
      if (!r) return;
      let built;
      try { built = await Layout.build(r, { placeholder: !!opts.placeholder }); } catch (e) { console.error(e); scroller.textContent = 'แสดงตัวอย่างไม่ได้: ' + e.message; return; }
      if (my !== seq) return;
      lastBuilt = built;
      const frag = document.createDocumentFragment();
      const visible = built.pages.filter((p) => !p.hidden).length;
      info.textContent = `${visible} หน้า` + (built.pages.length !== visible ? ` (ซ่อน ${built.pages.length - visible})` : '');
      let n = 0;
      for (let idx = 0; idx < built.pages.length; idx++) {
        const p = built.pages[idx];
        if (!p.hidden) n++;
        const pageEl = await Layout.renderPage(p, built.base, built.imgs, { scale });
        if (my !== seq) return;
        const box = h('div.pv-page' + (p.hidden ? '.hidden-page' : ''));
        const label = h('div.pv-label', h('span', p.hidden ? 'ซ่อนหน้านี้ (ไม่ส่งออก)' : `หน้า ${n}` + (p.extra ? ' • หน้าแทรก' : '')));
        if (opts.manage && !p.sub) label.appendChild(pageTools(p, idx, built));
        box.style.width = pageEl.style.width;
        box.append(label, pageEl);
        frag.appendChild(box);
        const nextP = built.pages[idx + 1];
        if (opts.manage && !(nextP && nextP.key === p.key)) frag.appendChild(h('div.pv-insert', h('button', { on: { click: () => editExtra(null, p.key) } }, '＋ แทรกหน้าหลังหน้านี้')));
      }
      scroller.innerHTML = '';
      if (opts.manage && built.pages.length) scroller.appendChild(h('div.pv-insert', { style: { margin: '0 0 .5rem' } }, h('button', { on: { click: () => editExtra(null, '^') } }, '＋ แทรกหน้าไว้หน้าแรก')));
      scroller.appendChild(frag);
    }

    function layoutOf() {
      const r = getReport();
      r.pageLayout = r.pageLayout || { order: null, hidden: [], extras: {} };
      r.pageLayout.extras = r.pageLayout.extras || {};
      r.pageLayout.hidden = r.pageLayout.hidden || [];
      if (!r.pageLayout.order && lastBuilt) r.pageLayout.order = lastBuilt.pages.map((p) => p.key);
      return r.pageLayout;
    }
    const changed = () => { opts.onLayoutChange && opts.onLayoutChange(); refresh(); };

    function pageTools(p, idx, built) {
      const L = () => layoutOf();
      const move = (d) => {
        const lay = L();
        const i = lay.order.indexOf(p.key), j = i + d;
        if (i < 0 || j < 0 || j >= lay.order.length) return;
        [lay.order[i], lay.order[j]] = [lay.order[j], lay.order[i]];
        changed();
      };
      const t = h('span.tools',
        h('button', { title: 'เลื่อนขึ้น', on: { click: () => move(-1) } }, '↑'),
        h('button', { title: 'เลื่อนลง', on: { click: () => move(1) } }, '↓'));
      if (p.extra) {
        t.append(h('button', { on: { click: () => editExtra(p.extraId) } }, 'แก้ไข'),
          h('button', { on: { click: async () => { if (!(await U.confirm('ลบหน้าแทรกนี้?', { danger: true, ok: 'ลบ' }))) return; const lay = L(); delete lay.extras[p.extraId]; lay.order = lay.order.filter((k) => k !== p.key); changed(); } } }, 'ลบหน้า'));
      } else {
        t.append(h('button', { on: { click: () => { const lay = L(); const s = new Set(lay.hidden); if (s.has(p.key)) s.delete(p.key); else s.add(p.key); lay.hidden = [...s]; changed(); } } }, p.hidden ? 'แสดงหน้า' : 'ลบ/ซ่อนหน้า'));
      }
      return t;
    }

    // แทรก/แก้ไขหน้าเพิ่มเติม
    function editExtra(extraId, afterKey) {
      const lay = layoutOf();
      const x = extraId ? U.clone(lay.extras[extraId]) : { kind: 'photos', title: 'ภาพประกอบเพิ่มเติม', text: '', images: [null, null, null, null] };
      const kindSel = h('select.input', h('option', { value: 'photos' }, 'หน้ารูปภาพ (หัวข้อ + ข้อความ + รูป 2 รูป/แถว)'), h('option', { value: 'blank' }, 'หน้าว่าง'));
      kindSel.value = x.kind;
      const title = h('input.input', { value: x.title || '' });
      const text = h('textarea.input.doc', { rows: 3 }, x.text || '');
      const slots = UI.slotEditor(x.images, { big: true });
      const photoPart = h('div.stack', h('label.field', h('span', 'หัวข้อ (เว้นว่างได้)'), title), h('label.field', h('span', 'ข้อความ (เว้นว่างได้)'), text), h('div', h('span.muted.small', 'รูปภาพ (หน้าละไม่เกิน 8 รูป ถ้าเกินจะขึ้นหน้าใหม่ให้อัตโนมัติ)'), slots));
      const sync = () => photoPart.classList.toggle('hidden', kindSel.value === 'blank');
      kindSel.onchange = sync;
      sync();
      U.modal({
        title: extraId ? 'แก้ไขหน้าแทรก' : 'แทรกหน้าใหม่',
        wide: true,
        body: h('div.stack', h('label.field', h('span', 'ชนิดหน้า'), kindSel), photoPart),
        actions: [{ label: 'ยกเลิก' }, {
          label: 'บันทึก', primary: true, onClick: () => {
            x.kind = kindSel.value; x.title = title.value; x.text = text.value;
            const id = extraId || U.uid('x');
            lay.extras[id] = x;
            if (!extraId) {
              const key = 'x:' + id;
              if (afterKey === '^') lay.order.unshift(key);
              else { const i = lay.order.indexOf(afterKey); lay.order.splice(i < 0 ? lay.order.length : i + 1, 0, key); }
            }
            changed();
          },
        }],
      });
    }

    return { el: root, refresh, built: () => lastBuilt };
  };

  // ทำสำเนารายงานไปยังวันที่อื่น
  UI.duplicateDialog = (r) => {
    const next = U.isoDate(new Date(U.parseDate(r.date).getTime() + 86400000));
    const inp = h('input.input', { type: 'date', value: next });
    const keepInc = h('input', { type: 'checkbox' });
    U.modal({
      title: 'ทำสำเนารายงาน',
      body: h('div.stack', h('label.field', h('span', 'วันที่ของรายงานฉบับใหม่'), inp), h('label.check', keepInc, 'คัดลอกรายงานเหตุการณ์ประจำวันไปด้วย'), h('p.small.muted', 'รูปภาพจะถูกคัดลอกไปด้วย สามารถเปลี่ยนได้ภายหลัง')),
      actions: [{ label: 'ยกเลิก' }, {
        label: 'ทำสำเนา', primary: true, onClick: async () => {
          if (!inp.value) { U.toast('เลือกวันที่ก่อน', 'warn'); return false; }
          const c = U.clone(r);
          c.id = U.uid('rep_'); c.createdAt = Date.now(); c.date = inp.value;
          if (!keepInc.checked) for (const b of c.tpl.blocks) if (b.type === 'incidents' && c.data[b.id]) c.data[b.id].items = [];
          await DB.put('reports', c);
          U.toast('ทำสำเนาแล้ว', 'ok');
          location.hash = '#/report/' + c.id;
        },
      }],
    });
  };

  window.UI = UI;
})();
