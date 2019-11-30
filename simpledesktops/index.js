const puppeteer = require('puppeteer-core')
const axios = require('axios')
const BASE_URL = 'http://simpledesktops.com/browse/'
const path = require('path')
const fs = require('fs')
const launchConfig = require('../.launchrc.json')
const IMG_DIR = path.join(__dirname, 'result')


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
    .launch(launchConfig)
    .then(async browser => {
        console.log(`浏览器已打开`)
        const page = await browser.newPage()
        let pageCount = 1
        let pageImgAmount = 0
        do {
            process.stdout.write(`请求第 ${pageCount} 页`)
            const processTime = process.hrtime()
            loading()
            await page.goto(`${BASE_URL}${pageCount}`, {
                timeout: 0
            })
            unloading()
            const [seconds] = process.hrtime(processTime)
            process.stdout.write(`加载完成：${seconds}s`)
            const imgUrls = await page.evaluate(() => {
                const $imgs = document.querySelectorAll('.edge .desktop img')
                return $imgs && $imgs.length
                    ? [...$imgs].map($img => $img.src.replace(/\.\d+x\d+.+$/g, ''))
                    : []
            })
            pageImgAmount = imgUrls.length
            if (!pageImgAmount) {
                await browser.close()
            }
            process.stdout.write(`\t图片数量：${pageImgAmount}`)
            imgUrls.forEach(async imgUrl => {
                const name = imgUrl.replace(/.+\//g, '')
                const { data } = await axios.get(imgUrl, {
                    responseType: 'stream'
                })
                const imgPath = path.join(IMG_DIR, name)
                fs.exists(IMG_DIR, exists => {
                    if (!exists) {
                        fs.mkdirSync(IMG_DIR)
                    }
                    data.pipe(fs.createWriteStream(imgPath))
                })
            })
            pageCount++
        } while (pageImgAmount > 0)
    })
    .catch(err => {
        unloading()
        console.error('Error:', err)
    })
