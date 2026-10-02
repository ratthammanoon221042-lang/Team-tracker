// เครื่องมือรวม/จัดหน้า PDF: รวมไฟล์ เรียงหน้า หมุน ลบ แทรกหน้าว่าง แยกหน้า
(function () {
  const { h } = U;
  window.Pages = window.Pages || {};
  let pdfjsP = null;
  async function pdfjs() {
    if (!pdfjsP) {
      pdfjsP = import(new URL('js/lib/pdf.min.mjs', document.baseURI).href).then((m) => {
        m.GlobalWorkerOptions.workerSrc = new URL('js/lib/pdf.worker.min.mjs', document.baseURI).href;
        return m;
      });
    }
    return pdfjsP;
  }

  // สถานะคงอยู่ระหว่างเปลี่ยนหน้า (ไม่บันทึกลงฐานข้อมูล)
  const S = { sources: {}, pages: [], selected: new Set(), outName: 'เอกสารรวม' };

  async function addPdf(name, bytes) {
    const lib = await pdfjs();
    const srcId = U.uid('s');
    S.sources[srcId] = { name, bytes: bytes.slice(0), type: 'pdf' };
    const doc = await lib.getDocument({ data: bytes.slice(0) }).promise;
    for (let i = 0; i < doc.numPages; i++) {
      const page = await doc.getPage(i + 1);
      const vp = page.getViewport({ scale: 0.35 });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      S.pages.push({ id: U.uid('p'), kind: 'pdf', srcId, index: i, rot: 0, thumb: c.toDataURL('image/jpeg', 0.7), label: `${name} • หน้า ${i + 1}` });
    }
    await doc.destroy();
  }

  async function addImage(file) {
    const srcId = U.uid('s');
    const isPng = file.type === 'image/png';
    let bytes = new Uint8Array(await file.arrayBuffer());
    let type = isPng ? 'png' : 'jpg';
    if (!isPng && file.type !== 'image/jpeg') {
      // แปลงไฟล์ชนิดอื่นเป็น JPEG
      const id = await Images.add(file);
      bytes = await Images.bytes(id);
      type = 'jpg';
    }
    S.sources[srcId] = { name: file.name, bytes, type: 'image', imgType: type };
    const url = URL.createObjectURL(new Blob([bytes]));
    S.pages.push({ id: U.uid('p'), kind: 'image', srcId, rot: 0, thumb: url, label: file.name });
  }

  async function buildPdf(pages) {
    const { PDFDocument, degrees } = PDFLib;
    const out = await PDFDocument.create();
    const loaded = {};
    const A4 = [595.28, 841.89];
    for (const p of pages) {
      if (p.kind === 'blank') { const pg = out.addPage(A4); if (p.rot) pg.setRotation(degrees(p.rot)); continue; }
      const src = S.sources[p.srcId];
      if (p.kind === 'pdf') {
        if (!loaded[p.srcId]) loaded[p.srcId] = await PDFDocument.load(src.bytes, { ignoreEncryption: true });
        const [cp] = await out.copyPages(loaded[p.srcId], [p.index]);
        const base = cp.getRotation().angle || 0;
        cp.setRotation(degrees((base + p.rot) % 360));
        out.addPage(cp);
      } else if (p.kind === 'image') {
        const img = src.imgType === 'png' ? await out.embedPng(src.bytes) : await out.embedJpg(src.bytes);
        const pg = out.addPage(A4);
        const m = 28;
        const s = Math.min((A4[0] - 2 * m) / img.width, (A4[1] - 2 * m) / img.height);
        const w = img.width * s, hh = img.height * s;
        pg.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - hh) / 2, width: w, height: hh });
        if (p.rot) pg.setRotation(degrees(p.rot));
      }
    }
    return new Blob([await out.save()], { type: 'application/pdf' });
  }

  Pages.pdf = {
    async render(root) {
      const grid = h('div.pdf-grid');
      const info = h('span.muted.small');
      const nameInp = h('input.input', { value: S.outName, style: { maxWidth: '280px' }, on: { input: (e) => { S.outName = e.target.value; } } });
      let sortable = null;

      async function addFiles(files) {
        const b = U.busy('กำลังเพิ่มไฟล์…');
        try {
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            b.set(`กำลังเพิ่มไฟล์ ${i + 1}/${files.length}: ${f.name}`);
            if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) await addPdf(f.name, new Uint8Array(await f.arrayBuffer()));
            else if (/^image\//.test(f.type)) await addImage(f);
            else U.toast(`ไม่รองรับไฟล์ ${f.name} (รองรับ PDF และรูปภาพ — ไฟล์ Word ให้บันทึกเป็น PDF ก่อน)`, 'warn', 6000);
          }
        } catch (e) { console.error(e); U.toast('เพิ่มไฟล์ไม่สำเร็จ: ' + e.message, 'error'); } finally { b.done(); }
        paint();
      }

      async function addReports(ids) {
        const reports = [];
        for (const id of ids) { const r = await DB.get('reports', id); if (r && !r.deleted) reports.push(r); }
        if (!reports.length) return;
        const b = U.busy('กำลังแปลงรายงานเป็น PDF…');
        try {
          for (const r of reports) {
            const docs = await Export.docsFor([r], b.set);
            const blob = await Export.pdfBlob(docs, b.set);
            await addPdf(Report.title(r), new Uint8Array(await blob.arrayBuffer()));
          }
        } catch (e) { console.error(e); U.toast('แปลงรายงานไม่สำเร็จ: ' + e.message, 'error'); } finally { b.done(); }
        paint();
      }

      function thumb(p, i) {
        const sel = S.selected.has(p.id);
        const cv = h('div.cv');
        if (p.kind === 'blank') cv.appendChild(h('div', { style: { width: '70%', aspectRatio: '210/297', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)' } }));
        else cv.appendChild(h('img', { src: p.thumb, alt: '' }));
        cv.firstChild.style.transform = `rotate(${p.rot}deg)`;
        const el = h('div.pdf-thumb' + (sel ? '.sel' : ''), { 'data-id': p.id },
          h('span.pn', String(i + 1)),
          cv,
          h('div.meta', h('span', { title: p.label }, p.label)),
          h('div.acts',
            h('button.icon-btn', { title: 'หมุนทวนเข็ม', on: { click: (e) => { e.stopPropagation(); p.rot = (p.rot + 270) % 360; paint(); } } }, '⟲'),
            h('button.icon-btn', { title: 'หมุนตามเข็ม', on: { click: (e) => { e.stopPropagation(); p.rot = (p.rot + 90) % 360; paint(); } } }, '⟳'),
            h('button.icon-btn', { title: 'ทำซ้ำหน้า', on: { click: (e) => { e.stopPropagation(); S.pages.splice(i + 1, 0, Object.assign({}, p, { id: U.uid('p') })); paint(); } } }, '⧉'),
            h('button.icon-btn', { title: 'แทรกหน้าว่างหลังหน้านี้', on: { click: (e) => { e.stopPropagation(); S.pages.splice(i + 1, 0, { id: U.uid('p'), kind: 'blank', rot: 0, label: 'หน้าว่าง' }); paint(); } } }, '▭'),
            h('button.icon-btn', { title: 'ลบหน้า', on: { click: (e) => { e.stopPropagation(); S.pages.splice(i, 1); S.selected.delete(p.id); paint(); } } }, '🗑')));
        el.addEventListener('click', () => { if (S.selected.has(p.id)) S.selected.delete(p.id); else S.selected.add(p.id); paint(); });
        return el;
      }

      function paint() {
        if (sortable) { sortable.destroy(); sortable = null; }
        grid.innerHTML = '';
        S.pages.forEach((p, i) => grid.appendChild(thumb(p, i)));
        if (!S.pages.length) grid.appendChild(h('div.empty-state', { style: { gridColumn: '1 / -1' } }, 'ยังไม่มีหน้า — เพิ่มไฟล์ PDF/รูปภาพ หรือรายงานที่บันทึกไว้'));
        info.textContent = `${S.pages.length} หน้า` + (S.selected.size ? ` • เลือก ${S.selected.size} หน้า` : '');
        selBar.classList.toggle('hidden', !S.selected.size);
        sortable = Sortable.create(grid, {
          animation: 150, filter: '.icon-btn', preventOnFilter: false,
          onEnd: (e) => { if (e.oldIndex === e.newIndex) return; const [m] = S.pages.splice(e.oldIndex, 1); S.pages.splice(e.newIndex, 0, m); paint(); },
        });
      }

      const drop = h('div.dropzone',
        h('p', { style: { margin: '0 0 .6rem' } }, 'ลากไฟล์ PDF หรือรูปภาพมาวางที่นี่ (หลายไฟล์ได้)'),
        h('div.row', { style: { justifyContent: 'center' } },
          h('button.btn.primary', { on: { click: async () => addFiles(await U.pickFiles('application/pdf,image/*', true)) } }, '＋ เลือกไฟล์ PDF / รูปภาพ'),
          h('button.btn', { on: { click: () => pickReports() } }, '＋ เพิ่มจากรายงานที่บันทึกไว้'),
          h('button.btn', { on: { click: () => { S.pages.push({ id: U.uid('p'), kind: 'blank', rot: 0, label: 'หน้าว่าง' }); paint(); } } }, '＋ หน้าว่าง')));
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); addFiles(Array.from(e.dataTransfer.files || [])); });

      async function pickReports() {
        const reports = (await DB.live('reports')).sort((a, b) => b.date.localeCompare(a.date));
        const chosen = new Set();
        const list = h('div.list', { style: { maxHeight: '55vh', overflow: 'auto' } }, reports.map((r) => h('label.list-item.check', h('input', { type: 'checkbox', on: { change: (e) => (e.target.checked ? chosen.add(r.id) : chosen.delete(r.id)) } }), UI.typeBadge(r.templateId, r.tpl.templateName), h('span', Report.title(r)))));
        U.modal({ title: 'เลือกรายงาน', wide: true, body: reports.length ? list : h('p', 'ยังไม่มีรายงาน'), actions: [{ label: 'ยกเลิก' }, { label: 'เพิ่ม', primary: true, onClick: () => { const ids = reports.filter((r) => chosen.has(r.id)).sort((a, b) => a.date.localeCompare(b.date)).map((r) => r.id); setTimeout(() => addReports(ids), 50); } }] });
      }

      const selBar = h('div.row.hidden', { style: { marginBottom: '.6rem' } },
        h('button.btn.sm', { on: { click: () => { S.selected.clear(); paint(); } } }, 'ยกเลิกการเลือก'),
        h('button.btn.sm', { on: { click: () => { S.pages.forEach((p) => { if (S.selected.has(p.id)) p.rot = (p.rot + 90) % 360; }); paint(); } } }, 'หมุนหน้าที่เลือก'),
        h('button.btn.sm.danger', { on: { click: () => { S.pages = S.pages.filter((p) => !S.selected.has(p.id)); S.selected.clear(); paint(); } } }, 'ลบหน้าที่เลือก'),
        h('button.btn.sm', { on: { click: async () => { const b = U.busy('กำลังสร้าง PDF…'); try { U.download(await buildPdf(S.pages.filter((p) => S.selected.has(p.id))), U.safeFileName(S.outName + ' (เฉพาะหน้าที่เลือก)') + '.pdf'); } catch (e) { U.toast(e.message, 'error'); } finally { b.done(); } } } }, 'แยกเฉพาะหน้าที่เลือกเป็นไฟล์ใหม่'));

      root.append(
        h('div.card',
          h('div.card-head', h('h2', 'รวมไฟล์ / จัดหน้า PDF'), info),
          h('p.small.muted', 'รวมหลายไฟล์เป็นไฟล์เดียว • ลากเพื่อเรียงหน้า • หมุน/ทำซ้ำ/ลบหน้า • แทรกหน้าว่าง • คลิกที่หน้าเพื่อเลือกหลายหน้า (ไฟล์ทำงานในเครื่องนี้เท่านั้น ไม่ถูกอัปโหลด)'),
          drop),
        h('div.card', selBar, grid),
        h('div.savebar',
          h('span.status', 'ชื่อไฟล์:'), nameInp,
          h('button.btn.danger', { on: { click: async () => { if (!S.pages.length || (await U.confirm('ล้างหน้าทั้งหมด?', { danger: true, ok: 'ล้าง' }))) { S.pages = []; S.sources = {}; S.selected.clear(); paint(); } } } }, 'ล้างทั้งหมด'),
          h('button.btn.primary', { on: { click: async () => { if (!S.pages.length) return U.toast('ยังไม่มีหน้า', 'warn'); const b = U.busy('กำลังรวมไฟล์ PDF…'); try { U.download(await buildPdf(S.pages), U.safeFileName(S.outName) + '.pdf'); U.toast('สร้างไฟล์ PDF แล้ว', 'ok'); } catch (e) { console.error(e); U.toast('รวมไฟล์ไม่สำเร็จ: ' + e.message, 'error'); } finally { b.done(); } } } }, '⬇ ดาวน์โหลด PDF ที่รวมแล้ว')));
      paint();
      if (Pages.pdfQueue && Pages.pdfQueue.length) {
        const q = Pages.pdfQueue;
        Pages.pdfQueue = null;
        addReports(q);
      }
    },
  };
})();
