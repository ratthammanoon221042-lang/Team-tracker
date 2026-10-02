// ตั้งค่าเทมเพลต 3 แบบ: วันธรรมดา / วันหยุด / รายงานพิเศษ
(function () {
  const { h } = U;
  window.Pages = window.Pages || {};
  const TW_PER_CM = 1440 / 2.54;
  const cmOf = (tw) => Math.round(((tw || 0) / TW_PER_CM) * 100) / 100;
  const twOf = (cmv) => Math.round((Number(cmv) || 0) * TW_PER_CM);

  const ALIGNS = [['left', 'ชิดซ้าย'], ['center', 'กึ่งกลาง'], ['right', 'ชิดขวา'], ['thaiDistribute', 'กระจายแบบไทย'], ['both', 'เต็มแนว']];

  function blankPara(preset = 'body') {
    return { type: 'para', text: '', fmt: U.clone(Defaults.PRESETS[preset].fmt) };
  }
  function newBlock(type) {
    if (type === 'para') return Object.assign(blankPara('body'), { text: 'ข้อความใหม่' });
    if (type === 'photos') return { type, slots: 2 };
    if (type === 'photoGrid') return { type, slots: 4 };
    if (type === 'incidents') return { type, emptyText: 'ไม่มีเหตุการณ์ผิดปกติ' };
    if (type === 'freeText') return { type, label: 'รายละเอียด', fmt: U.clone(Defaults.PRESETS.letterPara.fmt), defaultItems: [''] };
    return { type };
  }

  function sampleReport(t) {
    const r = { id: 'preview', templateId: t.id, date: U.isoDate(), vars: {}, tpl: { templateName: t.name, base: t.base, fileName: t.fileName, vars: t.vars, blocks: t.blocks }, data: {}, pageLayout: {} };
    for (const v of t.vars || []) r.vars[v.key] = v.default || '';
    for (const b of t.blocks) {
      if (b.type === 'incidents') r.data[b.id] = { items: [{ text: 'เวลา 10.00 น. (ตัวอย่าง) ข้อความรายงานเหตุการณ์ประจำวันที่กรอกในหน้าสร้างรายงาน', images: [] }] };
    }
    return r;
  }

  Pages.templates = {
    async render(root, [tid]) {
      tid = Defaults.TEMPLATE_IDS.includes(tid) ? tid : 'weekday';
      let t = await DB.get('templates', tid);
      let dirty = false;
      let openId = null;
      const statusEl = h('span.status');
      const setDirty = (v) => { dirty = v; statusEl.textContent = v ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'บันทึกแล้ว'; statusEl.classList.toggle('dirty', v); };
      const preview = UI.previewPane(() => sampleReport(t), { placeholder: true, zoomKey: 'dr-zoom-tpl' });
      const refreshPreview = U.debounce(() => preview.refresh(), 450);
      const changed = (repaint = false) => { setDirty(true); refreshPreview(); if (repaint) paintBlocks(); };
      const outerChanged = changed;

      const tabs = h('div.tabs', Defaults.TEMPLATE_IDS.map((id) => h('button' + (id === tid ? '.active' : ''), {
        on: {
          click: async () => {
            if (dirty && !(await U.confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?', { ok: 'ออกโดยไม่บันทึก', danger: true }))) return;
            dirty = false;
            location.hash = '#/templates/' + id;
          },
        },
      }, Defaults.TEMPLATE_NAMES[id])));

      // ---------- ข้อมูลทั่วไป ----------
      const general = h('div.card');
      function paintGeneral() {
        general.innerHTML = '';
        const baseSel = h('select.input', h('option', { value: 'daily' }, 'รายงานประจำวัน (โลโก้ + เส้นใต้หัวกระดาษ)'), h('option', { value: 'letter' }, 'หนังสือรายงาน (โลโก้ ไม่มีเส้น)'));
        baseSel.value = t.base;
        baseSel.onchange = () => { t.base = baseSel.value; changed(); };
        const varsBox = h('div');
        const paintVars = () => {
          varsBox.innerHTML = '';
          (t.vars || []).forEach((v, i) => {
            varsBox.appendChild(h('div.row', { style: { marginBottom: '.35rem', alignItems: 'flex-end' } },
              h('label.field', { style: { flex: '1 1 110px' } }, h('span', 'ชื่อตัวแปร (ใช้ในข้อความเป็น {ชื่อ})'), h('input.input', { value: v.key, on: { input: (e) => { v.key = e.target.value.replace(/[{}]/g, ''); changed(); } } })),
              h('label.field', { style: { flex: '1 1 110px' } }, h('span', 'ป้ายในหน้าสร้างรายงาน'), h('input.input', { value: v.label || '', on: { input: (e) => { v.label = e.target.value; changed(); } } })),
              h('label.field', { style: { flex: '1 1 110px' } }, h('span', 'ค่าเริ่มต้น'), h('input.input', { value: v.default || '', on: { input: (e) => { v.default = e.target.value; changed(); } } })),
              h('label.check.small', { title: 'ใช้ค่าล่าสุดที่กรอกครั้งก่อนเป็นค่าเริ่มต้น' }, h('input', { type: 'checkbox', checked: !!v.remember, on: { change: (e) => { v.remember = e.target.checked; changed(); } } }), 'จำค่าล่าสุด'),
              h('button.icon-btn', { title: 'ลบตัวแปร', on: { click: () => { t.vars.splice(i, 1); paintVars(); changed(); } } }, '🗑')));
          });
          varsBox.appendChild(h('button.btn.sm', { on: { click: () => { t.vars = t.vars || []; t.vars.push({ key: 'ตัวแปร' + (t.vars.length + 1), label: '', default: '', remember: false }); paintVars(); changed(); } } }, '＋ เพิ่มตัวแปร'));
        };
        paintVars();
        general.append(
          h('div.card-head', h('h3', 'ข้อมูลเทมเพลต')),
          h('div.grid2',
            h('label.field', h('span', 'ชื่อเทมเพลต'), h('input.input', { value: t.name, on: { input: (e) => { t.name = e.target.value; changed(); } } })),
            h('label.field', h('span', 'รูปแบบหน้ากระดาษ (หัว/ท้ายกระดาษ ขอบกระดาษจากไฟล์ต้นแบบ)'), baseSel),
            h('label.field', h('span', 'ชื่อไฟล์เมื่อส่งออก'), h('input.input', { value: t.fileName || '', on: { input: (e) => { t.fileName = e.target.value; changed(); } } }))),
          h('p.small.muted', { style: { marginTop: '.5rem' } }, 'ตัวแปรที่ใช้ได้ในทุกข้อความ: ', h('code', '{วันที่}'), ' = 1 กันยายน 2569, ', h('code', '{วันที่เลขไทย}'), ' = ๑ กันยายน ๒๕๖๙, ', h('code', '{วัน}'), ' = ชื่อวัน'),
          h('details', h('summary', 'ตัวแปรเพิ่มเติม (กรอกในหน้าสร้างรายงาน เช่น เลขที่หนังสือ, เรื่อง, จำนวนบุคลากร)'), h('div', { style: { marginTop: '.5rem' } }, varsBox)));
      }

      // ---------- บล็อก ----------
      const blocksBox = h('div');
      let sortable = null;
      function summary(b) {
        if (b.type === 'para') return (b.text || '').replace(/\t/g, ' ').replace(/\n/g, ' ⏎ ') || '(บรรทัดว่าง)';
        if (b.type === 'photos') return `📷 ตารางรูป ${b.slots || 2} ช่อง`;
        if (b.type === 'photoGrid') return `🖼 ภาพประกอบขนาดใหญ่ ${b.slots || 4} ช่อง`;
        if (b.type === 'incidents') return '📝 ตารางรายงานเหตุการณ์ประจำวัน (กรอกในแต่ละรายงาน)';
        if (b.type === 'freeText') return '📝 ' + (b.label || 'ย่อหน้าที่กรอกในแต่ละรายงาน');
        if (b.type === 'pageBreak') return '⤓ ขึ้นหน้าใหม่';
        return b.type;
      }

      function fmtEditor(b) {
        const f = b.fmt;
        // แก้รูปแบบเอง -> เลิกใช้รูปแบบรายช่วงจากต้นฉบับ
        const changed = (r) => { delete b.runs; outerChanged(r); };
        const num = (label, get, set, step = 0.1) => h('label.field', h('span', label), h('input.input', { type: 'number', step, value: get(), on: { input: (e) => { set(Number(e.target.value)); changed(); } } }));
        const alignSel = h('select.input', ALIGNS.map(([v, l]) => h('option', { value: v }, l)));
        alignSel.value = f.align || 'left';
        alignSel.onchange = () => { f.align = alignSel.value; changed(); };
        const tabsInp = h('input.input', { value: (f.tabs || []).map(cmOf).join(', '), on: { change: (e) => { f.tabs = e.target.value.split(/[,\s]+/).filter(Boolean).map(twOf).filter((x) => x > 0).sort((a, c) => a - c); changed(); } } });
        return h('details', h('summary.small', 'รูปแบบย่อหน้า (ค่าจากไฟล์ต้นแบบ)'),
          h('div.fmt-grid',
            h('label.check', h('input', { type: 'checkbox', checked: !!f.bold, on: { change: (e) => { f.bold = e.target.checked; changed(true); } } }), 'ตัวหนา'),
            num('ขนาดตัวอักษร (pt)', () => f.size, (v) => { f.size = v || 16; }, 0.5),
            h('label.field', h('span', 'การจัดแนว'), alignSel),
            num('ระยะก่อนย่อหน้า (pt)', () => (f.before || 0) / 20, (v) => { f.before = Math.round(v * 20); }, 1),
            num('ระยะหลังย่อหน้า (pt)', () => (f.after || 0) / 20, (v) => { f.after = Math.round(v * 20); }, 1),
            num('ระยะบรรทัด (เท่า)', () => Math.round(((f.line || 240) / 240) * 100) / 100, (v) => { f.line = Math.round((v || 1) * 240); }, 0.05),
            num('ย่อหน้าซ้าย (ซม.)', () => cmOf(f.indLeft), (v) => { f.indLeft = twOf(v); }),
            num('บรรทัดแรกเยื้องเข้า (ซม.)', () => cmOf(f.firstLine), (v) => { f.firstLine = twOf(v); if (f.firstLine) f.hanging = 0; }),
            num('ย่อหน้าแขวน (ซม.)', () => cmOf(f.hanging), (v) => { f.hanging = twOf(v); if (f.hanging) f.firstLine = 0; }),
            h('label.field', h('span', 'แท็บ (ซม. คั่นด้วย ,)'), tabsInp),
            h('label.check', h('input', { type: 'checkbox', checked: !!f.numId, on: { change: (e) => { if (e.target.checked) { f.numId = 7; f.ilvl = 0; if (!f.hanging) { f.hanging = 357; f.firstLine = 0; } if (!f.indLeft) f.indLeft = 1066; } else delete f.numId; changed(); } } }), 'สัญลักษณ์หัวข้อ •'),
            num('ระยะห่างตัวอักษร (pt, ติดลบ = ชิดขึ้น)', () => (f.charSpacing || 0) / 20, (v) => { f.charSpacing = Math.round(v * 20); }, 0.05),
            h('label.check', { title: 'สไตล์ List Paragraph ของไฟล์ต้นแบบ: ย่อหน้าแบบนี้ที่ติดกันจะไม่เว้นระยะห่าง' }, h('input', { type: 'checkbox', checked: !!f.list, on: { change: (e) => { f.list = e.target.checked; changed(); } } }), 'สไตล์รายการ (List Paragraph)'),
            h('label.check', h('input', { type: 'checkbox', checked: !!f.keepNext, on: { change: (e) => { f.keepNext = e.target.checked; changed(); } } }), 'อยู่หน้าเดียวกับย่อหน้าถัดไป')));
      }

      function blockBody(b) {
        const body = h('div.tblock-body.stack');
        if (b.type === 'para') {
          const ta = h('textarea.input.doc', { rows: Math.max(2, Math.ceil((b.text || '').length / 60)) }, b.text || '');
          ta.addEventListener('input', () => { b.text = ta.value; changed(); const s = ta.closest('.tblock').querySelector('.sum'); if (s) s.textContent = summary(b); });
          const presetSel = h('select.input', h('option', { value: '' }, '— ใช้รูปแบบสำเร็จรูป —'), Object.entries(Defaults.PRESETS).map(([k, p]) => h('option', { value: k }, p.label)));
          presetSel.onchange = () => { if (!presetSel.value) return; b.fmt = Object.assign(U.clone(Defaults.PRESETS[presetSel.value].fmt), { keepNext: b.fmt.keepNext }); changed(true); };
          const tabBtn = h('button.btn.sm', { title: 'แทรกแท็บที่ตำแหน่งเคอร์เซอร์', on: { click: () => { const p = ta.selectionStart; ta.setRangeText('\t', p, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); ta.focus(); } } }, 'แทรกแท็บ ⇥');
          body.append(
            h('label.field', h('span', 'ข้อความ (Enter = ขึ้นบรรทัดใหม่ในย่อหน้าเดียวกัน, ใช้ {วันที่} ได้)'), ta),
            h('div.row', tabBtn, h('div.grow', presetSel)),
            h('label.check', h('input', { type: 'checkbox', checked: !!b.editable, on: { change: (e) => { b.editable = e.target.checked; changed(); } } }), 'ให้แก้ไขข้อความนี้ได้ในหน้าสร้างรายงานทุกครั้ง'),
            b.editable ? h('label.field', h('span', 'ป้ายกำกับในหน้าสร้างรายงาน'), h('input.input', { value: b.label || '', on: { input: (e) => { b.label = e.target.value; changed(); } } })) : null,
            fmtEditor(b));
        } else if (b.type === 'photos' || b.type === 'photoGrid') {
          body.append(
            h('label.field', h('span', 'จำนวนช่องรูปเริ่มต้น (2 รูปต่อแถว — ในแต่ละรายงานเพิ่ม/ลดได้)'), h('input.input', { type: 'number', min: 1, step: 1, value: b.slots || 2, on: { input: (e) => { b.slots = Math.max(1, Number(e.target.value) || 2); changed(); const s = e.target.closest('.tblock').querySelector('.sum'); if (s) s.textContent = summary(b); } } })),
            h('label.field', h('span', 'ชื่อที่แสดงในหน้าสร้างรายงาน (เว้นว่าง = ใช้หัวข้อด้านบนอัตโนมัติ)'), h('input.input', { value: b.label || '', on: { input: (e) => { b.label = e.target.value; changed(); } } })),
            h('p.small.muted', b.type === 'photos' ? 'ขนาดรูป 5.33 × 3.00 ซม. ในตารางมีเส้นขอบ (เหมือนไฟล์ต้นแบบ)' : 'ขนาดรูป 8.42 × 4.74 ซม. ไม่มีเส้นขอบ (เหมือนภาพประกอบในรายงานพิเศษ)'));
        } else if (b.type === 'incidents') {
          body.append(
            h('label.field', h('span', 'ข้อความเมื่อไม่มีเหตุการณ์'), h('input.input', { value: b.emptyText || '', on: { input: (e) => { b.emptyText = e.target.value; changed(); } } })),
            h('p.small.muted', 'ตาราง 2 คอลัมน์: ข้อความ | รูป (เหมือนไฟล์ต้นแบบ) — เพิ่มเหตุการณ์ได้ไม่จำกัดในแต่ละรายงาน'));
        } else if (b.type === 'freeText') {
          const ta = h('textarea.input.doc', { rows: 3 }, (b.defaultItems || []).join('\n'));
          ta.addEventListener('input', () => { b.defaultItems = ta.value.split('\n'); changed(); });
          body.append(
            h('label.field', h('span', 'ชื่อที่แสดงในหน้าสร้างรายงาน'), h('input.input', { value: b.label || '', on: { input: (e) => { b.label = e.target.value; changed(); } } })),
            h('label.field', h('span', 'ย่อหน้าเริ่มต้น (บรรทัดละ 1 ย่อหน้า)'), ta),
            fmtEditor(b));
        } else if (b.type === 'pageBreak') {
          body.append(h('p.small.muted', 'เนื้อหาหลังจุดนี้จะเริ่มหน้าใหม่เสมอ (เช่น ผลัดกลางคืน)'));
        }
        return body;
      }

      function insertMenu(afterIdx) {
        const menu = h('div.stack', Object.entries(Defaults.BLOCK_TYPES).map(([type, label]) => h('button.btn', { style: { width: '100%', justifyContent: 'flex-start' }, on: { click: () => { const nb = newBlock(type); nb.id = U.uid('b'); t.blocks.splice(afterIdx + 1, 0, nb); openId = nb.id; m.close(); changed(true); } } }, label)));
        const m = U.modal({ title: 'เพิ่มบล็อก', body: menu });
      }

      function paintBlocks() {
        if (sortable) { sortable.destroy(); sortable = null; }
        blocksBox.innerHTML = '';
        const list = h('div');
        t.blocks.forEach((b, i) => {
          const isOpen = openId === b.id;
          const el = h('div.tblock' + (isOpen ? '.open' : '') + (b.type !== 'para' ? '.special-kind' : ''), { 'data-id': b.id });
          const head = h('div.tblock-head',
            h('span.handle', { title: 'ลากเพื่อย้าย' }, '⋮⋮'),
            h('span.sum' + (b.fmt && b.fmt.bold ? '.b' : ''), summary(b)),
            b.editable ? h('span.badge', 'แก้ได้') : null,
            h('span.kind', Defaults.BLOCK_TYPES[b.type] ? (b.type === 'para' ? '' : '') : ''),
            h('button.icon-btn', { title: 'เพิ่มบล็อกด้านล่าง', on: { click: (e) => { e.stopPropagation(); insertMenu(i); } } }, '＋'),
            h('button.icon-btn', { title: 'ทำซ้ำ', on: { click: (e) => { e.stopPropagation(); const c = U.clone(b); c.id = U.uid('b'); t.blocks.splice(i + 1, 0, c); changed(true); } } }, '⧉'),
            h('button.icon-btn', { title: 'ลบ', on: { click: async (e) => { e.stopPropagation(); if (!(await U.confirm('ลบบล็อกนี้?', { danger: true, ok: 'ลบ' }))) return; t.blocks.splice(i, 1); changed(true); } } }, '🗑'));
          head.addEventListener('click', () => { openId = isOpen ? null : b.id; paintBlocks(); });
          el.appendChild(head);
          if (isOpen) el.appendChild(blockBody(b));
          list.appendChild(el);
        });
        blocksBox.append(list, h('div.add-row', h('button.btn', { on: { click: () => insertMenu(t.blocks.length - 1) } }, '＋ เพิ่มบล็อกท้ายเอกสาร')));
        sortable = Sortable.create(list, {
          handle: '.handle', animation: 150,
          onEnd: (e) => { if (e.oldIndex === e.newIndex) return; const [m] = t.blocks.splice(e.oldIndex, 1); t.blocks.splice(e.newIndex, 0, m); changed(true); },
        });
      }

      async function save() {
        await DB.put('templates', t);
        setDirty(false);
        U.toast('บันทึกเทมเพลตแล้ว — รายงานที่สร้างใหม่จะใช้ค่านี้', 'ok');
      }

      const tools = h('div.row',
        h('button.btn', {
          on: {
            click: async () => {
              const others = Defaults.TEMPLATE_IDS.filter((x) => x !== tid);
              const sel = h('select.input', others.map((x) => h('option', { value: x }, Defaults.TEMPLATE_NAMES[x])));
              U.modal({
                title: 'คัดลอกโครงสร้างจากเทมเพลตอื่น', body: h('div.stack', h('p', 'แทนที่เนื้อหาทั้งหมดของเทมเพลตนี้ด้วยเนื้อหาจาก:'), sel),
                actions: [{ label: 'ยกเลิก' }, { label: 'คัดลอก', primary: true, onClick: async () => { const o = await DB.get('templates', sel.value); t.blocks = U.clone(o.blocks); t.base = o.base; t.vars = U.clone(o.vars || []); t.fileName = o.fileName; changed(true); paintGeneral(); } }],
              });
            },
          },
        }, 'คัดลอกจากเทมเพลตอื่น'),
        h('button.btn', { on: { click: async () => { if (!(await U.confirm('คืนค่าเทมเพลตนี้เป็นค่าเริ่มต้นจากไฟล์ต้นแบบ? (ยังไม่บันทึกจนกว่าจะกดบันทึก)', { ok: 'คืนค่า' }))) return; const d = Defaults.makeTemplate(tid); t.blocks = d.blocks; t.base = d.base; t.vars = d.vars; t.fileName = d.fileName; t.name = d.name; changed(true); paintGeneral(); } } }, 'คืนค่าตามไฟล์ต้นแบบ'),
        h('button.btn', { on: { click: () => U.download(new Blob([JSON.stringify(t, null, 1)], { type: 'application/json' }), `เทมเพลต-${t.name}.json`) } }, 'ส่งออก .json'),
        h('button.btn', {
          on: {
            click: async () => {
              const [f] = await U.pickFiles('.json,application/json', false);
              if (!f) return;
              try { const o = JSON.parse(await f.text()); if (!Array.isArray(o.blocks)) throw new Error('ไม่ใช่ไฟล์เทมเพลต'); t.blocks = o.blocks; t.base = o.base || t.base; t.vars = o.vars || []; t.fileName = o.fileName || t.fileName; changed(true); paintGeneral(); U.toast('นำเข้าแล้ว (กดบันทึกเพื่อใช้งาน)', 'ok'); } catch (e) { U.toast('นำเข้าไม่สำเร็จ: ' + e.message, 'error'); }
            },
          },
        }, 'นำเข้า .json'));

      const bar = h('div.savebar', statusEl, h('button.btn', { on: { click: async () => { if (dirty && !(await U.confirm('ยกเลิกการแก้ไขทั้งหมดที่ยังไม่บันทึก?', { danger: true, ok: 'ยกเลิกการแก้ไข' }))) return; t = await DB.get('templates', tid); setDirty(false); paintGeneral(); paintBlocks(); preview.refresh(); } } }, 'ยกเลิกการแก้ไข'), h('button.btn.primary', { on: { click: save } }, '💾 บันทึกเทมเพลต'));
      setDirty(false);

      paintGeneral();
      paintBlocks();
      root.append(
        h('div.card', h('div.card-head', h('h2', 'ตั้งค่าเทมเพลตรายงาน'), tools), tabs,
          h('p.small.muted', { style: { margin: 0 } }, 'เทมเพลตเริ่มต้นถอดโครงสร้างมาจากไฟล์ต้นแบบทุกย่อหน้า (ระยะห่าง ย่อหน้า แท็บ ตาราง ขนาดรูป หัว/ท้ายกระดาษ) — แก้ข้อความ/เพิ่ม/ลบ/ลากย้ายหัวข้อได้ตามต้องการ ด้านขวาคือตัวอย่างหน้าเอกสารจริง')),
        h('div.tpl-layout', { style: { marginTop: '1rem' } },
          h('div', general, h('div.card', h('div.card-head', h('h3', 'เนื้อหาเอกสาร (เรียงจากบนลงล่าง)'), h('span.small.muted', 'กดที่แถวเพื่อแก้ไข • ลาก ⋮⋮ เพื่อย้าย')), blocksBox)),
          h('div.preview-col', h('div.card', preview.el))),
        bar);
      preview.refresh();
      const onUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
      window.addEventListener('beforeunload', onUnload);
      return async () => {
        window.removeEventListener('beforeunload', onUnload);
        if (dirty && (await U.confirm('เทมเพลตมีการแก้ไขที่ยังไม่บันทึก ต้องการบันทึกหรือไม่?', { ok: 'บันทึก' }))) await save();
      };
    },
  };
})();
