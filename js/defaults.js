// เทมเพลตเริ่มต้น 3 แบบ สร้างจากโครงสร้างที่ถอดมาจากไฟล์ต้นแบบ (js/defaults-data.js)
(function () {
  const S = window.SAMPLE_BLOCKS;

  const TEMPLATE_IDS = ['weekday', 'holiday', 'special'];
  const TEMPLATE_NAMES = { weekday: 'วันธรรมดา', holiday: 'วันหยุด', special: 'รายงานพิเศษ' };

  function numberIds(blocks) {
    blocks.forEach((b, i) => { b.id = 'b' + (i + 1); });
    return blocks;
  }

  function dailyBlocks() {
    const src = U.clone(S.daily);
    const out = [];
    for (let i = 0; i < src.length; i++) {
      const b = src[i];
      if (i === 0) b.text = 'รายงานผลการปฏิบัติงาน วันที่ {วันที่}';
      // ย่อหน้าว่างจำนวนมากหลังหัวข้อ 5 ในต้นแบบ ใช้ดันผลัดกลางคืนไปขึ้นหน้าใหม่ -> ใช้ตัวแบ่งหน้าแทน
      if (i >= 29 && i <= 57) {
        // ในต้นแบบ ย่อหน้าว่างบรรทัดสุดท้ายล้นไปอยู่บนสุดของหน้าผลัดกลางคืน -> คงไว้ 1 บรรทัด
        if (i === 29) out.push({ type: 'pageBreak' }, U.clone(src[57]));
        continue;
      }
      if (b.type === 'incidents') b.emptyText = 'ไม่มีเหตุการณ์ผิดปกติ';
      out.push(b);
      // ผลัดกลางคืน: เพิ่มหัวข้อ 5 รายงานเหตุการณ์ประจำวัน (ตามที่ต้องการให้มีทั้งสองผลัด)
      if (i === 83) {
        out.push(U.clone(src[24]), U.clone(src[25]), U.clone(src[26]), U.clone(src[27]));
        out.push({ type: 'incidents', emptyText: 'ไม่มีเหตุการณ์ผิดปกติ' });
      }
    }
    return numberIds(out);
  }

  function letterBlocks() {
    const src = U.clone(S.letter);
    const out = [];
    src.forEach((b, i) => {
      if (i === 0) b.text = 'เลขที่ {เลขที่}';
      if (i === 1) b.text = 'วันที่ {วันที่}';
      if (i === 2) b.text = 'เรื่อง\t{เรื่อง}';
      if (i >= 7 && i <= 11) {
        if (i === 7) {
          out.push({
            type: 'freeText',
            label: 'รายละเอียดเหตุการณ์ (ลำดับเวลา)',
            fmt: U.clone(src[8].fmt),
            defaultItems: ['เมื่อวันที่ {วันที่} เวลาประมาณ 00.00 น. '],
          });
        }
        return;
      }
      if (b.type === 'para' && b.text === 'ภาพประกอบ') b.fmt.keepNext = true;
      out.push(b);
    });
    return numberIds(out);
  }

  function makeTemplate(id) {
    const base = id === 'special' ? 'letter' : 'daily';
    const t = {
      id,
      kind: 'template',
      name: TEMPLATE_NAMES[id],
      base,
      fileName: id === 'special' ? 'รายงานพิเศษ {เรื่อง} {วันที่}' : 'รายงานผลการปฏิบัติงาน {วันที่}',
      vars: id === 'special'
        ? [
          { key: 'เลขที่', label: 'เลขที่หนังสือ', default: 'DES0001/2569', remember: true },
          { key: 'เรื่อง', label: 'เรื่อง', default: 'รายงานเหตุการณ์', remember: false },
        ]
        : [],
      blocks: base === 'letter' ? letterBlocks() : dailyBlocks(),
    };
    return t;
  }

  const Defaults = {
    TEMPLATE_IDS,
    TEMPLATE_NAMES,
    makeTemplate,
    // สร้างเทมเพลตเริ่มต้นในฐานข้อมูล ถ้ายังไม่มี
    async ensure() {
      // เวอร์ชันของค่าเริ่มต้น: ถ้าเพิ่มขึ้น เทมเพลตที่ยังไม่เคยแก้ไขจะถูกแทนด้วยค่าใหม่
      const VERSION = 2;
      const ver = (await DB.getMeta('defaultsVersion')) || 1;
      for (const id of TEMPLATE_IDS) {
        let t = await DB.get('templates', id);
        if (t && !t.deleted && (t.updatedAt || 0) <= 1 && ver < VERSION) t = null;
        // updatedAt = 1 เพื่อให้เทมเพลตที่ตั้งค่าไว้บนคลาวด์ (ถ้ามี) ชนะเสมอเมื่อซิงก์
        if (!t || t.deleted) await DB.put('templates', Object.assign(makeTemplate(id), { updatedAt: 1 }), { keepTime: true, silent: true });
      }
      await DB.setMeta('defaultsVersion', VERSION);
    },
    // รูปแบบย่อหน้าสำเร็จรูป (ค่าจากไฟล์ต้นแบบ)
    PRESETS: {
      title: { label: 'หัวเรื่องรายงาน (กลาง ตัวหนา)', fmt: { before: 120, after: 0, line: 240, align: 'center', indLeft: 0, hanging: 0, firstLine: 0, tabs: [], list: false, bold: true, size: 16 } },
      shift: { label: 'หัวข้อผลัด (ตัวหนา)', fmt: { before: 0, after: 0, line: 240, align: 'thaiDistribute', indLeft: 0, hanging: 0, firstLine: 0, tabs: [2977], list: false, bold: true, size: 16 } },
      summary: { label: 'ย่อหน้าสรุป (ย่อบรรทัดแรก)', fmt: { before: 0, after: 120, line: 216, align: 'thaiDistribute', indLeft: 0, hanging: 0, firstLine: 0, tabs: [1134, 2977], list: false, bold: false, size: 16 } },
      section: { label: 'หัวข้อย่อย 1. 2. 3. (ตัวหนา)', fmt: { before: 120, after: 0, line: 240, align: 'left', indLeft: 0, hanging: 0, firstLine: 0, tabs: [], list: false, bold: true, size: 16 } },
      sub: { label: 'บรรทัดช่วงเวลา (มีสัญลักษณ์ •)', fmt: { before: 0, after: 0, line: 216, align: 'thaiDistribute', indLeft: 1066, hanging: 357, firstLine: 0, tabs: [], list: true, bold: false, size: 16, numId: 7, ilvl: 0, charSpacing: 0 } },
      body: { label: 'เนื้อหาใต้หัวข้อ (มีสัญลักษณ์ •)', fmt: { before: 0, after: 120, line: 216, align: 'thaiDistribute', indLeft: 1066, hanging: 357, firstLine: 0, tabs: [], list: true, bold: false, size: 16, numId: 7, ilvl: 0, charSpacing: 0 } },
      blank: { label: 'บรรทัดว่าง', fmt: { before: 0, after: 0, line: 240, align: 'left', indLeft: 0, hanging: 0, firstLine: 0, tabs: [], list: false, bold: false, size: 16 } },
      letterPara: { label: 'ย่อหน้าหนังสือ (ย่อบรรทัดแรก)', fmt: { before: 0, after: 0, line: 240, align: 'thaiDistribute', indLeft: 0, hanging: 0, firstLine: 720, tabs: [], list: false, bold: false, size: 16 } },
      letterLine: { label: 'บรรทัดหนังสือ (ชิดซ้าย)', fmt: { before: 0, after: 0, line: 240, align: 'left', indLeft: 0, hanging: 0, firstLine: 0, tabs: [], list: false, bold: false, size: 16 } },
      sign: { label: 'ลงชื่อ (แท็บ 8 ซม.)', fmt: { before: 0, after: 0, line: 240, align: 'left', indLeft: 0, hanging: 0, firstLine: 0, tabs: [4536], list: false, bold: false, size: 16 } },
    },
    BLOCK_TYPES: {
      para: 'ข้อความ',
      photos: 'ตารางรูปภาพ (2 รูป/แถว)',
      incidents: 'ตารางรายงานเหตุการณ์ (ข้อความ | รูป)',
      freeText: 'ย่อหน้าที่กรอกเองในแต่ละรายงาน',
      photoGrid: 'ภาพประกอบขนาดใหญ่ (2 รูป/แถว)',
      pageBreak: 'ขึ้นหน้าใหม่',
    },
  };

  window.Defaults = Defaults;
})();
