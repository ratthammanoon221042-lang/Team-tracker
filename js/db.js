// ฐานข้อมูลในเครื่อง (IndexedDB) — เก็บเทมเพลต รายงาน รูปภาพ
(function () {
  const DB_NAME = 'daily-report-db';
  const VERSION = 1;
  const STORES = ['templates', 'reports', 'images', 'meta'];
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then((v) => { out = v; });
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const listeners = new Set();
  const emit = (store, rec) => listeners.forEach((fn) => { try { fn(store, rec); } catch (e) { console.error(e); } });

  const DB = {
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },

    get: (store, id) => tx(store, 'readonly', (s) => req2p(s.get(id))),
    all: (store) => tx(store, 'readonly', (s) => req2p(s.getAll())),
    keys: (store) => tx(store, 'readonly', (s) => req2p(s.getAllKeys())),

    // บันทึก (ตั้ง updatedAt อัตโนมัติ เว้นแต่ระบุ keepTime)
    async put(store, rec, { keepTime = false, silent = false } = {}) {
      if (store !== 'images' && store !== 'meta' && !keepTime) rec.updatedAt = Date.now();
      await tx(store, 'readwrite', (s) => req2p(s.put(rec)));
      if (!silent) emit(store, rec);
      return rec;
    },
    // ลบแบบเหลือร่องรอย (เพื่อให้ซิงก์การลบไปเครื่องอื่นได้)
    async remove(store, id) {
      const rec = await DB.get(store, id);
      if (!rec) return;
      const tomb = { id, deleted: true, updatedAt: Date.now(), kind: rec.kind };
      await tx(store, 'readwrite', (s) => req2p(s.put(tomb)));
      emit(store, tomb);
    },
    hardDelete: (store, id) => tx(store, 'readwrite', (s) => req2p(s.delete(id))),
    clear: (store) => tx(store, 'readwrite', (s) => req2p(s.clear())),

    async live(store) { return (await DB.all(store)).filter((r) => !r.deleted); },

    async getMeta(key, def = null) { const r = await DB.get('meta', key); return r ? r.value : def; },
    async setMeta(key, value) { await DB.put('meta', { key, value }, { silent: true }); },

    async estimate() {
      try { return await navigator.storage.estimate(); } catch (e) { return null; }
    },
  };

  // ขอให้เบราว์เซอร์เก็บข้อมูลถาวร (ไม่ลบอัตโนมัติเมื่อพื้นที่เต็ม)
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* ignore */ }

  window.DB = DB;
})();
