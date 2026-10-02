// สร้างไฟล์ Word (.docx) จากโครงไฟล์ต้นแบบ (หัว/ท้ายกระดาษ สไตล์ ขอบกระดาษเหมือนต้นแบบ)
(function () {
  const X = U.xml;
  const G = () => Layout.GEO;
  const FONT = 'TH SarabunPSK';
  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
  const REL_IMG = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
  const REL_HDR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
  const REL_FTR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
  const LIST_STYLE = '<w:style w:type="paragraph" w:styleId="a7"><w:name w:val="List Paragraph"/><w:basedOn w:val="a"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>';

  function rPr(size, bold, sp) {
    const sz = Math.round(size * 2);
    return `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>${bold ? '<w:b/><w:bCs/>' : ''}${sp ? `<w:spacing w:val="${sp}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
  }

  // list: [[ข้อความ, ตัวหนา, ระยะห่างตัวอักษร]]
  function runs(list, size) {
    let out = '';
    for (const [text, bold, sp] of list) {
      if (!text) continue;
      const rp = rPr(size, bold, sp);
      String(text).split('\n').forEach((line, li) => {
        if (li > 0) out += `<w:r>${rp}<w:br/></w:r>`;
        line.split('\t').forEach((part, pi) => {
          if (pi > 0) out += `<w:r>${rp}<w:tab/></w:r>`;
          if (part) out += `<w:r>${rp}<w:t xml:space="preserve">${X(part)}</w:t></w:r>`;
        });
      });
    }
    return out;
  }

  function pPr(f, { keepNext = false, pageBreak = false, numbering = true } = {}) {
    let s = '<w:pPr>';
    if (f.list) s += '<w:pStyle w:val="a7"/>';
    if (keepNext) s += '<w:keepNext/>';
    if (pageBreak) s += '<w:pageBreakBefore/>';
    if (f.numId && numbering) s += `<w:numPr><w:ilvl w:val="${f.ilvl || 0}"/><w:numId w:val="${f.numId}"/></w:numPr>`;
    if (f.tabs && f.tabs.length) s += '<w:tabs>' + f.tabs.map((t) => `<w:tab w:val="left" w:pos="${t}"/>`).join('') + '</w:tabs>';
    s += `<w:spacing w:before="${f.before || 0}" w:after="${f.after || 0}" w:line="${f.line || 240}" w:lineRule="${f.lineRule || 'auto'}"/>`;
    const ind = [];
    ind.push(`w:left="${f.indLeft || 0}"`);
    if (f.hanging) ind.push(`w:hanging="${f.hanging}"`);
    else if (f.firstLine) ind.push(`w:firstLine="${f.firstLine}"`);
    else if (f.list) ind.push('w:firstLine="0"');
    s += `<w:ind ${ind.join(' ')}/>`;
    s += `<w:jc w:val="${f.align === 'thaiDistribute' ? 'thaiDistribute' : f.align === 'both' ? 'both' : f.align || 'left'}"/>`;
    s += rPr(f.size || 16, f.bold, f.charSpacing) + '</w:pPr>';
    return s;
  }

  // ย่อหน้า: ถ้าไฟล์โครงไม่มีรายการสัญลักษณ์ (numbering) ให้ใส่ • + แท็บเป็นข้อความแทน
  const para = (text, f, opts = {}, rl = null) => {
    const list = rl || [[text, !!f.bold, f.charSpacing || 0]];
    let pre = '';
    if (f.numId && opts.numbering === false) pre = `<w:r>${rPr(f.size || 16, false)}<w:sym w:font="Symbol" w:char="F0B7"/></w:r><w:r>${rPr(f.size || 16, false)}<w:tab/></w:r>`;
    return `<w:p>${pPr(f, opts)}${pre}${runs(list, f.size || 16)}</w:p>`;
  };
  // ย่อหน้าสูง 1pt สำหรับขึ้นหน้าใหม่ก่อนตาราง / ตัวแบ่งส่วน / ปิดท้ายเอกสาร
  const tinyPara = ({ pageBreak = false, sectPr = '' } = {}) => `<w:p><w:pPr>${pageBreak ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>${sectPr}</w:pPr></w:p>`;

  // ---------- ตัวสร้างเอกสาร ----------
  class Builder {
    constructor() {
      this.media = new Map(); // imageId -> {rid, file}
      this.docPr = 1000;
    }

    image(id, imgs, wcm, hcm) {
      const info = imgs[id];
      if (!info) return '';
      let m = this.media.get(id);
      if (!m) {
        const n = this.media.size + 1;
        m = { rid: 'rIdImg' + n, file: 'rimg' + n + '.jpeg', id };
        this.media.set(id, m);
      }
      const cx = U.cm2emu(wcm), cy = U.cm2emu(hcm);
      // ครอปกลางภาพให้พอดีกรอบ (เหมือนในหน้าตัวอย่าง)
      const A = wcm / hcm, a = info.w / info.h;
      let l = 0, t = 0;
      if (a > A) l = Math.round(((1 - A / a) / 2) * 100000);
      else if (a < A) t = Math.round(((1 - a / A) / 2) * 100000);
      const src = l || t ? `<a:srcRect l="${l}" t="${t}" r="${l}" b="${t}"/>` : '';
      const pid = ++this.docPr;
      return `<w:r><w:rPr><w:noProof/><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${pid}" name="Picture ${pid}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS_A}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}"><pic:pic xmlns:pic="${NS_PIC}"><pic:nvPicPr><pic:cNvPr id="${pid}" name="${m.file}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${m.rid}"/>${src}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    }

    imgPara(id, imgs, wcm, hcm, { align = 'center', before = 0, after = 0 } = {}) {
      return `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/><w:jc w:val="${align}"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr>${id ? this.image(id, imgs, wcm, hcm) : ''}</w:p>`;
    }

    table(rows, kind, imgs) {
      const g = G();
      const border = (v) => `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="${v}" w:sz="4" w:space="0" w:color="auto"/>`).join('')}</w:tblBorders>`;
      let s = '<w:tbl>';
      if (kind === 'photoRow') {
        s += `<w:tblPr><w:tblW w:w="${g.photo.col * 2}" w:type="dxa"/><w:tblInd w:w="${g.photo.ind}" w:type="dxa"/>${border('single')}<w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`;
        s += `<w:tblGrid><w:gridCol w:w="${g.photo.col}"/><w:gridCol w:w="${g.photo.col}"/></w:tblGrid>`;
        for (const r of rows) {
          s += `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${g.photo.rowH}" w:hRule="exact"/></w:trPr>`;
          for (const id of r.imgs) s += `<w:tc><w:tcPr><w:tcW w:w="${g.photo.col}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${this.imgPara(id, imgs, g.photo.imgW, g.photo.imgH)}</w:tc>`;
          s += '</w:tr>';
        }
      } else if (kind === 'incRow') {
        const w = g.inc.cols[0] + g.inc.cols[1];
        s += `<w:tblPr><w:tblW w:w="${w}" w:type="dxa"/><w:tblInd w:w="${g.inc.ind}" w:type="dxa"/>${border('single')}<w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`;
        s += `<w:tblGrid><w:gridCol w:w="${g.inc.cols[0]}"/><w:gridCol w:w="${g.inc.cols[1]}"/></w:tblGrid>`;
        for (const r of rows) {
          s += '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
          s += `<w:tc><w:tcPr><w:tcW w:w="${g.inc.cols[0]}" w:type="dxa"/></w:tcPr>${para(r.text, g.inc.textFmt)}</w:tc>`;
          const pics = r.imgs.length ? r.imgs.map((id) => this.imgPara(id, imgs, g.inc.imgW, g.inc.imgH, { before: 40, after: 40 })).join('') : this.imgPara(null, imgs, 0, 0);
          s += `<w:tc><w:tcPr><w:tcW w:w="${g.inc.cols[1]}" w:type="dxa"/></w:tcPr>${pics}</w:tc>`;
          s += '</w:tr>';
        }
      } else if (kind === 'gridRow') {
        const w = g.grid.cols[0] + g.grid.cols[1];
        s += `<w:tblPr><w:tblW w:w="${w}" w:type="dxa"/><w:tblInd w:w="${g.grid.ind}" w:type="dxa"/>${border('none')}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`;
        s += `<w:tblGrid><w:gridCol w:w="${g.grid.cols[0]}"/><w:gridCol w:w="${g.grid.cols[1]}"/></w:tblGrid>`;
        for (const r of rows) {
          s += '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
          r.imgs.forEach((id, i) => {
            s += `<w:tc><w:tcPr><w:tcW w:w="${g.grid.cols[i]}" w:type="dxa"/></w:tcPr>${id === undefined ? this.imgPara(null, imgs, 0, 0) : this.imgPara(id, imgs, g.grid.imgW, g.grid.imgH, { align: 'left', before: r.first ? g.grid.gapFirst : g.grid.gap })}</w:tc>`;
          });
          s += '</w:tr>';
        }
      }
      return s + '</w:tbl>';
    }

    // แปลงรายการองค์ประกอบของหนึ่งหน้าเป็น XML
    pageXml(items, imgs, { pageBreak = false, keep = [] } = {}) {
      let s = '';
      let needBreak = pageBreak;
      let i = 0;
      while (i < items.length) {
        const it = items[i];
        if (it.k === 'para') {
          s += para(it.text, it.fmt, { keepNext: keep[i], pageBreak: needBreak, numbering: this.numbering }, it.runs);
          needBreak = false;
          i++;
          continue;
        }
        if (it.k === 'break') { i++; continue; }
        // รวมแถวที่ติดกันของตารางเดียวกัน
        let j = i + 1;
        while (j < items.length && items[j].k === it.k && items[j].src === it.src && !items[j].first) j++;
        if (needBreak) { s += tinyPara({ pageBreak: true }); needBreak = false; }
        s += this.table(items.slice(i, j), it.k, imgs);
        i = j;
      }
      if (needBreak) s += tinyPara({ pageBreak: true });
      return s;
    }
  }

  // หน้าไหนต้องขึ้นหน้าใหม่แบบบังคับ (นอกนั้นปล่อยให้ Word ไหลข้อความเองเหมือนต้นแบบ)
  function breakFlags(pages) {
    let prev = null;
    return pages.map((p, idx) => {
      let f = false;
      if (idx > 0) {
        if (p.forced || p.extra || (prev && prev.extra)) f = true;
        // ย้ายลำดับหน้า -> ต้องบังคับขึ้นหน้าใหม่
        else if (Number(p.key.slice(1)) < Number(prev.key.slice(1))) f = true;
      }
      prev = p;
      return f;
    });
  }

  function sectPrOf(docXml) {
    const m = docXml.match(/<w:sectPr[ >][\s\S]*?<\/w:sectPr>/);
    return m ? m[0] : '';
  }

  // docs: [{base, pages:[final pages], imgs}]
  async function build(docs) {
    const mainBase = docs[0].base;
    const zip = await JSZip.loadAsync(U.base64ToBytes(window.SKELETONS[mainBase]));
    const b = new Builder();
    b.numbering = !!zip.file('word/numbering.xml');
    let docXml = await zip.file('word/document.xml').async('string');
    let rels = await zip.file('word/_rels/document.xml.rels').async('string');
    let ct = await zip.file('[Content_Types].xml').async('string');
    let styles = await zip.file('word/styles.xml').async('string');
    const sect = { [mainBase]: sectPrOf(docXml) };

    // นำหัว/ท้ายกระดาษของรูปแบบอื่นเข้ามา (กรณีรวมรายงานต่างรูปแบบ)
    for (const base of [...new Set(docs.map((d) => d.base))]) {
      if (base === mainBase) continue;
      const oz = await JSZip.loadAsync(U.base64ToBytes(window.SKELETONS[base]));
      const oDoc = await oz.file('word/document.xml').async('string');
      const oRels = await oz.file('word/_rels/document.xml.rels').async('string');
      let os = sectPrOf(oDoc);
      for (const m of oRels.matchAll(/<Relationship [^>]*Type="([^"]+)"[^>]*\/>/g)) {
        const rel = m[0];
        if (m[1] !== REL_HDR && m[1] !== REL_FTR) continue;
        const rid = rel.match(/Id="([^"]+)"/)[1];
        const target = rel.match(/Target="([^"]+)"/)[1];
        const kind = m[1] === REL_HDR ? 'header' : 'footer';
        const newName = `${kind}_${base}.xml`;
        const newRid = `rId_${kind}_${base}`;
        zip.file('word/' + newName, await oz.file('word/' + target).async('string'));
        const partRels = oz.file(`word/_rels/${target}.rels`);
        if (partRels) {
          let pr = await partRels.async('string');
          for (const mm of pr.matchAll(/Target="media\/([^"]+)"/g)) {
            zip.file(`word/media/${base}_${mm[1]}`, await oz.file('word/media/' + mm[1]).async('uint8array'));
          }
          pr = pr.replace(/Target="media\//g, `Target="media/${base}_`);
          zip.file(`word/_rels/${newName}.rels`, pr);
        }
        rels = rels.replace('<!--IMAGE_RELS-->', `<Relationship Id="${newRid}" Type="${m[1]}" Target="${newName}"/><!--IMAGE_RELS-->`);
        ct = ct.replace('</Types>', `<Override PartName="/word/${newName}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml"/></Types>`);
        os = os.split(`r:id="${rid}"`).join(`r:id="${newRid}"`);
      }
      sect[base] = os;
      // สไตล์ที่ยังไม่มี
      const oStyles = await oz.file('word/styles.xml').async('string');
      for (const st of oStyles.match(/<w:style [\s\S]*?<\/w:style>/g) || []) {
        const sid = (st.match(/w:styleId="([^"]+)"/) || [])[1];
        if (sid && !styles.includes(`w:styleId="${sid}"`)) styles = styles.replace('</w:styles>', st.replace(/ w:default="1"/, '') + '</w:styles>');
      }
    }
    if (!styles.includes('w:styleId="a7"')) styles = styles.replace('</w:styles>', LIST_STYLE + '</w:styles>');

    let body = '';
    docs.forEach((d, di) => {
      const visible = d.pages.filter((p) => !p.hidden);
      const flags = breakFlags(visible);
      const all = [];
      visible.forEach((p) => all.push(...p.items));
      const keepAll = Layout.keepFlags(all);
      let off = 0;
      visible.forEach((p, pi) => {
        const keep = keepAll.slice(off, off + p.items.length);
        off += p.items.length;
        body += b.pageXml(p.items, d.imgs, { pageBreak: flags[pi], keep });
      });
      if (di < docs.length - 1) body += tinyPara({ sectPr: sect[d.base] });
    });
    // ปิดท้ายด้วยย่อหน้าเล็ก ๆ (กัน Word เพิ่มหน้าเปล่าเมื่อจบด้วยตาราง)
    body += tinyPara();
    const lastBase = docs[docs.length - 1].base;
    docXml = docXml.replace(/<!--BODY-->[\s\S]*<\/w:body>/, () => body + sect[lastBase] + '</w:body>');

    // รูปภาพ
    let imgRels = '';
    for (const m of b.media.values()) {
      const bytes = await Images.bytes(m.id);
      if (!bytes) continue;
      zip.file('word/media/' + m.file, bytes);
      imgRels += `<Relationship Id="${m.rid}" Type="${REL_IMG}" Target="media/${m.file}"/>`;
    }
    rels = rels.replace('<!--IMAGE_RELS-->', imgRels);
    zip.file('word/document.xml', docXml);
    zip.file('word/_rels/document.xml.rels', rels);
    zip.file('[Content_Types].xml', ct);
    zip.file('word/styles.xml', styles);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = zip.file('docProps/core.xml');
    if (core) {
      let c = await core.async('string');
      c = c.replace(/(<dcterms:modified[^>]*>)[^<]*/, `$1${now}`).replace(/(<dcterms:created[^>]*>)[^<]*/, `$1${now}`);
      zip.file('docProps/core.xml', c);
    }
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
  }

  window.Docx = { build, breakFlags };
})();
