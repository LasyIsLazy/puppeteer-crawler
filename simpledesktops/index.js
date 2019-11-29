const puppeteer = require('puppeteer-core')
const axios = require('axios')
const BASE_URL = 'http://simpledesktops.com/browse/'
const path = require('path')
const fs = require('fs')

let loadingInterval
function loading() {
    loadingInterval = setInterval(() => {
        process.stdout.write('.')
    }, 1000)
}
function unloading() {
    clearInterval(loadingInterval)
}

puppeteer
    .launch({
        headless: true,
        executablePath: 'D:\\programs\\chrome-win\\chrome.exe',
        defaultViewport: {
            width: 1920,
            height: 1080
        },
        args: ['--start-maximized']
    })
    .then(async browser => {
        process.stdout.write(`浏览器已打开\n`)
        const page = await browser.newPage()
        process.stdout.write(`请求页面`)
        console.time('加载用时')
        loading()
        await page.goto(`${BASE_URL}1`, {
            timeout: 0
        })
        // process.stdout.write(`\n加载页面`)
        // page.once('load', async () => {
        unloading()
        process.stdout.write(`加载完成`)
        console.timeEnd('加载用时')
        const imgUrls = await page.evaluate(() => {
            const $imgs = document.querySelectorAll('.edge img')
            return $imgs && $imgs.length
                ? [...$imgs].map($img => $img.src.replace(/\.\d+x\d+.+$/g, ''))
                : []
        })
        console.log(`本页图片数量：${imgUrls.length}`)
        console.log(imgUrls)
        const imgUrl = imgUrls[0]
        const name = imgUrl.replace(/.+\//g, '')
        const { headers, data } = await axios.get(imgUrl, {
            responseType: 'stream'
        })
        const contentType = headers['content-type']
        const [fileType, imgType] = contentType.split('/')
        console.log(fileType, imgType)
        const imgPath = path.join(__dirname, 'result', name)
        data.pipe(fs.createWriteStream(imgPath))
        await browser.close()
        // })
    })
    .catch(err => {
        unloading()
        console.error('Error:', err)
    })
