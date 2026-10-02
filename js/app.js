// ตัวจัดการหน้า (router) และเริ่มต้นระบบ
(function () {
  const { h } = U;
  const app = document.getElementById('app');
  let cleanup = null;

  const routes = [
    [/^$/, 'home', () => Pages.home],
    [/^new$/, 'new', () => Pages.newReport],
    [/^report\/([\w-]+)$/, 'new', () => Pages.report],
    [/^reports$/, 'reports', () => Pages.reports],
    [/^templates(?:\/(\w+))?$/, 'templates', () => Pages.templates],
    [/^pdf$/, 'pdf', () => Pages.pdf],
    [/^settings$/, 'settings', () => Pages.settings],
  ];

  async function route() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    if (cleanup) { try { await cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    let found = routes.find(([re]) => re.test(path));
    if (!found) found = routes[0];
    const [re, navKey, page] = found;
    const m = path.match(re) || [];
    U.$$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === navKey));
    app.innerHTML = '';
    window.scrollTo(0, 0);
    try {
      cleanup = (await page().render(app, m.slice(1), query)) || null;
    } catch (e) {
      console.error(e);
      app.appendChild(h('div.card', h('h2', 'เกิดข้อผิดพลาด'), h('p', e.message)));
    }
  }

  // ปุ่มสถานะซิงก์
  const pill = document.getElementById('sync-pill');
  Sync.onState((s) => {
    const label = { off: 'ยังไม่ซิงก์ (เก็บในเครื่อง)', idle: 'ซิงก์แล้ว', syncing: 'กำลังซิงก์…', error: 'ซิงก์ไม่สำเร็จ', offline: 'ออฟไลน์' }[s.status] || s.status;
    pill.className = 'sync-pill ' + s.status;
    pill.innerHTML = '';
    pill.append(h('span.dot'), s.status === 'syncing' && s.detail ? s.detail : label);
    pill.title = s.status === 'error' ? s.error : s.lastSync ? 'ซิงก์ล่าสุด ' + U.thaiDateTime(s.lastSync) : 'กดเพื่อตั้งค่าการซิงก์';
  });
  pill.addEventListener('click', () => {
    if (!Sync.enabled()) location.hash = '#/settings';
    else Sync.run();
  });

  // ตั้งค่าซิงก์จากลิงก์ (สแกน QR จากเครื่องอื่น): #/settings?sync=<base64>
  function importSyncFromLink() {
    const m = location.hash.match(/[?&]sync=([^&]+)/);
    if (!m) return;
    try {
      const conf = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      if (conf.url && conf.key) {
        Sync.save({ url: conf.url, key: conf.key });
        U.toast('ตั้งค่าการซิงก์จากลิงก์เรียบร้อย กำลังดึงข้อมูล…', 'ok');
        history.replaceState(null, '', '#/settings');
        Sync.run();
      }
    } catch (e) { U.toast('ลิงก์ตั้งค่าไม่ถูกต้อง', 'error'); }
  }

  async function start() {
    await Defaults.ensure();
    importSyncFromLink();
    window.addEventListener('hashchange', route);
    await route();
    if (Sync.enabled()) Sync.run();
  }
  start();
})();
