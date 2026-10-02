// รายงานทั้งหมด: ค้นหา เปิด ทำสำเนา ลบ และรวมหลายรายงานเป็นไฟล์เดียว
(function () {
  const { h } = U;
  window.Pages = window.Pages || {};

  Pages.reports = {
    async render(root) {
      const all = (await DB.live('reports')).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
      const selected = new Set();
      const state = { q: '', type: '', month: '' };
      const months = [...new Set(all.map((r) => r.date.slice(0, 7)))].sort().reverse();

      const q = h('input.input', { placeholder: 'ค้นหา (ชื่อรายงาน วันที่ เหตุการณ์)', on: { input: (e) => { state.q = e.target.value.trim(); paint(); } } });
      const typeSel = h('select.input', { on: { change: (e) => { state.type = e.target.value; paint(); } } }, h('option', { value: '' }, 'ทุกรูปแบบ'), ...Defaults.TEMPLATE_IDS.map((id) => h('option', { value: id }, Defaults.TEMPLATE_NAMES[id])));
      const monthSel = h('select.input', { on: { change: (e) => { state.month = e.target.value; paint(); } } }, h('option', { value: '' }, 'ทุกเดือน'), ...months.map((m) => h('option', { value: m }, U.thaiMonthYear(m))));

      const listBox = h('div');
      const bulk = h('div.savebar.hidden');

      const text = (r) => {
        let s = Report.title(r) + ' ' + U.thaiDate(r.date) + ' ' + r.date;
        for (const d of Object.values(r.data || {})) if (d && d.items) d.items.forEach((it) => { s += ' ' + (it.text || ''); });
        return s.toLowerCase();
      };
      const filtered = () => all.filter((r) => (!state.type || r.templateId === state.type) && (!state.month || r.date.startsWith(state.month)) && (!state.q || text(r).includes(state.q.toLowerCase())));
      const selList = () => all.filter((r) => selected.has(r.id)).sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));

      function paintBulk() {
        bulk.innerHTML = '';
        bulk.classList.toggle('hidden', !selected.size);
        if (!selected.size) return;
        const name = () => {
          const s = selList();
          return s.length === 1 ? Report.title(s[0]) : `รายงานรวม ${U.thaiDate(s[0].date)} - ${U.thaiDate(s[s.length - 1].date)}`;
        };
        bulk.append(
          h('span.status', `เลือก ${selected.size} รายงาน (เรียงตามวันที่)`),
          h('button.btn.ghost', { on: { click: () => { selected.clear(); paint(); } } }, 'ยกเลิกการเลือก'),
          h('button.btn.danger', { on: { click: async () => { if (!(await U.confirm(`ลบ ${selected.size} รายงานที่เลือก?`, { danger: true, ok: 'ลบทั้งหมด' }))) return; for (const id of selected) await DB.remove('reports', id); U.toast('ลบแล้ว', 'ok'); Pages.reports.render(clear(root)); } } }, 'ลบที่เลือก'),
          h('button.btn', { on: { click: () => { Pages.pdfQueue = selList().map((r) => r.id); location.hash = '#/pdf'; } } }, 'ส่งไปรวม/จัดหน้า PDF'),
          h('button.btn.primary', { on: { click: () => Export.pdf(selList(), name()) } }, 'รวมเป็น PDF ไฟล์เดียว'),
          h('button.btn.primary', { on: { click: () => Export.word(selList(), name()) } }, 'รวมเป็น Word ไฟล์เดียว'));
      }

      function row(r) {
        const cb = h('input', { type: 'checkbox', checked: selected.has(r.id), on: { change: (e) => { if (e.target.checked) selected.add(r.id); else selected.delete(r.id); paintBulk(); } } });
        const incCount = Object.values(r.data || {}).reduce((s, d) => s + (d && d.items ? d.items.filter((i) => (i.text || '').trim()).length : 0), 0);
        const imgCount = Report.imageIds(r).length;
        return h('div.list-item',
          cb,
          UI.typeBadge(r.templateId, r.tpl && r.tpl.templateName),
          h('div.grow',
            h('a.title', { href: '#/report/' + r.id }, Report.title(r)),
            h('div.muted.small', `วัน${U.thaiDay(r.date)} • รูป ${imgCount} • เหตุการณ์ ${incCount} • แก้ไข ${U.thaiDateTime(r.updatedAt)}`)),
          h('div.row',
            h('a.btn.sm', { href: '#/report/' + r.id }, 'เปิด/แก้ไข'),
            h('button.btn.sm', { on: { click: () => Export.word([r]) } }, 'Word'),
            h('button.btn.sm', { on: { click: () => Export.pdf([r]) } }, 'PDF'),
            h('button.btn.sm', { on: { click: () => UI.duplicateDialog(r) } }, 'ทำสำเนา'),
            h('button.btn.sm.danger', { on: { click: async () => { if (!(await U.confirm(`ลบรายงาน "${Report.title(r)}"?`, { danger: true, ok: 'ลบ' }))) return; await DB.remove('reports', r.id); const i = all.indexOf(r); all.splice(i, 1); selected.delete(r.id); paint(); U.toast('ลบแล้ว', 'ok'); } } }, 'ลบ')));
      }

      function paint() {
        listBox.innerHTML = '';
        const list = filtered();
        if (!list.length) {
          listBox.appendChild(h('div.card.empty-state', all.length ? 'ไม่พบรายงานที่ตรงกับเงื่อนไข' : h('div', h('p', 'ยังไม่มีรายงาน'), h('a.btn.primary', { href: '#/new' }, 'สร้างรายงาน'))));
        }
        const groups = new Map();
        list.forEach((r) => { const m = r.date.slice(0, 7); if (!groups.has(m)) groups.set(m, []); groups.get(m).push(r); });
        for (const [m, rs] of groups) {
          const allSel = rs.every((r) => selected.has(r.id));
          listBox.appendChild(h('div.card',
            h('div.card-head', h('h3', `${U.thaiMonthYear(m)} `, h('span.muted.small', `(${rs.length} รายงาน)`)),
              h('button.btn.sm', { on: { click: () => { rs.forEach((r) => (allSel ? selected.delete(r.id) : selected.add(r.id))); paint(); } } }, allSel ? 'ยกเลิกเลือกทั้งเดือน' : 'เลือกทั้งเดือน')),
            h('div.list', rs.map(row))));
        }
        paintBulk();
      }

      root.append(
        h('div.card', h('div.card-head', h('h2', 'รายงานทั้งหมด'), h('a.btn.primary', { href: '#/new' }, '＋ สร้างรายงาน')),
          h('div.grid2', q, typeSel, monthSel),
          h('p.small.muted', { style: { margin: '.6rem 0 0' } }, 'เลือกหลายรายงาน (เช่น ทั้งเดือน) เพื่อรวมเป็นไฟล์ Word หรือ PDF ไฟล์เดียว')),
        h('div', { style: { marginTop: '1rem' } }, listBox),
        bulk);
      paint();
      return () => bulk.remove();
    },
  };

  function clear(el) { el.innerHTML = ''; return el; }
})();
