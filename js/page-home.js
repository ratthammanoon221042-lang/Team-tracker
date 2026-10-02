// หน้าแรก + หน้าเริ่มสร้างรายงาน
(function () {
  const { h } = U;
  window.Pages = window.Pages || {};

  // ส่วนเลือกวันที่และชนิดรายงาน (ใช้ทั้งหน้าแรกและหน้า "สร้างรายงาน")
  async function createForm(defaultDate) {
    let date = defaultDate || U.isoDate();
    let tid = await UI.autoTemplate(date);
    let manual = false;
    const dateInp = h('input.input', { type: 'date', value: date });
    const dateTh = h('div.muted.small');
    const pick = h('div.type-pick');
    const note = h('div.small.muted');
    const btns = {};
    for (const id of Defaults.TEMPLATE_IDS) {
      const t = await DB.get('templates', id);
      btns[id] = h('button', { on: { click: () => { tid = id; manual = true; paint(); } } }, (t && t.name) || Defaults.TEMPLATE_NAMES[id]);
      pick.appendChild(btns[id]);
    }
    async function paint() {
      dateTh.textContent = date ? `วัน${U.thaiDay(date)}ที่ ${U.thaiDate(date)}` : '';
      const why = date ? await UI.isHoliday(date) : '';
      note.textContent = why ? `ระบบเลือก "วันหยุด" ให้อัตโนมัติ (${why})` : 'ระบบเลือก "วันธรรมดา" ให้อัตโนมัติ (เปลี่ยนได้)';
      Object.entries(btns).forEach(([id, b]) => b.classList.toggle('active', id === tid));
    }
    dateInp.addEventListener('change', async () => { date = dateInp.value; if (!manual && date) tid = await UI.autoTemplate(date); paint(); });
    await paint();
    const go = h('button.btn.primary', { style: { width: '100%', padding: '.7rem', fontSize: '1rem' }, on: { click: () => createReport(date, tid) } }, 'สร้างรายงาน');
    return h('div.stack.quick-create',
      h('label.field', h('span', 'วันที่ของรายงาน'), dateInp, dateTh),
      h('div', h('div.muted.small', { style: { marginBottom: '.25rem' } }, 'รูปแบบรายงาน'), pick, note),
      go);
  }

  async function createReport(date, tid) {
    if (!date) return U.toast('กรุณาเลือกวันที่', 'warn');
    const all = await DB.live('reports');
    const dup = all.find((r) => r.date === date && r.templateId === tid);
    if (dup && tid !== 'special') {
      const open = await U.confirm(`มีรายงาน "${Defaults.TEMPLATE_NAMES[tid]}" ของวันที่ ${U.thaiDate(date)} อยู่แล้ว ต้องการเปิดรายงานเดิมหรือไม่? (กด "สร้างใหม่" เพื่อสร้างอีกฉบับ)`, { ok: 'เปิดรายงานเดิม', title: 'มีรายงานวันนี้แล้ว' });
      if (open) { location.hash = '#/report/' + dup.id; return; }
      if (!(await U.confirm('สร้างรายงานฉบับใหม่ของวันเดียวกัน?', { ok: 'สร้างใหม่' }))) return;
    }
    const r = await Report.create(tid, date);
    await DB.put('reports', r);
    location.hash = '#/report/' + r.id;
  }

  function reportRow(r) {
    return h('div.list-item',
      UI.typeBadge(r.templateId, r.tpl && r.tpl.templateName),
      h('div.grow', h('a.title', { href: '#/report/' + r.id }, Report.title(r)), h('div.muted.small', `วัน${U.thaiDay(r.date)} • แก้ไขล่าสุด ${U.thaiDateTime(r.updatedAt)}`)),
      h('a.btn.sm', { href: '#/report/' + r.id }, 'เปิด'));
  }

  Pages.home = {
    async render(root) {
      const reports = (await DB.live('reports')).sort((a, b) => b.updatedAt - a.updatedAt);
      const today = U.isoDate();
      const todays = reports.filter((r) => r.date === today);
      const recent = h('div.list');
      reports.slice(0, 8).forEach((r) => recent.appendChild(reportRow(r)));
      if (!reports.length) recent.appendChild(h('div.empty-state', 'ยังไม่มีรายงาน — เริ่มสร้างรายงานฉบับแรกได้เลย'));

      const st = Sync.state();
      const tips = h('div.card',
        h('h3', 'ขั้นตอนการใช้งาน'),
        h('ol.steps',
          h('li', h('a', { href: '#/templates' }, 'ตั้งค่าเทมเพลต'), ' ทั้ง 3 แบบ (วันธรรมดา / วันหยุด / รายงานพิเศษ) — ตั้งครั้งเดียวใช้ได้ตลอด'),
          h('li', 'กด "สร้างรายงาน" เลือกวันที่ → ใส่รูปและเหตุการณ์ประจำวัน (ระบบบันทึกให้อัตโนมัติ)'),
          h('li', 'ตรวจตัวอย่าง จัดหน้า (ย้าย/ลบ/แทรกหน้า) แล้วกด Word หรือ PDF'),
          h('li', h('a', { href: '#/reports' }, 'รายงานทั้งหมด'), ': ค้นหา แก้ไข ทำสำเนา ลบ และรวมหลายวันเป็นไฟล์เดียว')),
        !Sync.enabled() ? h('p.small', { style: { color: 'var(--warn)' } }, '⚠ ตอนนี้ข้อมูลเก็บในเครื่องนี้เท่านั้น — ', h('a', { href: '#/settings' }, 'ตั้งค่าการซิงก์ Google Drive'), ' เพื่อใช้หลายเครื่องและสำรองข้อมูล') : h('p.small.muted', 'ซิงก์กับ Google Drive แล้ว' + (st.lastSync ? ' • ล่าสุด ' + U.thaiDateTime(st.lastSync) : '')));

      root.append(
        h('div.hero',
          h('div.card',
            h('div.card-head', h('h2', 'สร้างรายงานใหม่'), h('span.muted.small', 'วันนี้: ' + U.thaiDate(today))),
            todays.length ? h('div', { style: { marginBottom: '.8rem', padding: '.6rem .8rem', background: 'var(--accent)', borderRadius: '8px' } }, 'รายงานของวันนี้: ', ...todays.map((r) => h('a', { href: '#/report/' + r.id, style: { marginRight: '.6rem' } }, Report.title(r)))) : null,
            await createForm(today)),
          tips),
        h('div.card', h('div.card-head', h('h2', 'รายงานล่าสุด'), h('a.btn.sm', { href: '#/reports' }, 'ดูทั้งหมด')), recent));
    },
  };

  Pages.newReport = {
    async render(root, _, q) {
      root.append(h('div.card', { style: { maxWidth: '560px', margin: '0 auto' } }, h('h2', 'สร้างรายงานใหม่'), await createForm(q.date)));
    },
  };

  Pages.createReport = createReport;
})();
