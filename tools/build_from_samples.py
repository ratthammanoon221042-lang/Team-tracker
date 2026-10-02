#!/usr/bin/env python3
"""สร้างไฟล์โครง Word (skeleton) และเทมเพลตเริ่มต้นจากไฟล์ต้นแบบ .docx

ใช้ครั้งเดียวตอนพัฒนา (ไม่ต้องรันตอนใช้งานเว็บ):
    python3 tools/build_from_samples.py daily.docx special.docx

ผลลัพธ์:
    js/skeletons.js      -> โครงไฟล์ Word (หัวกระดาษ/ท้ายกระดาษ/สไตล์/ขอบกระดาษ) แบบ base64
    js/defaults-data.js  -> เทมเพลตเริ่มต้น 3 แบบ ที่ถอดโครงสร้างมาจากไฟล์ต้นแบบ
"""
import base64
import io
import json
import re
import sys
import zipfile

W_SPACING_DEFAULT = {"daily": (160, 259), "letter": (200, 276)}


def build_skeleton(path):
    zin = zipfile.ZipFile(path)
    out = io.BytesIO()
    zout = zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED)
    doc = zin.read("word/document.xml").decode("utf8")
    rels = zin.read("word/_rels/document.xml.rels").decode("utf8")

    # keep only non-image / non-customXml relationships of the main document
    kept = []
    for m in re.finditer(r"<Relationship [^>]*/>", rels):
        r = m.group(0)
        if "/image" in r or "customXml" in r:
            continue
        kept.append(r)
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(kept)
        + "<!--IMAGE_RELS--></Relationships>"
    )
    # media used by headers/footers
    keep_media = set()
    for name in zin.namelist():
        if re.match(r"word/_rels/(header|footer)\d*\.xml\.rels", name):
            for t in re.findall(r'Target="media/([^"]+)"', zin.read(name).decode("utf8")):
                keep_media.add("word/media/" + t)

    head, body = doc.split("<w:body>", 1)
    sect = re.search(r"<w:sectPr[ >].*?</w:sectPr>\s*</w:body>", body, re.S).group(0)
    sect = sect.replace("</w:body>", "").strip()
    doc = head + "<w:body><!--BODY-->" + sect + "</w:body></w:document>"

    for item in zin.infolist():
        n = item.filename
        if n.startswith("customXml/"):
            continue
        if n.startswith("word/media/") and n not in keep_media:
            continue
        data = zin.read(n)
        if n == "word/document.xml":
            data = doc.encode("utf8")
        elif n == "word/_rels/document.xml.rels":
            data = rels.encode("utf8")
        elif n == "[Content_Types].xml":
            s = data.decode("utf8")
            s = re.sub(r'<Override PartName="/customXml/[^>]*/>', "", s)
            for ext, ct in (("png", "image/png"), ("jpeg", "image/jpeg"), ("jpg", "image/jpeg")):
                if 'Extension="%s"' % ext not in s:
                    s = s.replace("<Default ", '<Default Extension="%s" ContentType="%s"/><Default ' % (ext, ct), 1)
            data = s.encode("utf8")
        elif n == "docProps/core.xml":
            s = data.decode("utf8")
            s = re.sub(r"<dc:creator>.*?</dc:creator>", "<dc:creator></dc:creator>", s)
            s = re.sub(r"<cp:lastModifiedBy>.*?</cp:lastModifiedBy>", "<cp:lastModifiedBy></cp:lastModifiedBy>", s)
            s = re.sub(r"<cp:revision>.*?</cp:revision>", "<cp:revision>1</cp:revision>", s)
            data = s.encode("utf8")
        zout.writestr(n, data)
    zout.close()
    return base64.b64encode(out.getvalue()).decode()


def attr(xml, tag, name):
    m = re.search(r"<w:%s [^>]*w:%s=\"(-?\w+)\"" % (tag, name), xml)
    return m.group(1) if m else None


