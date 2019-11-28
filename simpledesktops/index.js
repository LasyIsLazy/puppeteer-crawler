const puppeteer = require('puppeteer')
const BASE_URL = 'http://simpledesktops.com/browse/'
puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Users\\lsy\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe',
    defaultViewport: {
        width: 1920,
        height: 1080,
    },
    args: ['--start-maximized'],
}).then(async (browser) => {
    const page = await browser.newPage()
    page.goto(`${BASE_URL}1`)
    console.log('加载中...')
    console.time('加载用时')
    page.once('load', async () => {
        console.log(`加载完成`)
        console.timeEnd('加载用时')
        const imgUrls = await page.evaluate(() => {
            const $imgs = document.querySelectorAll('.edge img')
            return $imgs && $imgs.length ? [...$imgs].map($img => $img.src.replace(/\.\d+x\d+.+$/g, '')) : []
        })
        console.log(imgUrls)
    })
})