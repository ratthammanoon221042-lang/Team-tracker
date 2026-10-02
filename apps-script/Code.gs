/**
 * ระบบรายงานประจำวัน — ตัวเก็บข้อมูลบน Google Drive (Google Apps Script)
 *
 * วิธีติดตั้ง (ทำครั้งเดียว):
 * 1) เปิด https://script.google.com  > โครงการใหม่ (New project)
 * 2) ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดไฟล์นี้ลงไป
 * 3) แก้ค่า SECRET ด้านล่างเป็นรหัสลับของคุณเอง (ภาษาอังกฤษ/ตัวเลข ยาว ๆ เดายาก)
 * 4) กด Deploy (การทำให้ใช้งานได้) > New deployment (การทำให้ใช้งานได้รายการใหม่)
 *      - Select type: Web app (เว็บแอป)
 *      - Execute as: Me (ตัวฉัน)
 *      - Who has access: Anyone (ทุกคน)
 *    กด Deploy แล้วอนุญาตสิทธิ์ (Authorize) ให้เข้าถึง Google Drive ของคุณ
 * 5) คัดลอก Web app URL (ลงท้ายด้วย /exec) ไปวางในหน้า "ตั้งค่า" ของเว็บ พร้อมรหัส SECRET
 *
 * ข้อมูลทั้งหมดจะอยู่ในโฟลเดอร์ "ระบบรายงานประจำวัน (ข้อมูล)" ใน Google Drive ของคุณ
 * ถ้าแก้โค้ดภายหลัง ให้ Deploy > Manage deployments > แก้ไข (ดินสอ) > Version: New version
 */

const SECRET = 'เปลี่ยนเป็นรหัสลับของคุณ';
const FOLDER_NAME = 'ระบบรายงานประจำวัน (ข้อมูล)';
const VERSION = 1;

function doGet() {
  return json_({ ok: true, app: 'daily-report', version: VERSION });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (!SECRET || SECRET === 'เปลี่ยนเป็นรหัสลับของคุณ') return json_({ ok: false, error: 'ยังไม่ได้ตั้งค่า SECRET ในโค้ด Apps Script' });
    if (req.key !== SECRET) return json_({ ok: false, error: 'รหัสลับไม่ถูกต้อง' });
    switch (req.action) {
      case 'ping': return json_({ ok: true, version: VERSION, folder: root_().getUrl() });
      case 'list': return json_(list_());
      case 'getRecords': return json_(getRecords_(req.ids || []));
      case 'putRecords': return withLock_(() => putRecords_(req.items || []));
      case 'putImage': return withLock_(() => putImage_(req.id, req.data, req.mime));
      case 'getImage': return json_(getImage_(req.id));
      default: return json_({ ok: false, error: 'ไม่รู้จักคำสั่ง ' + req.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return json_(fn()); } finally { lock.releaseLock(); }
}

function root_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* สร้างใหม่ */ }
  }
  const f = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('ROOT_ID', f.getId());
  return f;
}

function sub_(name) {
  const r = root_();
  const it = r.getFoldersByName(name);
  return it.hasNext() ? it.next() : r.createFolder(name);
}

function indexFile_() {
  const r = root_();
  const it = r.getFilesByName('index.json');
  if (it.hasNext()) return it.next();
  return r.createFile('index.json', JSON.stringify({ records: {}, images: {} }), MimeType.PLAIN_TEXT);
}

function readIndex_() {
  try { return JSON.parse(indexFile_().getBlob().getDataAsString('UTF-8')); } catch (e) { return { records: {}, images: {} }; }
}

function writeIndex_(idx) {
  indexFile_().setContent(JSON.stringify(idx));
}

function list_() {
  const idx = readIndex_();
  const records = {};
  Object.keys(idx.records).forEach(function (k) {
    const r = idx.records[k];
    records[k] = { store: r.store, updatedAt: r.updatedAt, deleted: !!r.deleted };
  });
  return { ok: true, records: records, images: Object.keys(idx.images) };
}

function getRecords_(ids) {
  const idx = readIndex_();
  const out = [];
  ids.forEach(function (id) {
    const r = idx.records[id];
    if (!r || !r.fileId) return;
    try {
      const rec = JSON.parse(DriveApp.getFileById(r.fileId).getBlob().getDataAsString('UTF-8'));
      out.push({ store: r.store, rec: rec });
    } catch (e) { /* ข้ามไฟล์ที่เสีย */ }
  });
  return { ok: true, items: out };
}

function putRecords_(items) {
  const idx = readIndex_();
  const folder = sub_('records');
  const saved = [];
  const skipped = [];
  items.forEach(function (it) {
    const rec = it.rec;
    const cur = idx.records[rec.id];
    if (cur && cur.updatedAt >= rec.updatedAt) { skipped.push(rec.id); return; }
    const content = JSON.stringify(rec);
    let fileId = cur && cur.fileId;
    if (fileId) {
      try { DriveApp.getFileById(fileId).setContent(content); } catch (e) { fileId = null; }
    }
    if (!fileId) fileId = folder.createFile(rec.id + '.json', content, MimeType.PLAIN_TEXT).getId();
    idx.records[rec.id] = { store: it.store, updatedAt: rec.updatedAt, deleted: !!rec.deleted, fileId: fileId };
    saved.push(rec.id);
  });
  writeIndex_(idx);
  return { ok: true, saved: saved, skipped: skipped };
}

function putImage_(id, data, mime) {
  const idx = readIndex_();
  if (idx.images[id]) return { ok: true, existed: true };
  const blob = Utilities.newBlob(Utilities.base64Decode(data), mime || 'image/jpeg', id + '.jpg');
  const file = sub_('images').createFile(blob);
  idx.images[id] = file.getId();
  writeIndex_(idx);
  return { ok: true };
}

function getImage_(id) {
  const idx = readIndex_();
  const fid = idx.images[id];
  if (!fid) return { ok: false, error: 'ไม่พบรูป' };
  const blob = DriveApp.getFileById(fid).getBlob();
  return { ok: true, data: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() };
}
