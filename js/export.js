// ส่งออก Word / PDF / พิมพ์ (ใช้หน้าจากเอนจินจัดหน้าเดียวกับหน้าตัวอย่าง)
(function () {
  const Export = {};

  async function docsFor(reports, onStep) {
    const docs = [];
    for (let i = 0; i < reports.length; i++) {
      onStep && onStep(`กำลังจัดหน้า ${i + 1}/${reports.length}`);
      const built = await Layout.build(reports[i]);
      docs.push({ base: built.base, pages: built.pages, imgs: built.imgs, report: reports[i] });
    }
    return docs;
  }
  Export.docsFor = docsFor;

  Export.word = async (reports, fileName) => {
    const b = U.busy('กำลังสร้างไฟล์ Word…');
    try {
      const docs = await docsFor(reports, b.set);
      b.set('กำลังสร้างไฟล์ Word…');
      const blob = await Docx.build(docs);
      U.download(blob, U.safeFileName(fileName || Report.title(reports[0])) + '.docx');
      U.toast('สร้างไฟล์ Word แล้ว', 'ok');
    } catch (e) {
      console.error(e);
      U.toast('สร้างไฟล์ Word ไม่สำเร็จ: ' + e.message, 'error', 6000);
    } finally { b.done(); }
  };

  // ---------- แปลงหน้า HTML เป็นภาพ ด้วยตัววาดของเบราว์เซอร์เอง (SVG foreignObject) ----------
  // ใช้แทน html2canvas เพราะ html2canvas วาดวรรณยุกต์/สระซ้อนของภาษาไทยผิด
  const dataUrlCache = new Map();
  async function toDataUrl(url) {
    if (dataUrlCache.has(url)) return dataUrlCache.get(url);
    const p = fetch(url).then((r) => r.blob()).then((b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }));
    dataUrlCache.set(url, p);
    return p;
  }
  let cssP = null;
  async function pageCss() {
    if (!cssP) {
      cssP = (async () => {
        let css = await (await fetch('css/app.css')).text();
        // ฝังฟอนต์เอกสารลงใน CSS (ภาพ SVG โหลดไฟล์ภายนอกไม่ได้)
        const fonts = [...new Set(css.match(/\.\.\/fonts\/[\w.-]+\.ttf/g) || [])];
        for (const f of fonts) css = css.split(f).join(await toDataUrl(f.replace('../', '')));
        css = css.replace(/@font-face\s*{[^}]*SarabunUI[^}]*}/g, '').replace(/local\([^)]*\),\s*/g, '');
        return css;
      })();
    }
    return cssP;
  }

  async function rasterize(el, scale) {
    const w = el.offsetWidth, h = el.offsetHeight;
    const clone = el.cloneNode(true);
    for (const img of U.$$('img', clone)) img.setAttribute('src', await toDataUrl(img.src));
    const css = await pageCss();
    const xhtml = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0"><style>${css.replace(/]]>/g, '')}</style>${xhtml}</div></foreignObject></svg>`;
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('วาดหน้าไม่สำเร็จ')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    // วาด 2 ครั้ง: ครั้งแรกให้เบราว์เซอร์โหลดฟอนต์ในภาพให้เสร็จ
    ctx.drawImage(img, 0, 0, c.width, c.height);
    await U.sleep(60);
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  Export.rasterize = rasterize;

  // วาดทุกหน้าเป็นภาพแล้วรวมเป็น PDF (ตัวอักษรไทยแสดงถูกต้อง 100%)
  Export.pdfBlob = async (docs, onStep) => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const stage = U.h('div.render-stage');
    document.body.appendChild(stage);
    let n = 0;
    const total = docs.reduce((s, d) => s + d.pages.filter((p) => !p.hidden).length, 0);
    try {
      for (const d of docs) {
        for (const p of d.pages) {
          if (p.hidden) continue;
          n++;
          onStep && onStep(`กำลังสร้าง PDF หน้า ${n}/${total}`);
          const el = await Layout.renderPage(p, d.base, d.imgs);
          stage.appendChild(el);
          await Promise.all(U.$$('img', el).map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
          const canvas = await rasterize(el, 2.5);
          const data = canvas.toDataURL('image/jpeg', 0.9);
          if (n > 1) pdf.addPage('a4', 'portrait');
          pdf.addImage(data, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
          stage.removeChild(el);
        }
      }
    } finally { stage.remove(); }
    return pdf.output('blob');
  };

  Export.pdf = async (reports, fileName) => {
    const b = U.busy('กำลังสร้าง PDF…');
    try {
      const docs = await docsFor(reports, b.set);
      const blob = await Export.pdfBlob(docs, b.set);
      U.download(blob, U.safeFileName(fileName || Report.title(reports[0])) + '.pdf');
      U.toast('สร้างไฟล์ PDF แล้ว', 'ok');
    } catch (e) {
      console.error(e);
      U.toast('สร้าง PDF ไม่สำเร็จ: ' + e.message, 'error', 6000);
    } finally { b.done(); }
  };

  // พิมพ์ / บันทึกเป็น PDF ผ่านหน้าต่างพิมพ์ของเบราว์เซอร์ (ตัวอักษรคมชัดแบบเวกเตอร์)
  Export.print = async (reports) => {
    const b = U.busy('กำลังเตรียมพิมพ์…');
    let area;
    try {
      const docs = await docsFor(reports, b.set);
      area = U.h('div#print-area');
      for (const d of docs) for (const p of d.pages) if (!p.hidden) area.appendChild(await Layout.renderPage(p, d.base, d.imgs));
      document.body.appendChild(area);
      await Promise.all(U.$$('img', area).map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
      b.done();
      document.body.classList.add('printing');
      window.print();
    } catch (e) {
      U.toast('พิมพ์ไม่สำเร็จ: ' + e.message, 'error');
    } finally {
      b.done();
      setTimeout(() => { document.body.classList.remove('printing'); area && area.remove(); }, 500);
    }
  };

  window.Export = Export;
})();