def numbering_ind(numbering, num_id, ilvl):
    """ระยะย่อหน้าที่กำหนดในรายการสัญลักษณ์ (numbering.xml) ของ numId/ilvl"""
    if not numbering or num_id is None:
        return {}
    m = re.search(r'<w:num w:numId="%s"[^>]*>\s*<w:abstractNumId w:val="(\d+)"/>' % num_id, numbering)
    if not m:
        return {}
    a = re.search(r'<w:abstractNum [^>]*w:abstractNumId="%s".*?</w:abstractNum>' % m.group(1), numbering, re.S)
    lvl = re.search(r'<w:lvl w:ilvl="%s".*?</w:lvl>' % ilvl, a.group(0), re.S) if a else None
    ind = re.search(r"<w:ind [^>]*/>", lvl.group(0)) if lvl else None
    out = {}
    if ind:
        for k in ("left", "hanging", "firstLine"):
            v = re.search(r'w:%s="(-?\d+)"' % k, ind.group(0))
            if v:
                out[k] = int(v.group(1))
    return out


def parse_para(p, base, numbering=None):
    ppr = re.search(r"<w:pPr>(.*?)</w:pPr>", p, re.S)
    ppr = ppr.group(1) if ppr else ""
    ppr = re.sub(r"<w:rPr>.*?</w:rPr>", "", ppr, flags=re.S)
    d_after, d_line = W_SPACING_DEFAULT[base]
    is_list = 'w:pStyle w:val="a7"' in ppr
    num = re.search(r'<w:numPr><w:ilvl w:val="(\d+)"/><w:numId w:val="(\d+)"/></w:numPr>', ppr)
    # ลำดับความสำคัญของระยะย่อหน้า: สไตล์ -> รายการสัญลักษณ์ -> ค่าในย่อหน้า
    ind = {"left": 720 if is_list else 0, "hanging": 0, "firstLine": 0}
    if num:
        nind = numbering_ind(numbering, num.group(2), num.group(1))
        if nind:
            ind.update({"hanging": 0, "firstLine": 0})
            ind.update(nind)
    direct = re.search(r"<w:ind [^>]*/>", ppr)
    if direct:
        for k in ("left", "hanging", "firstLine"):
            v = re.search(r'w:%s="(-?\d+)"' % k, direct.group(0))
            if v:
                if k in ("hanging", "firstLine"):
                    ind["hanging"] = ind["firstLine"] = 0
                ind[k] = int(v.group(1))
    fmt = {
        "before": int(attr(ppr, "spacing", "before") or 0),
        "after": int(attr(ppr, "spacing", "after") or d_after),
        "line": int(attr(ppr, "spacing", "line") or d_line),
        "align": attr(ppr, "jc", "val") or "left",
        "indLeft": ind["left"],
        "hanging": ind["hanging"],
        "firstLine": ind["firstLine"],
        "tabs": [int(x) for x in re.findall(r'<w:tab w:val="left" w:pos="(\d+)"/>', ppr)],
        "list": is_list,
        "bold": False,
        "size": 16,
        "charSpacing": 0,
    }
    if num:
        fmt["numId"] = int(num.group(2))
        fmt["ilvl"] = int(num.group(1))
    text = ""
    bold_chars = 0
    plain_chars = 0
    sizes = []
    spacing_chars = {}
    runs = []  # รูปแบบแต่ละช่วงข้อความตามต้นฉบับ [ข้อความ, ตัวหนา, ระยะห่างตัวอักษร]

    def add_run(t, b, sp):
        if runs and runs[-1][1] == b and runs[-1][2] == sp:
            runs[-1][0] += t
        else:
            runs.append([t, b, sp])

    for r in re.findall(r"<w:r[ >].*?</w:r>", p, re.S):
        rpr = re.search(r"<w:rPr>(.*?)</w:rPr>", r, re.S)
        rpr = rpr.group(1) if rpr else ""
        sp = re.search(r'<w:spacing w:val="(-?\d+)"', rpr)
        spv = int(sp.group(1)) if sp else 0
        bold = "<w:b/>" in rpr
        for tok in re.finditer(r"<w:t(?: [^>]*)?>([^<]*)</w:t>|<w:tab/>|<w:br/>", r):
            s = tok.group(0)
            if s == "<w:tab/>":
                text += "\t"
                add_run("\t", bold, spv)
            elif s == "<w:br/>":
                text += "\n"
                add_run("\n", bold, spv)
            else:
                t = tok.group(1).replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                text += t
                add_run(t, bold, spv)
                n = len(t.strip())
                spacing_chars[spv] = spacing_chars.get(spv, 0) + n
                if "<w:b/>" in rpr:
                    bold_chars += n
                else:
                    plain_chars += n
        sz = re.search(r'<w:sz w:val="(\d+)"', rpr)
        if sz:
            sizes.append(int(sz.group(1)))
    if not sizes:
        sz = re.search(r'<w:sz w:val="(\d+)"', re.search(r"<w:pPr>(.*?)</w:pPr>", p, re.S).group(1) if "<w:pPr>" in p else "")
        if sz:
            sizes.append(int(sz.group(1)))
    if sizes:
        fmt["size"] = max(set(sizes), key=sizes.count) / 2
    fmt["bold"] = bold_chars > plain_chars
    if spacing_chars:
        # ระยะห่างตัวอักษร (หน่วย 1/20 pt) ที่ใช้มากที่สุดในย่อหน้า
        fmt["charSpacing"] = max(spacing_chars, key=spacing_chars.get)
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    text = text.replace("\xa0", " ")
    # ตัดช่องว่างท้ายบรรทัดใน runs ให้ตรงกับ text
    joined = "".join(r[0] for r in runs).replace("\xa0", " ")
    out = {"type": "para", "text": text, "fmt": fmt}
    trimmed = []
    for r in runs:
        trimmed.append([r[0].replace("\xa0", " "), r[1], r[2]])
    # ลบช่องว่างก่อน \n และท้ายย่อหน้า
    flat = []
    for t, b, sp in trimmed:
        for ch in t:
            flat.append([ch, b, sp])
    res = []
    i = 0
    while i < len(flat):
        ch = flat[i][0]
        if ch == " ":
            j = i
            while j < len(flat) and flat[j][0] == " ":
                j += 1
            if j == len(flat) or flat[j][0] == "\n":
                i = j
                continue
        res.append(flat[i])
        i += 1
    merged = []
    for ch, b, sp in res:
        if merged and merged[-1][1] == b and merged[-1][2] == sp:
            merged[-1][0] += ch
        else:
            merged.append([ch, b, sp])
    if "".join(m[0] for m in merged) == text and len(merged) > 0 and any(m[2] for m in merged) or len(set((m[1]) for m in merged)) > 1:
        if "".join(m[0] for m in merged) == text:
            out["runs"] = merged
    return out


