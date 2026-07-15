const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/snap/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--use-gl=swiftshader','--window-size=1280,720','--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:3000/watch?v=dQw4w9WgXcQ', { waitUntil: 'domcontentloaded' }).catch(()=>{});
  await new Promise(r=>setTimeout(r, 10000));
  // screenshot initial page
  await page.screenshot({ path: '/tmp/kv-watch-initial.png', fullPage: false });

  // find and click the Download button in controls
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const dl = btns.find(b => /download/i.test(b.getAttribute('title')||b.textContent||''));
    if (dl) dl.click();
  });
  await new Promise(r=>setTimeout(r, 2000));
  // wait for formats to load
  await new Promise(r=>setTimeout(r, 5000));
  // screenshot with download sheet open
  await page.screenshot({ path: '/tmp/kv-watch-dlsheet.png', fullPage: false });
  console.log('screenshots captured');
  await browser.close();
})();
