// ตั้งค่า: ซิงก์ Google Drive, วันหยุด, สำรอง/กู้คืนข้อมูล
(function () {
  const { h } = U;
  window.Pages = window.Pages || {};

  function qrSvg(text) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(unescape(encodeURIComponent(text)));
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) { return ''; }
  }

  async function backupZip() {
    const b = U.busy('กำลังสำรองข้อมูล…');
    try {
      const zip = new JSZip();
      const templates = await DB.all('templates');
      const reports = await DB.all('reports');
      zip.file('data.json', JSON.stringify({ app: 'daily-report', version: 1, exportedAt: new Date().toISOString(), templates, reports }));
      const used = new Set();
      reports.filter((r) => !r.deleted).forEach((r) => Report.imageIds(r).forEach((i) => used.add(i)));
      let n = 0;
      for (const id of used) {
        n++;
        b.set(`กำลังสำรองรูป ${n}/${used.size}`);
        const rec = await Images.get(id);
        if (rec) zip.file(`images/${id}.jpg`, rec.blob);
      }
      b.set('กำลังบีบอัดไฟล์…');
      const blob = await zip.generateAsync({ type: 'blob' });
      U.download(blob, `สำรองข้อมูลรายงาน-${U.isoDate()}.zip`);
    } finally { b.done(); }
  }

  async function restoreZip(file) {
    const b = U.busy('กำลังกู้คืนข้อมูล…');
    try {
      const zip = await JSZip.loadAsync(file);
      const data = JSON.parse(await zip.file('data.json').async('string'));
      let n = 0;
      for (const store of ['templates', 'reports']) {
        for (const rec of data[store] || []) {
          const cur = await DB.get(store, rec.id);
          if (!cur || (cur.updatedAt || 0) < (rec.updatedAt || 0)) { await DB.put(store, rec, { keepTime: true }); n++; }
        }
      }
      const imgs = zip.file(/^images\//);
      let k = 0;
      for (const f of imgs) {
        k++;
        b.set(`กำลังกู้คืนรูป ${k}/${imgs.length}`);
        const id = f.name.replace(/^images\//, '').replace(/\.jpg$/, '');
        if (await DB.get('images', id)) continue;
        const blob = new Blob([await f.async('uint8array')], { type: 'image/jpeg' });
        const dims = await new Promise((res) => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([1600, 900]); im.src = URL.createObjectURL(blob); });
        await DB.put('images', { id, blob, w: dims[0], h: dims[1], type: 'image/jpeg', createdAt: Date.now(), uploaded: false });
      }
      U.toast(`กู้คืนข้อมูลแล้ว (${n} รายการ, รูป ${imgs.length})`, 'ok', 5000);
    } catch (e) {
      console.error(e);
      U.toast('กู้คืนไม่สำเร็จ: ' + e.message, 'error', 6000);
    } finally { b.done(); }
  }

  Pages.settings = {
    async render(root) {
      // ---------- ซิงก์ ----------
      const conf = Sync.config() || {};
      const url = h('input.input', { value: conf.url || '', placeholder: 'https://script.google.com/macros/s/..../exec' });
      const key = h('input.input', { value: conf.key || '', placeholder: 'รหัสลับ (SECRET) ที่ตั้งไว้ในโค้ด Apps Script' });
      const result = h('div.small');
      const shareBox = h('div');
      const paintShare = () => {
        shareBox.innerHTML = '';
        const c = Sync.config();
        if (!c || !c.url) return;
        const link = location.href.split('#')[0] + '#/settings?sync=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({ url: c.url, key: c.key })))));
        shareBox.append(h('hr.sep'), h('h3', 'ตั้งค่าเครื่องอื่น (มือถือ/คอมเครื่องอื่น)'),
          h('div.row', { style: { alignItems: 'flex-start' } },
            h('div', { style: { width: '170px', flex: 'none' }, html: qrSvg(link) }),
            h('div.grow.stack',
              h('p.small', 'สแกน QR นี้ด้วยมือถือ หรือเปิดลิงก์นี้บนเครื่องอื่น ระบบจะตั้งค่าการซิงก์และดึงข้อมูลทั้งหมดมาให้อัตโนมัติ'),
              h('div.row', h('input.input.grow', { value: link, readonly: true }), h('button.btn', { on: { click: async () => { try { await navigator.clipboard.writeText(link); U.toast('คัดลอกลิงก์แล้ว', 'ok'); } catch (e) { U.toast('คัดลอกไม่ได้ กรุณาคัดลอกเอง', 'warn'); } } } }, 'คัดลอก')),
              h('p.small', { style: { color: 'var(--warn)' } }, '⚠ ลิงก์นี้มีรหัสลับ อย่าส่งให้คนอื่น'))));
      };
      paintShare();
      const syncCard = h('div.card',
        h('div.card-head', h('h2', 'ซิงก์ข้อมูลกับ Google Drive (ใช้หลายเครื่อง + สำรองข้อมูลอัตโนมัติ)')),
        h('p.small.muted', 'ข้อมูลทั้งหมด (เทมเพลต รายงาน รูปภาพ) จะเก็บใน Google Drive ของคุณเอง ฟรี ไม่มีวันหมดอายุ ไม่ต้องดูแลเซิร์ฟเวอร์ — ตั้งค่าครั้งเดียว'),
        h('details', Sync.enabled() ? {} : { open: true }, h('summary', 'วิธีตั้งค่า (ประมาณ 5 นาที)'),
          h('ol.steps', { style: { marginTop: '.6rem' } },
            h('li', 'เปิด ', h('a', { href: 'https://script.google.com/home/projects/create', target: '_blank', rel: 'noopener' }, 'script.google.com → โครงการใหม่'), ' (ล็อกอินด้วยบัญชี Google ที่จะใช้เก็บข้อมูล)'),
            h('li', 'ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดจากปุ่มนี้: ', h('button.btn.sm', { on: { click: copyCode } }, 'คัดลอกโค้ด Apps Script'), ' (หรือเปิดไฟล์ ', h('code', 'apps-script/Code.gs'), ')'),
            h('li', 'แก้บรรทัด ', h('code', "const SECRET = '...'"), ' เป็นรหัสลับของคุณเอง (ภาษาอังกฤษ+ตัวเลข ยาว ๆ) แล้วกดบันทึก 💾'),
            h('li', 'กด ', h('b', 'Deploy → New deployment'), ' → เลือกชนิด ', h('b', 'Web app'), ' → Execute as: ', h('b', 'Me'), ' → Who has access: ', h('b', 'Anyone'), ' → Deploy → อนุญาตสิทธิ์ (Advanced → Go to … → Allow)'),
            h('li', 'คัดลอก ', h('b', 'Web app URL'), ' (ลงท้ายด้วย /exec) มาวางด้านล่าง พร้อมรหัสลับ แล้วกด "ทดสอบและบันทึก"'))),
        h('div.grid2', { style: { marginTop: '.6rem' } }, h('label.field', h('span', 'Web app URL'), url), h('label.field', h('span', 'รหัสลับ (SECRET)'), key)),
        h('div.row', { style: { marginTop: '.6rem' } },
          h('button.btn.primary', {
            on: {
              click: async () => {
                const u = url.value.trim(), k = key.value.trim();
                if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(u)) { result.textContent = 'URL ไม่ถูกต้อง ต้องเป็นลิงก์ Web app ของ Google Apps Script'; result.style.color = 'var(--danger)'; return; }
                const b = U.busy('กำลังทดสอบการเชื่อมต่อ…');
                try {
                  const j = await Sync.test(u, k);
                  Sync.save({ url: u, key: k });
                  result.innerHTML = '';
                  result.style.color = 'var(--ok)';
                  result.append('✓ เชื่อมต่อสำเร็จ — ข้อมูลเก็บที่ ', h('a', { href: j.folder, target: '_blank', rel: 'noopener' }, 'โฟลเดอร์ใน Google Drive'));
                  paintShare();
                  Sync.run();
                } catch (e) { result.textContent = '✗ ' + e.message; result.style.color = 'var(--danger)'; } finally { b.done(); }
              },
            },
          }, 'ทดสอบและบันทึก'),
          Sync.enabled() ? h('button.btn', { on: { click: () => Sync.run() } }, 'ซิงก์ตอนนี้') : null,
          Sync.enabled() ? h('button.btn.danger', { on: { click: async () => { if (await U.confirm('หยุดซิงก์บนเครื่องนี้? (ข้อมูลในเครื่องและบน Drive ยังอยู่ครบ)', { ok: 'หยุดซิงก์' })) { Sync.disable(); Pages.settings.render(clear(root)); } } } }, 'หยุดซิงก์เครื่องนี้') : null),
        result,
        shareBox);

      async function copyCode() {
        try {
          const code = await (await fetch('apps-script/Code.gs')).text();
          await navigator.clipboard.writeText(code);
          U.toast('คัดลอกโค้ดแล้ว — นำไปวางใน Apps Script', 'ok');
        } catch (e) {
          U.toast('คัดลอกอัตโนมัติไม่ได้ กำลังเปิดไฟล์โค้ด…', 'warn');
          window.open('apps-script/Code.gs', '_blank');
        }
      }

      // ---------- วันหยุด ----------
      const hs = await UI.holidays();
      const recurring = h('textarea.input', { rows: 3 }, hs.recurring.map((d) => { const [m, dd] = d.split('-'); return `${Number(dd)}/${Number(m)}`; }).join(', '));
      const special = h('textarea.input', { rows: 3, placeholder: 'เช่น 2026-10-23, 2026-11-05' }, hs.dates.join(', '));
      const holCard = h('div.card',
        h('div.card-head', h('h2', 'วันหยุด (ใช้เลือกเทมเพลต "วันหยุด" อัตโนมัติ)')),
        h('p.small.muted', 'วันเสาร์-อาทิตย์เป็นวันหยุดอัตโนมัติ — เพิ่มวันหยุดนักขัตฤกษ์ได้ด้านล่าง (ในหน้าสร้างรายงานเปลี่ยนรูปแบบเองได้เสมอ)'),
        h('div.grid2',
          h('label.field', h('span', 'วันหยุดประจำปี (วัน/เดือน คั่นด้วย ,)'), recurring),
          h('label.field', h('span', 'วันหยุดเฉพาะปี เช่น วันหยุดตามจันทรคติ/วันหยุดชดเชย (ปี ค.ศ.-เดือน-วัน)'), special)),
        h('div.row', { style: { marginTop: '.6rem' } }, h('button.btn.primary', {
          on: {
            click: async () => {
              const rec = recurring.value.split(/[,\s]+/).filter(Boolean).map((s) => { const [d, m] = s.split('/').map(Number); return d && m ? `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null; }).filter(Boolean);
              const dates = special.value.split(/[,\s]+/).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
              await UI.saveHolidays({ recurring: rec, dates });
              U.toast('บันทึกวันหยุดแล้ว', 'ok');
            },
          },
        }, 'บันทึกวันหยุด')));

      // ---------- สำรองข้อมูล ----------
      const est = await DB.estimate();
      const reports = await DB.live('reports');
      const backupCard = h('div.card',
        h('div.card-head', h('h2', 'สำรอง / กู้คืนข้อมูล')),
        h('p.small.muted', `ในเครื่องนี้มีรายงาน ${reports.length} ฉบับ` + (est && est.usage ? ` • ใช้พื้นที่ประมาณ ${U.fmtBytes(est.usage)}` : '')),
        h('div.row',
          h('button.btn', { on: { click: backupZip } }, '⬇ สำรองข้อมูลทั้งหมด (.zip)'),
          h('button.btn', { on: { click: async () => { const [f] = await U.pickFiles('.zip,application/zip', false); if (f) await restoreZip(f); } } }, '⬆ กู้คืนจากไฟล์ .zip'),
          h('button.btn', { on: { click: async () => { if (!(await U.confirm('ลบรูปภาพที่ไม่มีรายงานใดใช้แล้วออกจากเครื่องนี้?', { ok: 'ลบ' }))) return; const n = await Images.collectGarbage(); U.toast(`ลบรูปที่ไม่ได้ใช้ ${n} รูป`, 'ok'); } } }, 'ล้างรูปที่ไม่ได้ใช้')));

      root.append(syncCard, holCard, backupCard);
    },
  };

  function clear(el) { el.innerHTML = ''; return el; }
})();