def parse_body(path, base):
    z = zipfile.ZipFile(path)
    x = z.read("word/document.xml").decode("utf8")
    numbering = z.read("word/numbering.xml").decode("utf8") if "word/numbering.xml" in z.namelist() else ""
    body = x.split("<w:body>", 1)[1]
    blocks = []
    pos = 0
    while True:
        m = re.compile(r"<w:p[ >]|<w:tbl>|<w:sectPr").search(body, pos)
        if not m or m.group(0) == "<w:sectPr":
            break
        if m.group(0) == "<w:tbl>":
            # find matching end (tables are not nested in these samples)
            end = body.index("</w:tbl>", m.start()) + len("</w:tbl>")
            tbl = body[m.start():end]
            imgs = len(re.findall(r"<a:blip ", tbl))
            if 'w:w="6238"' in tbl:
                blocks.append({"type": "incidents"})
            else:
                blocks.append({"type": "photos", "slots": max(2, imgs)})
            pos = end
        else:
            end = body.index("</w:p>", m.start()) + len("</w:p>")
            p = body[m.start():end]
            if "<w:drawing>" in p and base == "letter":
                blocks.append({"type": "photoGrid", "slots": len(re.findall(r"<a:blip ", p))})
            else:
                blocks.append(parse_para(p, base, numbering))
            pos = end
    return blocks


def main(daily_path, special_path):
    skeletons = {"daily": build_skeleton(daily_path), "letter": build_skeleton(special_path)}
    with open("js/skeletons.js", "w") as f:
        f.write("// สร้างโดย tools/build_from_samples.py จากไฟล์ต้นแบบ (หัว/ท้ายกระดาษ สไตล์ ขอบกระดาษ)\n")
        f.write("window.SKELETONS = " + json.dumps(skeletons) + ";\n")

    daily = parse_body(daily_path, "daily")
    letter = parse_body(special_path, "letter")
    with open("js/defaults-data.js", "w") as f:
        f.write("// สร้างโดย tools/build_from_samples.py — โครงสร้างที่ถอดจากไฟล์ต้นแบบ\n")
        f.write("window.SAMPLE_BLOCKS = " + json.dumps({"daily": daily, "letter": letter}, ensure_ascii=False, indent=1) + ";\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
