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
          const canvas = await html2canvas(el, { scale: 2.5, backgroundColor: '#ffffff', logging: false, useCORS: true });
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
