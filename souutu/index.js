const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')
const launchConfig = require('../.launchrc.json')
const BASE_URL = `http://www.souutu.com/mnmm/`

puppeteer
    .launch(launchConfig)
    .then(async browser => {
        console.log(`浏览器已打开`)
        const page = await browser.newPage()

        const getLinksFromPageUrl = async (url, category) => {
            let cur = 1
            let amount = 1
            let link = ''
            let title = ''
            const imgUrls = []
            while (cur <= amount) {
                const urlWithPage = url.replace('.html', `_${cur}.html`)
                await page.goto(urlWithPage)
                try {
                    await page.waitForSelector('.showtitle')
                } catch (error) {
                    await page.waitFor(3000)
                    await page.goto(urlWithPage)
                    await page.waitForSelector('.showtitle')
                }
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
                // console.log(link)
                cur++
                await page.waitFor(300)
            }
            console.log(`图片数量：${imgUrls.length}`)
            const dir = path.join(__dirname, 'result', category)
            fs.exists(dir, exists => {
                if (!exists) {
                    fs.mkdirSync(dir)
                }
                const filePath = `${dir}/${title}.txt`
                fs.writeFileSync(filePath, imgUrls.join('\n'))
                console.log(`文件写入：${filePath}`)
            })
            return imgUrls
        }

        /**
         * 从分类页面获取所有查看图片页面的 URL
         * @param {String} url 分类页面 URL
         */
        const getPageUrlsFromCategoryPage = async url => {
            let curPage = 1
            let pageAmount = 1
            let title = ``
            const pageUrls = []
            while (curPage <= pageAmount) {
                await page.goto(
                    curPage > 1 ? url + `index_${curPage}.html` : url
                )
                const pageData = await page.evaluate(() => {
                    const btns = document.querySelectorAll('.listpages > *')
                    return {
                        urls: [...document.querySelectorAll('.card-img a')].map(
                            ele => ele.href
                        ),
                        amount: Number(btns[btns.length - 2].textContent),
                        title: document.querySelector(
                            '.indexlisttit a:last-of-type'
                        ).textContent
                    }
                })
                console.log(`${curPage}/${pageData.amount}`)
                // console.log(pageData.urls.join('\n'))
                pageUrls.push(...pageData.urls)
                if (curPage === 1) {
                    pageAmount = pageData.amount
                    title = pageData.title
                }
                curPage++
            }
            console.log(`页面数量：${pageUrls.length}`)
            // const dir = path.join(__dirname, 'result')
            // fs.writeFile(
            //     path.join(__dirname, 'result', '.task.json'),
            //     JSON.stringify({
            //         urls,
            //         pageUrls: []
            //     }),
            //     () => {
            //         console.log(`任务进度保存：分类页面 URL`)
            //     }
            // )
            return { pageUrls, title }
        }

        // fs.exists(path.join(__dirname, 'result'), exists => {
        //     if (exists) {
        //     }
        // })
        // fs.readdir(path.join(__dirname, 'result'), (err, files) => {
        //     if (err) {
        //         console.error(err)
        //     }
        //     files.filter(fileStr => fileStr.indexOf('.txt') !== -1)
        // })
        await page.goto(BASE_URL)

        const urls = await page.evaluate(() =>
            [...document.querySelectorAll('.catcaidanw li a')].map(
                ele => ele.href
            )
        )



        for (const url of urls) {
            console.log(`进入分类页面：${url}`)
            const { pageUrls, title } = await getPageUrlsFromCategoryPage(url)
            for (const pageUrl of pageUrls) {
                console.log(`进入查看图片页面：${pageUrl}`)
                await getLinksFromPageUrl(pageUrl, title)
                await page.waitFor(1000)
            }
        }
    })
    .catch(err => {
        console.error('Error:', err)
    })
