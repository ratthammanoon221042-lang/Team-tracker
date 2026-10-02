// โมเดลรายงาน: สร้างจากเทมเพลต, แปลงเป็นรายการองค์ประกอบสำหรับจัดหน้า
(function () {
  const Report = {};

  Report.vars = (r) => {
    const v = Object.assign({}, r.vars || {});
    v['วันที่'] = U.thaiDate(r.date);
    v['วันที่เลขไทย'] = U.thaiDigits(U.thaiDate(r.date));
    v['วัน'] = r.date ? U.thaiDay(r.date) : '';
    return v;
  };

  Report.title = (r) => U.fillVars((r.tpl && r.tpl.fileName) || 'รายงาน {วันที่}', Report.vars(r)).trim();

  function initData(block, old) {
    if (old) return old;
    if (block.type === 'photos') return { images: new Array(block.slots || 2).fill(null) };
    if (block.type === 'photoGrid') return { images: new Array(block.slots || 4).fill(null) };
    if (block.type === 'incidents') return { items: U.clone(block.defaultItems || []) };
    if (block.type === 'freeText') return { paras: U.clone(block.defaultItems || ['']) };
    return null;
  }

  function snapshot(t) {
    return { templateName: t.name, base: t.base, fileName: t.fileName, vars: U.clone(t.vars || []), blocks: U.clone(t.blocks), templateUpdatedAt: t.updatedAt };
  }

  Report.create = async (templateId, date) => {
    const t = await DB.get('templates', templateId);
    const r = {
      id: U.uid('rep_'),
      kind: 'report',
      templateId,
      date,
      vars: {},
      tpl: snapshot(t),
      data: {},
      pageLayout: { order: null, hidden: [], extras: {} },
      createdAt: Date.now(),
    };
    const last = (await DB.getMeta('lastVars:' + templateId)) || {};
    for (const v of t.vars || []) r.vars[v.key] = v.remember && last[v.key] != null ? last[v.key] : v.default || '';
    for (const b of t.blocks) {
      const d = initData(b);
      if (d) r.data[b.id] = d;
    }
    return r;
  };

  // เปลี่ยน/อัปเดตเทมเพลตของรายงาน โดยเก็บรูปและเหตุการณ์ที่กรอกไว้ (จับคู่ตาม id ของบล็อก)
  Report.applyTemplate = (r, t) => {
    const oldData = r.data || {};
    r.templateId = t.id;
    r.tpl = snapshot(t);
    r.data = {};
    for (const b of t.blocks) {
      const old = oldData[b.id];
      const compatible = old && ((b.type === 'photos' || b.type === 'photoGrid') ? old.images : b.type === 'incidents' ? old.items : b.type === 'freeText' ? old.paras : b.type === 'para' ? old.text != null : false);
      const d = initData(b, compatible ? old : null);
      if (d) r.data[b.id] = d;
    }
    for (const v of t.vars || []) if (r.vars[v.key] == null) r.vars[v.key] = v.default || '';
    return r;
  };

  Report.imageIds = (r) => {
    const ids = [];
    for (const d of Object.values(r.data || {})) {
      if (!d) continue;
      if (d.images) ids.push(...d.images);
      if (d.items) d.items.forEach((it) => ids.push(...(it.images || [])));
    }
    for (const x of Object.values((r.pageLayout && r.pageLayout.extras) || {})) ids.push(...(x.images || []));
    return ids.filter(Boolean);
  };

  // ป้ายกำกับบล็อกที่แก้ไขได้ (หัวข้อผลัด / หัวข้อย่อยที่อยู่ก่อนหน้า)
  Report.blockContexts = (blocks) => {
    const ctx = {};
    let shift = '', section = '', sub = '';
    for (const b of blocks) {
      if (b.type === 'para') {
        const t = (b.text || '').trim();
        if (!t) continue;
        if (/^ผลัด/.test(t)) { shift = t.replace(/\s+/g, ' '); section = ''; sub = ''; } else if (b.fmt && b.fmt.bold) { section = t; sub = ''; } else if (t.length < 60 && !/\n/.test(t)) sub = t; else if (!sub) sub = t.replace(/\s+/g, ' ').slice(0, 28) + '…';
      } else {
        ctx[b.id] = { shift, section, sub: b.type === 'photos' ? sub : '' };
        if (b.type === 'photos') sub = '';
      }
    }
    return ctx;
  };

  // แปลงรายงานเป็นรายการองค์ประกอบ (ย่อหน้า, แถวตาราง, ตัวแบ่งหน้า) ตามลำดับ
  // opts.placeholder = true -> ช่องรูปว่างแสดงกรอบ "รูปภาพ" (ใช้ในหน้าตั้งค่าเทมเพลต)
  Report.expand = (r, opts = {}) => {
    const vars = Report.vars(r);
    const items = [];
    const blocks = r.tpl.blocks;
    for (const b of blocks) {
      const d = (r.data && r.data[b.id]) || initData(b) || {};
      if (b.type === 'para') {
        const text = d && d.text != null ? d.text : b.text;
        items.push({ k: 'para', text: U.fillVars(text, vars), fmt: b.fmt, src: b.id });
      } else if (b.type === 'pageBreak') {
        items.push({ k: 'break', src: b.id });
      } else if (b.type === 'photos') {
        const imgs = d.images && d.images.length ? d.images : new Array(b.slots || 2).fill(null);
        for (let i = 0; i < imgs.length; i += 2) items.push({ k: 'photoRow', imgs: [imgs[i] || null, imgs[i + 1] || null], src: b.id, first: i === 0, ph: opts.placeholder });
      } else if (b.type === 'photoGrid') {
        const imgs = (d.images || []).filter((x) => x || opts.placeholder);
        const list = imgs.length ? imgs : opts.placeholder ? new Array(b.slots || 4).fill(null) : [];
        for (let i = 0; i < list.length; i += 2) items.push({ k: 'gridRow', imgs: [list[i] || null, i + 1 < list.length ? list[i + 1] || null : undefined], src: b.id, first: i === 0, ph: opts.placeholder });
      } else if (b.type === 'incidents') {
        const list = (d.items || []).filter((it) => (it.text && it.text.trim()) || (it.images || []).some(Boolean));
        if (!list.length) items.push({ k: 'incRow', text: U.fillVars(b.emptyText || '', vars), imgs: [], src: b.id, first: true, empty: true });
        list.forEach((it, i) => items.push({ k: 'incRow', text: U.fillVars(it.text || '', vars), imgs: (it.images || []).filter(Boolean), src: b.id, first: i === 0 }));
      } else if (b.type === 'freeText') {
        const paras = (d.paras || []).filter((p) => p != null);
        (paras.length ? paras : ['']).forEach((p) => items.push({ k: 'para', text: U.fillVars(p, vars), fmt: b.fmt, src: b.id }));
      }
    }
    return items;
  };

  // องค์ประกอบของหน้าเพิ่มเติม (หน้าแทรกโดยผู้ใช้)
  Report.expandExtra = (x, r) => {
    const vars = r ? Report.vars(r) : {};
    const items = [];
    if (x.kind === 'blank') return items;
    if (x.title) items.push({ k: 'para', text: U.fillVars(x.title, vars), fmt: Object.assign({}, Defaults.PRESETS.title.fmt, { before: 0, after: 120, keepNext: true }), src: 'extra' });
    if (x.text) items.push({ k: 'para', text: U.fillVars(x.text, vars), fmt: Object.assign({}, Defaults.PRESETS.letterPara.fmt, { after: 120 }), src: 'extra' });
    const imgs = (x.images || []).filter(Boolean);
    for (let i = 0; i < imgs.length; i += 2) items.push({ k: 'gridRow', imgs: [imgs[i], imgs[i + 1]], src: 'extra', first: i === 0 });
    return items;
  };

  window.Report = Report;
})();
