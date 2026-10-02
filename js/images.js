// จัดการรูปภาพ: ย่อขนาด บันทึก หมุน และดึงจากคลาวด์เมื่อไม่มีในเครื่อง
(function () {
  const MAX_SIDE = 1600; // พิกเซลด้านยาวสุด (พอสำหรับพิมพ์ในรายงาน และประหยัดพื้นที่)
  const QUALITY = 0.85;
  const urlCache = new Map();
  const pending = new Map();

  async function decode(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { /* fallback */ }
    }
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('อ่านไฟล์รูปไม่ได้'));
      img.src = URL.createObjectURL(blob);
    });
  }

  function toJpeg(canvas) {
    return new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', QUALITY));
  }

  async function processBlob(blob, rotate = 0) {
    const img = await decode(blob);
    const iw = img.width, ih = img.height;
    const scale = Math.min(1, MAX_SIDE / Math.max(iw, ih));
    const w = Math.round(iw * scale), h = Math.round(ih * scale);
    const swap = rotate % 180 !== 0;
    const c = document.createElement('canvas');
    c.width = swap ? h : w;
    c.height = swap ? w : h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    if (img.close) img.close();
    return { blob: await toJpeg(c), w: c.width, h: c.height };
  }

  const Images = {
    // รับไฟล์จากผู้ใช้ -> คืน id ของรูปที่บันทึกแล้ว
    async add(file) {
      const { blob, w, h } = await processBlob(file);
      const rec = { id: U.uid('img_'), blob, w, h, type: 'image/jpeg', createdAt: Date.now(), uploaded: false };
      await DB.put('images', rec);
      return rec.id;
    },
    async addMany(files, onProgress) {
      const ids = [];
      for (let i = 0; i < files.length; i++) {
        onProgress && onProgress(i, files.length);
        try { ids.push(await Images.add(files[i])); } catch (e) { U.toast('ข้ามไฟล์ ' + files[i].name + ': ' + e.message, 'error'); }
      }
      return ids;
    },
    // หมุนรูป 90 องศา -> สร้างรูปใหม่ (รูปเดิมยังคงอยู่สำหรับรายงานอื่นที่อ้างถึง)
    async rotate(id, deg = 90) {
      const rec = await Images.get(id);
      if (!rec) throw new Error('ไม่พบรูป');
      const { blob, w, h } = await processBlob(rec.blob, deg);
      const n = { id: U.uid('img_'), blob, w, h, type: 'image/jpeg', createdAt: Date.now(), uploaded: false };
      await DB.put('images', n);
      return n.id;
    },
    async get(id) {
      if (!id) return null;
      let rec = await DB.get('images', id);
      if (rec && rec.blob) return rec;
      // ไม่มีในเครื่อง -> ลองดึงจาก Google Drive
      if (window.Sync && Sync.enabled()) {
        if (!pending.has(id)) pending.set(id, Sync.fetchImage(id).finally(() => pending.delete(id)));
        rec = await pending.get(id);
        return rec;
      }
      return null;
    },
    async url(id) {
      if (!id) return null;
      if (urlCache.has(id)) return urlCache.get(id);
      const rec = await Images.get(id);
      if (!rec) return null;
      const u = URL.createObjectURL(rec.blob);
      urlCache.set(id, u);
      return u;
    },
    // คืน map id -> {url, w, h}
    async resolve(ids) {
      const out = {};
      await Promise.all([...new Set(ids.filter(Boolean))].map(async (id) => {
        const rec = await Images.get(id);
        if (rec) out[id] = { url: await Images.url(id), w: rec.w, h: rec.h };
      }));
      return out;
    },
    async bytes(id) {
      const rec = await Images.get(id);
      return rec ? new Uint8Array(await rec.blob.arrayBuffer()) : null;
    },
    // ลบรูปที่ไม่มีรายงาน/หน้าใดอ้างถึงแล้ว
    async collectGarbage() {
      const reports = await DB.live('reports');
      const used = new Set();
      for (const r of reports) Report.imageIds(r).forEach((i) => used.add(i));
      const keys = await DB.keys('images');
      let n = 0;
      for (const k of keys) if (!used.has(k)) { await DB.hardDelete('images', k); n++; }
      return n;
    },
  };

  window.Images = Images;
})();
