const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')
const launchConfig = require('../.launchrc.json')
const BASE_URL = `http://www.souutu.com/mnmm/`
const TASK_PATH = path.join(__dirname, 'result', '.task.json')
let taskInfomation = {
    categoryUrls: [],
    finishedCategory: [],
    finishedPageUrls: []
}

function saveTask() {
    fs.writeFile(TASK_PATH, JSON.stringify(taskInfomation), () => {
        console.log(`任务进度保存`)
    })
}
function start() {
    return puppeteer
        .launch(launchConfig)
        .then(async browser => {
            console.log(`浏览器已打开`)
            const page = await browser.newPage()
            await page.setCacheEnabled(false)

            const getLinksFromPageUrl = async (url, category) => {
                let cur = 1
                let amount = 1
                let link = ''
                let pageTitle = ''
                const imgUrls = []
                while (cur <= amount) {
                    const urlWithPage = url.replace('.html', `_${cur}.html`)
                    await page.goto(urlWithPage, {
                        waitUntil: 'domcontentloaded'
                    })
                    const pageData = await page
                        .evaluate(() => {
                            const editw = document.querySelector('.editw')
                            const cur = Number(
                                /\((\d+)\//g.exec(editw.textContent)[1]
                            )
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
                        .catch(err => {
                            browser.close()
                            console.log(`遇到错误，关闭浏览器`)
                            throw new Error(err)
                        })
                    cur = pageData.cur
                    amount = pageData.amount
                    link = pageData.link
                    pageTitle = pageData.title
                    imgUrls.push(link)
                    console.log(`${pageTitle}(${cur}/${amount})`)
                    // console.log(link)
                    cur++
                    await page.waitFor(1000)
                }
                console.log(`图片数量：${imgUrls.length}`)
                const dir = path.join(__dirname, 'result', category)
                fs.exists(dir, exists => {
                    if (!exists) {
                        fs.mkdirSync(dir)
                    }
                    const filePath = `${dir}/${pageTitle.replace(
                        /[<>:"/\\|?*]/g,
                        ''
                    )}.txt`
                    fs.writeFileSync(filePath, imgUrls.join('\n'))
                    console.log(`文件写入：${filePath}`)
                })
                return { imgUrls, pageTitle }
            }

            /**
             * 从分类页面获取所有查看图片页面的 URL
             * @param {String} url 分类页面 URL
             */
            const getPageUrlsFromCategoryPage = async url => {
                let curPage = 1
                let pageAmount = 1
                let categoryTitle = ``
                const pageUrls = []
                while (curPage <= pageAmount) {
                    await page.goto(
                        curPage > 1 ? url + `index_${curPage}.html` : url,
                        {
                            waitUntil: 'domcontentloaded'
                        }
                    )
                    const pageData = await page
                        .evaluate(() => {
                            const btns = document.querySelectorAll(
                                '.listpages > *'
                            )
                            return {
                                urls: [
                                    ...document.querySelectorAll('.card-img a')
                                ].map(ele => ele.href),
                                amount: Number(
                                    btns[btns.length - 2].textContent
                                ),
                                title: document.querySelector(
                                    '.indexlisttit a:last-of-type'
                                ).textContent
                            }
                        })
                        .catch(err => {
                            browser.close()
                            console.log(`遇到错误，关闭浏览器`)
                            throw new Error(err)
                        })
                    console.log(`${curPage}/${pageData.amount}`)
                    // console.log(pageData.urls.join('\n'))
                    pageUrls.push(...pageData.urls)
                    if (curPage === 1) {
                        pageAmount = pageData.amount
                        categoryTitle = pageData.title
                    }
                    curPage++
                    await page.waitFor(1000)
                }
                console.log(`页面数量：${pageUrls.length}`)

                return { pageUrls, categoryTitle }
            }

            let categoryUrls = []
            if (fs.existsSync(TASK_PATH)) {
                console.log(`检测到执行过的任务，继续未完成的任务`)
                taskInfomation = JSON.parse(fs.readFileSync(TASK_PATH))
                categoryUrls = taskInfomation.categoryUrls
            } else {
                await page.goto(BASE_URL, {
                    waitUntil: 'domcontentloaded'
                })

                categoryUrls = await page.evaluate(() =>
                    [...document.querySelectorAll('.catcaidanw li a')].map(
                        ele => ele.href
                    )
                )

                taskInfomation.categoryUrls = categoryUrls
                saveTask()
            }

            for (const url of categoryUrls) {
                if (taskInfomation.finishedCategory.indexOf(url) !== -1) {
                    console.log(`跳过已执行任务：分类页面：${url}`)
                    continue
                }
                console.log(`进入分类页面：${url}`)
                const {
                    pageUrls,
                    categoryTitle
                } = await getPageUrlsFromCategoryPage(url)
                for (const pageUrl of pageUrls) {
                    if (
                        taskInfomation.finishedPageUrls.indexOf(pageUrl) !== -1
                    ) {
                        console.log(`跳过已执行任务：查看图片页面：${pageUrl}`)
                        continue
                    }
                    console.log(`进入查看图片页面：${pageUrl}`)
                    const { pageTitle } = await getLinksFromPageUrl(
                        pageUrl,
                        categoryTitle
                    )
                    taskInfomation.finishedPageUrls.push(pageUrl)
                    console.log(`查看图片页面 ${pageTitle} 已完成`)
                    saveTask()
                    await page.waitFor(1000)
                }
                taskInfomation.finishedCategory.push(url)
                // taskInfomation.finishedPageUrls = []
                saveTask()
                console.log(`分类 ${categoryTitle} 已完成`)
            }
            console.log(`已完成`)
        })
        .catch(err => {
            console.error('Error:', err)
            console.log(`5 分钟后重试`)
            setTimeout(() => start(), 5 * 60 * 1000)
        })
}

start()
