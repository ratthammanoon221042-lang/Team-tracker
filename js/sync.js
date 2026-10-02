// ซิงก์ข้อมูลกับ Google Drive ผ่าน Google Apps Script (ใช้ได้หลายเครื่อง)
(function () {
  const CFG_KEY = 'dr-sync-config';
  const listeners = new Set();
  let state = { status: 'off', lastSync: Number(localStorage.getItem('dr-last-sync') || 0), error: '' };
  let running = null;
  let again = false;

  function cfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e) { return null; }
  }
  function setState(s) {
    state = Object.assign({}, state, s);
    listeners.forEach((fn) => fn(state));
  }

  async function call(action, payload = {}, conf = cfg()) {
    if (!conf || !conf.url) throw new Error('ยังไม่ได้ตั้งค่าการซิงก์');
    const res = await fetch(conf.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, key: conf.key }, payload)),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error('เชื่อมต่อไม่ได้ (HTTP ' + res.status + ')');
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('ได้รับข้อมูลไม่ถูกต้อง — ตรวจสอบว่า Deploy เป็น Web app และให้สิทธิ์ "Anyone"'); }
    if (!j.ok) throw new Error(j.error || 'เกิดข้อผิดพลาด');
    return j;
  }

  const Sync = {
    onState: (fn) => { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    state: () => state,
    config: cfg,
    enabled: () => !!(cfg() && cfg().url && cfg().enabled !== false),
    async test(url, key) { return call('ping', {}, { url, key }); },
    save(conf) {
      localStorage.setItem(CFG_KEY, JSON.stringify(conf));
      setState({ status: conf && conf.url ? 'idle' : 'off', error: '' });
    },
    disable() { localStorage.removeItem(CFG_KEY); setState({ status: 'off', error: '' }); },

    async fetchImage(id) {
      try {
        const j = await call('getImage', { id });
        const rec = { id, blob: U.base64ToBlob(j.data, j.mime || 'image/jpeg'), type: j.mime || 'image/jpeg', createdAt: Date.now(), uploaded: true };
        const dims = await new Promise((res) => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([1600, 900]); im.src = URL.createObjectURL(rec.blob); });
        rec.w = dims[0]; rec.h = dims[1];
        await DB.put('images', rec, { silent: true });
        return rec;
      } catch (e) {
        console.warn('fetchImage', id, e);
        return null;
      }
    },

    // ซิงก์ทั้งหมด: อัปโหลดของใหม่กว่าในเครื่อง / ดาวน์โหลดของใหม่กว่าบนคลาวด์
    async run() {
      if (!Sync.enabled()) { setState({ status: 'off' }); return; }
      if (!navigator.onLine) { setState({ status: 'offline' }); return; }
      if (running) { again = true; return running; }
      running = (async () => {
        setState({ status: 'syncing', error: '' });
        try {
          const remote = await call('list');
          const remoteImgs = new Set(remote.images || []);
          const changedStores = new Set();
          for (const store of ['templates', 'reports']) {
            const local = await DB.all(store);
            const localMap = new Map(local.map((r) => [r.id, r]));
            const up = [];
            for (const r of local) {
              const rr = remote.records[r.id];
              if ((r.updatedAt || 0) <= 1) continue; // ค่าเริ่มต้นที่ยังไม่เคยแก้
              if (!rr || rr.updatedAt < r.updatedAt) up.push(r);
            }
            const down = Object.entries(remote.records)
              .filter(([id, rr]) => rr.store === store && (!localMap.has(id) || (localMap.get(id).updatedAt || 0) < rr.updatedAt))
              .map(([id]) => id);
            // อัปโหลดรูปที่รายงานใช้ (ทุกรูปที่ยังไม่มีบนคลาวด์) ก่อนข้อมูลรายงาน
            if (store === 'reports') {
              const need = new Set();
              local.filter((r) => !r.deleted).forEach((r) => Report.imageIds(r).forEach((id) => { if (!remoteImgs.has(id)) need.add(id); }));
              let k = 0;
              for (const id of need) {
                k++;
                setState({ status: 'syncing', detail: `อัปโหลดรูป ${k}/${need.size}` });
                const rec = await DB.get('images', id);
                if (!rec || !rec.blob) continue;
                await call('putImage', { id, data: await U.blobToBase64(rec.blob), mime: rec.type || 'image/jpeg' });
                rec.uploaded = true;
                await DB.put('images', rec, { silent: true });
                remoteImgs.add(id);
              }
            }
            for (let i = 0; i < up.length; i += 10) {
              setState({ status: 'syncing', detail: `อัปโหลดข้อมูล ${Math.min(i + 10, up.length)}/${up.length}` });
              await call('putRecords', { items: up.slice(i, i + 10).map((rec) => ({ store, rec })) });
            }
            for (let i = 0; i < down.length; i += 15) {
              setState({ status: 'syncing', detail: `ดาวน์โหลดข้อมูล ${Math.min(i + 15, down.length)}/${down.length}` });
              const j = await call('getRecords', { ids: down.slice(i, i + 15) });
              for (const it of j.items) {
                const cur = await DB.get(store, it.rec.id);
                if (cur && (cur.updatedAt || 0) >= it.rec.updatedAt) continue;
                await DB.put(store, it.rec, { keepTime: true, silent: true });
                changedStores.add(store);
              }
            }
          }
          const now = Date.now();
          localStorage.setItem('dr-last-sync', String(now));
          setState({ status: 'idle', lastSync: now, detail: '' });
          if (changedStores.size) window.dispatchEvent(new CustomEvent('remote-update', { detail: [...changedStores] }));
        } catch (e) {
          console.error(e);
          setState({ status: 'error', error: e.message, detail: '' });
        }
      })();
      try { await running; } finally {
        running = null;
        if (again) { again = false; Sync.run(); }
      }
    },
  };

  const schedule = U.debounce(() => Sync.run(), 4000);
  Sync.schedule = schedule;
  DB.onChange((store) => { if ((store === 'templates' || store === 'reports') && Sync.enabled()) schedule(); });
  window.addEventListener('online', () => Sync.run());
  window.addEventListener('focus', () => { if (Date.now() - state.lastSync > 60000) Sync.run(); });
  setInterval(() => { if (document.visibilityState === 'visible') Sync.run(); }, 5 * 60 * 1000);
  if (Sync.enabled()) state.status = 'idle';

  window.Sync = Sync;
})();
