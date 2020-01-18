const puppeteer = require('puppeteer-core')
const axios = require('axios')
const BASE_URL = 'https://weibo.com/'
const path = require('path')
const fs = require('fs')
const Ora = require('ora')

let imgPage
let imgUrl
let curTarget
let watchDog
const { account, password } = require('./account.json')

puppeteer
    .launch({
        // slowMo: 1000,
        headless: true,
        executablePath:
            'C:/Users/lsy/AppData/Local/Google/Chrome SxS/Application/chrome.exe',
        defaultViewport: {
            width: 1920,
            height: 1080
        },
        userDataDir: path.join('./userDataDir'),
        args: ['--start-maximized']
    })
    .then(async browser => {
        const page = await browser.newPage()
        const errScreenshot = () => {
            fs.existsSync('./log') ||
                fs.mkdir('./log', err => console.error(err))
            const savePath = `./log/webi${Date.now()}.png`
            page.screenshot({
                path: savePath
            })
            console.log(`错误截图保存路径：${path.join(savePath)}`)
        }
        const login = async () => {
            try {
                await page.evaluate(
                    value =>
                        (document.querySelector('#loginname').value = value),
                    account
                )
                console.log(`账号输入完成`)

                await page.evaluate(
                    value =>
                        (document.querySelector(
                            '.password [name="password"]'
                        ).value = value),
                    password
                )
                console.log(`密码输入完成`)

                watchDog = page.waitForNavigation({
                    waitUntil: 'load'
                })
                console.log(`点击登录`)
                await page.click(
                    '#pl_login_form > div > div:nth-child(3) > div.info_list.login_btn > a'
                )
                await watchDog
                console.log(`登录完成`)
            } catch (error) {
                console.error(`登录错误`, error)
                errScreenshot()
            }
        }
        const crawl = async () => {
            const processPhotos = async url => {
                const spinner = new Ora({
                    discardStdin: false,
                    prefixText: `相册：${url}`,
                    text: `开始获取`
                })
                const nextImg = count => {
                    spinner.prefixText = `第 ${count} 张图片：`
                }
                const updateStatus = msg => {
                    spinner.text = msg
                }
                const success = () => {
                    spinner.prefixText = ``
                    spinner.text = `链接获取完成`
                    spinner.succeed()
                }

                spinner.start()

                await page.goto(url, {
                    waitUntil: 'load'
                })

                const title = await page.title()

                let hasMore = true
                while (hasMore) {
                    watchDog = page
                        .waitForResponse(
                            res => res.url().indexOf('album/loading') !== -1,
                            {
                                timeout: 2000
                            }
                        )
                        .catch(() => {
                            hasMore = false
                        })
                    await page.evaluate(() => {
                        window.scrollBy(0, document.body.clientHeight)
                    })
                    await watchDog
                    await page.waitFor(500)
                }

                let imgUrls = await page.evaluate(() => {
                    return Array.prototype.map.call(
                        document.querySelectorAll(
                            '.ph_ar_box[action-type="widget_photoview"]'
                        ),
                        ele => {
                            const dataStr = ele.getAttribute('action-data')
                            const mid = /mid=(.+?)&/g.exec(dataStr)[1]
                            const pid = /pid=(.+?)&/g.exec(dataStr)[1]
                            return `https://photo.weibo.com/3652509343/wbphotos/large/mid/${mid}/pid/${pid}`
                        }
                    )
                })

                const len = imgUrls.length
                imgUrls = Array.from(new Set(imgUrls))
                const imgLen = imgUrls.length
                const filePath = path.join(__dirname, 'img', title)
                fs.writeFileSync(filePath, imgUrls.join(`\n`))

                success()
                console.log(`图片数量：${imgUrls.length}`)
                console.log(`去重后的图片数量：${imgUrls.length}`)
                console.log(`写入文件：${filePath}`)
            }

            function readSyncByfs(tips) {
                tips = tips || '> '
                process.stdout.write(tips)
                process.stdin.pause()
                const buf = Buffer.allocUnsafe(10000)
                const response = fs.readSync(process.stdin.fd, buf, 0, 10000, 0)
                process.stdin.end()
                return buf.toString('utf8', 0, response).trim()
            }

            let url
            if (process.env.NODE_ENV === 'development') {
                url = process.env.URL
                await processPhotos(url)
                return
            }
            while (true) {
                url = readSyncByfs(`相册地址：`)
                if (!url) {
                    break
                }
                await processPhotos(url)
            }
        }

        try {
            console.log(`进入首页`)
            let time = process.hrtime()
            await page.goto(BASE_URL, {
                waitUntil: 'networkidle0'
            })

            await page.waitForFunction(
                () =>
                    document.getElementById('loginname') ||
                    document.querySelector('.headpic')
            )

            let isLogin = (await page.url().indexOf(`home`)) !== -1
            console.log(`是否登录`, isLogin)
            if (!isLogin) {
                // 加载完成之后用户名和密码框还会变，登录失败可以尝试增大这个时间
                await page.waitFor(1000)
                await login()
            }
            const diff = process.hrtime(time)
            console.log(`加载、登录用时： ${diff[0]}秒`)

            console.log(`开始`)
            await crawl()
        } catch (error) {
            console.error(error)
            errScreenshot()
        }
    })
