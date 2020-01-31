const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')
const launchConfig = require('../.launchrc.json')

puppeteer
    .launch(launchConfig)
    .then(async browser => {
        console.log(`浏览器已打开`)
        const page = await browser.newPage()
        const getLinksFromPageUrl = async url => {
            let cur = 1
            let amount = 1
            let link = ''
            let title = ''
            const imgUrls = []
            while (cur <= amount) {
                const urlWithPage = url.replace('.html', `_${cur}.html`)
                await page.goto(urlWithPage)
                await page.waitForSelector('.showtitle')
                const pageData = await page.evaluate(() => {
                    const editw = document.querySelector('.editw')
                    const cur = Number(/\((\d+)\//g.exec(editw.textContent)[1])
                    const amount = Number(
                        /\/(\d+)\)/g.exec(editw.textContent)[1]
                    )

                    return {
                        cur,
                        amount,
                        link: document.querySelector('.morew a').href,
                        title: document.querySelector('.showtitle h2')
                            .textContent
                    }
                })
                cur = pageData.cur
                amount = pageData.amount
                link = pageData.link
                title = pageData.title
                imgUrls.push(link)
                console.log(`${title}(${cur}/${amount})`)
                console.log(link)
                cur++
            }
            console.log(`图片数量：${imgUrls.length}`)
            const dir = path.join(__dirname, 'result')
            fs.exists(dir, exists => {
                if (!exists) {
                    fs.mkdirSync(dir)
                }
                const filePath = `${dir}/${title}.txt`
                fs.writeFileSync(filePath, imgUrls.join('\n'))
                console.log(`文件写入：${filePath}`)
            })
        }

        getLinksFromPageUrl(`http://www.souutu.com/mnmm/mote/12384.html`)
    })
    .catch(err => {
        console.error('Error:', err)
    })
