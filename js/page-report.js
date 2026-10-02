// หน้าสร้าง/แก้ไขรายงาน: เปลี่ยนวันที่ รูปภาพ และรายงานเหตุการณ์ประจำวัน + พรีวิว/จัดหน้า + ส่งออก
(function () {
  const { h } = U;
  window.Pages = window.Pages || {};

  Pages.report = {
    async render(root, [id]) {
      let r = await DB.get('reports', id);
      if (!r || r.deleted) {
        root.append(h('div.card.empty-state', h('h2', 'ไม่พบรายงานนี้'), h('p', 'อาจถูกลบไปแล้ว หรือยังซิงก์มาไม่ถึงเครื่องนี้'), h('a.btn', { href: '#/reports' }, 'ไปที่รายงานทั้งหมด')));
        return;
      }
      let dirty = false;
      let saving = false;
      const status = h('span.status', 'บันทึกแล้ว');
      const setStatus = () => {
        status.textContent = saving ? 'กำลังบันทึก…' : dirty ? 'ยังไม่บันทึก (จะบันทึกอัตโนมัติ)' : 'บันทึกแล้ว ' + U.thaiDateTime(r.updatedAt);
        status.classList.toggle('dirty', dirty);
      };

      async function save() {
        if (!dirty) return;
        saving = true; setStatus();
        dirty = false;
        await DB.put('reports', r);
        const remember = {};
        for (const v of r.tpl.vars || []) if (v.remember) remember[v.key] = r.vars[v.key];
        if (Object.keys(remember).length) await DB.setMeta('lastVars:' + r.templateId, Object.assign((await DB.getMeta('lastVars:' + r.templateId)) || {}, remember));
        saving = false; setStatus();
      }
      const autosave = U.debounce(save, 800);
      const preview = UI.previewPane(() => r, { manage: true, onLayoutChange: () => touch(false) });
      const refreshPreview = U.debounce(() => preview.refresh(), 500);
      function touch(withPreview = true) {
        dirty = true; setStatus(); autosave();
        if (withPreview) refreshPreview();
      }

      // ---------- ส่วนหัว ----------
      const titleEl = h('h2', { style: { margin: 0 } });
      const paintTitle = () => { titleEl.textContent = Report.title(r); document.title = Report.title(r) + ' — ระบบรายงานประจำวัน'; };
      paintTitle();
      const dateInp = h('input.input', { type: 'date', value: r.date, on: { change: () => { if (!dateInp.value) return; r.date = dateInp.value; paintTitle(); dateNote(); touch(); } } });
      const dateHint = h('div.muted.small');
      const dateNote = async () => {
        const why = await UI.isHoliday(r.date);
        dateHint.textContent = `วัน${U.thaiDay(r.date)}ที่ ${U.thaiDate(r.date)}` + (why ? ` • ${why}` : '');
        if (why && r.templateId === 'weekday') dateHint.textContent += ' — แนะนำให้ใช้รูปแบบ "วันหยุด"';
        if (!why && r.templateId === 'holiday') dateHint.textContent += ' — วันนี้เป็นวันธรรมดา';
      };
      dateNote();

      const tplSel = h('select.input');
      for (const tid of Defaults.TEMPLATE_IDS) {
        const t = await DB.get('templates', tid);
        tplSel.appendChild(h('option', { value: tid }, (t && t.name) || Defaults.TEMPLATE_NAMES[tid]));
      }
      tplSel.value = r.templateId;
      tplSel.addEventListener('change', async () => {
        const t = await DB.get('templates', tplSel.value);
        if (!(await U.confirm(`เปลี่ยนเป็นรูปแบบ "${t.name}"? รูปภาพและเหตุการณ์ที่กรอกไว้จะถูกย้ายไปยังหัวข้อเดียวกันในรูปแบบใหม่`, { ok: 'เปลี่ยน' }))) { tplSel.value = r.templateId; return; }
        Report.applyTemplate(r, t);
        touch();
        rebuildForm();
        paintTitle();
      });

      const varsBox = h('div.grid2');
      const paintVars = () => {
        varsBox.innerHTML = '';
        for (const v of r.tpl.vars || []) {
          varsBox.appendChild(h('label.field', h('span', v.label || v.key), h('input.input', { value: r.vars[v.key] || '', on: { input: (e) => { r.vars[v.key] = e.target.value; paintTitle(); touch(); } } })));
        }
      };

      const updateNote = h('div');
      async function checkTemplateUpdate() {
        updateNote.innerHTML = '';
        const t = await DB.get('templates', r.templateId);
        if (t && r.tpl.templateUpdatedAt && t.updatedAt > r.tpl.templateUpdatedAt) {
          updateNote.appendChild(h('div.row', { style: { background: '#fff7e6', border: '1px solid #f3d7a6', padding: '.5rem .7rem', borderRadius: '8px', marginTop: '.6rem' } },
            h('span.grow.small', 'เทมเพลตนี้ถูกแก้ไขหลังจากสร้างรายงาน — รายงานนี้ยังใช้ข้อความชุดเดิมอยู่'),
            h('button.btn.sm', { on: { click: async () => { Report.applyTemplate(r, t); touch(); rebuildForm(); checkTemplateUpdate(); U.toast('อัปเดตตามเทมเพลตล่าสุดแล้ว', 'ok'); } } }, 'อัปเดตตามเทมเพลตล่าสุด')));
        }
      }
      checkTemplateUpdate();

      const bulkBtn = h('button.btn', {
        title: 'เลือกรูปหลายรูปพร้อมกัน ระบบจะใส่ลงช่องว่างตามลำดับจากบนลงล่าง',
        on: {
          click: async () => {
            const files = await U.pickFiles('image/*', true);
            if (!files.length) return;
            const b = U.busy('กำลังเพิ่มรูป…');
            let ids;
            try { ids = await Images.addMany(files, (i, n) => b.set(`กำลังเพิ่มรูป ${i + 1}/${n}`)); } finally { b.done(); }
            let k = 0;
            for (const blk of r.tpl.blocks) {
              if (blk.type !== 'photos' && blk.type !== 'photoGrid') continue;
              const arr = r.data[blk.id].images;
              for (let i = 0; i < arr.length && k < ids.length; i++) if (!arr[i]) arr[i] = ids[k++];
            }
            if (k < ids.length) U.toast(`ช่องรูปเต็มแล้ว เหลือ ${ids.length - k} รูปที่ไม่ได้ใส่`, 'warn', 5000);
            else U.toast(`ใส่รูป ${k} รูปเรียบร้อย`, 'ok');
            touch(); rebuildForm();
          },
        },
      }, '📷 ใส่รูปหลายรูปทีเดียว');

      const head = h('div.card',
        h('div.card-head', h('div.row', UI.typeBadge(r.templateId, r.tpl.templateName), titleEl)),
        h('div.grid2', h('label.field', h('span', 'วันที่ / เดือน / ปี'), dateInp, dateHint), h('label.field', h('span', 'รูปแบบรายงาน (เทมเพลต)'), tplSel)),
        varsBox,
        updateNote,
        h('div.row', { style: { marginTop: '.7rem' } }, bulkBtn, h('span.muted.small', 'หรือกดที่ช่องรูป / ลากไฟล์มาวางในช่อง')));

      // ---------- ฟอร์มตามบล็อกของเทมเพลต ----------
      const form = h('div');
      let showAll = false;
      function rebuildForm() {
        paintVars();
        form.innerHTML = '';
        const ctx = Report.blockContexts(r.tpl.blocks);
        let lastShift = null;
        const editableTypes = ['photos', 'photoGrid', 'incidents', 'freeText'];
        for (const b of r.tpl.blocks) {
          const isPara = b.type === 'para';
          if (isPara && !b.editable && !showAll) {
            const t = (b.text || '').trim();
            if (/^ผลัด/.test(t) && t !== lastShift) { lastShift = t; form.appendChild(h('div.section-group', h('h3', t.replace(/\s+/g, ' ')))); }
            continue;
          }
          if (!isPara && !editableTypes.includes(b.type)) continue;
          if (isPara) {
            if (!(b.text || '').trim() && !b.editable) continue;
            const t = (b.text || '').trim();
            if (/^ผลัด/.test(t) && t !== lastShift) { lastShift = t; form.appendChild(h('div.section-group', h('h3', t.replace(/\s+/g, ' ')))); }
            const cur = r.data[b.id] && r.data[b.id].text != null ? r.data[b.id].text : b.text;
            const ta = h('textarea.input.doc', { rows: Math.min(6, Math.max(1, Math.ceil(cur.length / 70))) }, cur);
            ta.addEventListener('input', () => { r.data[b.id] = { text: ta.value }; touch(); });
            const overridden = r.data[b.id] && r.data[b.id].text != null && r.data[b.id].text !== b.text;
            form.appendChild(h('div.blk', h('div.blk-title', h('span', b.label || 'ข้อความ', overridden ? h('span.sub', ' (แก้เฉพาะรายงานนี้)') : null),
              overridden ? h('button.btn.sm.ghost', { on: { click: () => { delete r.data[b.id]; touch(); rebuildForm(); } } }, 'คืนค่าตามเทมเพลต') : null), ta));
            continue;
          }
          const c = ctx[b.id] || {};
          const d = r.data[b.id] || (r.data[b.id] = {});
          if (b.type === 'photos' || b.type === 'photoGrid') {
            d.images = d.images || [];
            const title = b.label || [c.section, c.sub].filter(Boolean).join(' • ') || (b.type === 'photoGrid' ? 'ภาพประกอบ' : 'รูปภาพ');
            const cnt = h('span.sub');
            const paintCnt = () => { cnt.textContent = `${d.images.filter(Boolean).length}/${d.images.length} รูป`; };
            paintCnt();
            form.appendChild(h('div.blk', h('div.blk-title', h('span', '📷 ', title), cnt),
              UI.slotEditor(d.images, { onChange: () => { touch(); paintCnt(); }, big: b.type === 'photoGrid' })));
          } else if (b.type === 'incidents') {
            d.items = d.items || [];
            form.appendChild(incidentEditor(b, d, c));
          } else if (b.type === 'freeText') {
            d.paras = d.paras || [''];
            form.appendChild(freeTextEditor(b, d));
          }
        }
        form.appendChild(h('div', { style: { marginTop: '1rem' } }, h('label.check', h('input', { type: 'checkbox', checked: showAll, on: { change: (e) => { showAll = e.target.checked; rebuildForm(); } } }), 'แสดงข้อความส่วนอื่นเพื่อแก้ไขเฉพาะรายงานนี้ (เช่น จำนวนบุคลากร)')));
      }

      function incidentEditor(b, d, c) {
        const box = h('div.blk');
        const list = h('div');
        let paint = () => {
          list.innerHTML = '';
          if (!d.items.length) list.appendChild(h('div.muted.small', { style: { padding: '.3rem 0' } }, `ยังไม่มีเหตุการณ์ — ในเอกสารจะแสดงว่า "${b.emptyText || ''}"`));
          d.items.forEach((it, i) => {
            it.images = it.images || [];
            const ta = h('textarea.input.doc', { rows: 3, placeholder: 'เช่น เวลา 10.42 น. พนักงานจาก บริษัท ... จำนวน 3 คน เข้าพื้นที่เพื่อ...' }, it.text || '');
            ta.addEventListener('input', () => { it.text = ta.value; touch(); });
            const timeBtn = h('button.btn.sm.ghost', { title: 'ใส่เวลาปัจจุบัน', on: { click: () => { const n = new Date(); const s = `เวลา ${String(n.getHours()).padStart(2, '0')}.${String(n.getMinutes()).padStart(2, '0')} น. `; ta.value = s + ta.value; it.text = ta.value; touch(); ta.focus(); } } }, '🕑 ใส่เวลา');
            list.appendChild(h('div.inc',
              h('div.inc-head', h('strong', `เหตุการณ์ที่ ${i + 1}`), h('div.row',
                timeBtn,
                h('button.icon-btn', { title: 'เลื่อนขึ้น', on: { click: () => { if (i > 0) { [d.items[i - 1], d.items[i]] = [d.items[i], d.items[i - 1]]; touch(); paint(); } } } }, '↑'),
                h('button.icon-btn', { title: 'เลื่อนลง', on: { click: () => { if (i < d.items.length - 1) { [d.items[i + 1], d.items[i]] = [d.items[i], d.items[i + 1]]; touch(); paint(); } } } }, '↓'),
                h('button.icon-btn', { title: 'ลบเหตุการณ์', on: { click: async () => { if (await U.confirm('ลบเหตุการณ์นี้?', { danger: true, ok: 'ลบ' })) { d.items.splice(i, 1); touch(); paint(); } } } }, '🗑'))),
              ta,
              UI.slotEditor(it.images, { onChange: () => touch(), step: 1, minSlots: 0 })));
          });
        };
        const cntEl = h('span.sub');
        const paint0 = paint;
        paint = () => { paint0(); cntEl.textContent = `${d.items.length} เหตุการณ์`; };
        paint();
        box.append(h('div.blk-title', h('span', '📝 ', [c.section || 'รายงานเหตุการณ์ประจำวัน', c.shift ? ` (${c.shift.replace(/ช่วงเวลา.*/, '').trim()})` : ''].join('')), cntEl), list,
          h('button.btn', { style: { marginTop: '.5rem' }, on: { click: () => { d.items.push({ text: '', images: [null] }); touch(); paint(); const tas = U.$$('textarea', list); tas[tas.length - 1].focus(); } } }, '＋ เพิ่มเหตุการณ์'));
        return box;
      }

      function freeTextEditor(b, d) {
        const box = h('div.blk');
        const list = h('div.stack');
        const paint = () => {
          list.innerHTML = '';
          d.paras.forEach((p, i) => {
            const ta = h('textarea.input.doc', { rows: 3 }, p);
            ta.addEventListener('input', () => { d.paras[i] = ta.value; touch(); });
            list.appendChild(h('div', h('div.row.between', h('span.muted.small', `ย่อหน้าที่ ${i + 1}`), h('div.row',
              h('button.icon-btn', { title: 'เลื่อนขึ้น', on: { click: () => { if (i > 0) { [d.paras[i - 1], d.paras[i]] = [d.paras[i], d.paras[i - 1]]; touch(); paint(); } } } }, '↑'),
              h('button.icon-btn', { title: 'เลื่อนลง', on: { click: () => { if (i < d.paras.length - 1) { [d.paras[i + 1], d.paras[i]] = [d.paras[i], d.paras[i + 1]]; touch(); paint(); } } } }, '↓'),
              h('button.icon-btn', { title: 'ลบย่อหน้า', on: { click: () => { d.paras.splice(i, 1); touch(); paint(); } } }, '🗑'))), ta));
          });
        };
        paint();
        box.append(h('div.blk-title', h('span', '📝 ', b.label || 'ข้อความ'), h('span.sub', 'ใช้ {วันที่} แทนวันที่ของรายงานได้')), list,
          h('button.btn', { style: { marginTop: '.5rem' }, on: { click: () => { d.paras.push('เวลา 00.00 น. '); touch(); paint(); } } }, '＋ เพิ่มย่อหน้า'));
        return box;
      }

      rebuildForm();

      // ---------- แถบบันทึก/ส่งออก ----------
      const fresh = async () => { await autosave.flush(); return DB.get('reports', r.id); };
      const bar = h('div.savebar', status,
        h('button.btn', { on: { click: async () => { dirty = true; await autosave.flush(); U.toast('บันทึกแล้ว', 'ok'); } } }, '💾 บันทึก'),
        h('button.btn', { on: { click: async () => { await save(); UI.duplicateDialog(r); } } }, 'ทำสำเนา'),
        h('button.btn.danger', { on: { click: async () => { if (!(await U.confirm(`ลบรายงาน "${Report.title(r)}"?`, { danger: true, ok: 'ลบรายงาน' }))) return; dirty = false; await DB.remove('reports', r.id); U.toast('ลบรายงานแล้ว', 'ok'); location.hash = '#/reports'; } } }, 'ลบ'),
        h('button.btn', { on: { click: async () => Export.print([await fresh()]) } }, '🖨 พิมพ์'),
        h('button.btn.primary', { on: { click: async () => Export.pdf([await fresh()]) } }, 'PDF'),
        h('button.btn.primary', { on: { click: async () => Export.word([await fresh()]) } }, 'Word'));
      setStatus();

      const mob = h('div.tabs.mob-switch',
        h('button.active', { on: { click: (e) => switchMob('form', e.target) } }, 'กรอกข้อมูล'),
        h('button', { on: { click: (e) => switchMob('preview', e.target) } }, 'ตัวอย่าง / จัดหน้า'));
      const editor = h('div.editor.mob-form',
        h('div.form-col', head, h('div.card', form)),
        h('div.preview-col', h('div.card', preview.el, h('p.small.muted', { style: { marginTop: '.5rem' } }, 'จัดหน้า: ใช้ปุ่ม ↑ ↓ เพื่อย้ายหน้า, "ลบ/ซ่อนหน้า" เพื่อไม่ให้หน้านั้นออกในไฟล์, "＋ แทรกหน้า" เพื่อเพิ่มหน้ารูปภาพหรือหน้าว่าง'))));
      function switchMob(which, btn) {
        editor.classList.toggle('mob-form', which === 'form');
        editor.classList.toggle('mob-preview', which === 'preview');
        U.$$('button', mob).forEach((b) => b.classList.toggle('active', b === btn));
        if (which === 'preview') preview.refresh();
      }
      root.append(mob, editor, bar);
      preview.refresh();

      const onRemote = async (e) => {
        if (!e.detail.includes('reports') || dirty) return;
        const nr = await DB.get('reports', r.id);
        if (nr && nr.updatedAt > r.updatedAt && !nr.deleted) { r = nr; rebuildForm(); preview.refresh(); paintTitle(); U.toast('อัปเดตรายงานจากเครื่องอื่นแล้ว'); }
      };
      window.addEventListener('remote-update', onRemote);
      const onUnload = (e) => { if (dirty) { save(); e.preventDefault(); e.returnValue = ''; } };
      window.addEventListener('beforeunload', onUnload);
      return async () => {
        window.removeEventListener('remote-update', onRemote);
        window.removeEventListener('beforeunload', onUnload);
        bar.remove();
        if (dirty) await save();
        document.title = 'ระบบรายงานประจำวัน';
      };
    },
  };
})();
