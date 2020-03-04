const puppeteer = require('puppeteer-core')
const BASE_URL = 'https://weibo.com/'
const path = require('path')
const fs = require('fs')
const Ora = require('ora')

let watchDog
const { account, password } = require('./account.json')

puppeteer
    .launch({
        // slowMo: 1000,
        headless: true,
        executablePath:
            'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        defaultViewport: {
            width: 1920,
            height: 1080
        },
        args: ['--start-maximized']
    })
    .then(async browser => {
        console.log(`浏览器已启动`)
        const page = await browser.newPage()
        console.log(`打开新页面`)
        const errScreenshot = () => {
            fs.existsSync('./log') ||
                fs.mkdir('./log', err => console.error(err))
            const savePath = `./log/webi${Date.now()}.png`
            page.screenshot({
                path: savePath
            })
            console.log(`错误截图保存路径：${path.join(savePath)}`)
        }
        /**
         * 登陆
         */
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
                await page.waitFor(1000)

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

        const saveCookie = async () => {
            const cookies = await page.cookies()
            fs.writeFileSync(
                path.join(__dirname, 'cookie'),
                JSON.stringify(cookies)
            )
            console.log('cookie 保存完成')
        }

        const loadCookie = async () => {
            const cookiePath = path.join(__dirname, 'cookie')
            if (!fs.existsSync(cookiePath)) {
                return
            }
            const cookies = JSON.parse(fs.readFileSync(cookiePath))
            await page.setCookie(...cookies)
            console.log('cookie 设置完成')
        }

        /**
         * 爬取图片
         */
        const crawl = async () => {
            /**
             * 获取图片
             * @param {String} url 相册 URL
             */
            const processPhotos = async url => {
                const spinner = new Ora({
                    discardStdin: false,
                    prefixText: `相册：${url}`,
                    text: `开始获取`
                })
                const success = () => {
                    spinner.prefixText = ``
                    spinner.text = `链接获取完成`
                    spinner.succeed()
                }
                const status = text => {
                    spinner.text = text
                }

                spinner.start()

                status('相册加载中')
                await page.goto(url, {
                    waitUntil: 'load'
                })

                await page.waitFor(2000)

                const username = await page.evaluate(
                    () => document.querySelector('.username').textContent
                )

                let hasMore = true
                let pageCount = 1
                while (hasMore) {
                    status(`第${pageCount}页图片加载中`)
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
                        const eles = document.querySelectorAll('.photo_pict')
                        eles[eles.length - 1].scrollIntoView()
                    })
                    await watchDog
                    status(`第${pageCount++}页图片加载完成`)
                    await page.waitFor(500)
                }

                /** 图片原图页面地址 */
                let imgPageUrls = await page.evaluate(() => {
                    return Array.prototype.map.call(
                        document.querySelectorAll(
                            '.ph_ar_box[action-type="widget_photoview"]'
                        ),
                        ele => {
                            const dataStr = ele.getAttribute('action-data')
                            const uid = /uid=(.+?)&/g.exec(dataStr)[1]
                            const mid = /mid=(.+?)&/g.exec(dataStr)[1]
                            const pid = /pid=(.+?)&/g.exec(dataStr)[1]
                            return `https://photo.weibo.com/${uid}/wbphotos/large/mid/${mid}/pid/${pid}`
                        }
                    )
                })

                imgPageUrls = Array.from(new Set(imgPageUrls))
                status(`图片原图页面地址获取完成`)

                /** 图片 */
                let imgUrls = []
                const imgPage = await browser.newPage()
                for (let index = 0; index < imgPageUrls.length; index++) {
                    status(`获取第${index + 1}/${imgPageUrls.length}张原图`)
                    const imgPageUrl = imgPageUrls[index]
                    await imgPage.goto(imgPageUrl, {
                        waitUntil: 'load'
                    })
                    try {
                        const src = await imgPage.evaluate(
                            () => document.getElementById('pic').src
                        )
                        imgUrls.push(src)
                        status(
                            `获取第${index + 1}/${imgPageUrls.length}张原图完成`
                        )
                    } catch (error) {
                        status(
                            `获取第${index + 1}/${
                                imgPageUrls.length
                            }张原图失败，URL：${imgPageUrl}`
                        )
                    }
                }
                const filePath = path.join(__dirname, 'img', username + '.txt')
                fs.writeFileSync(filePath, imgUrls.join(`\n`))

                success()
                console.log(`图片数量：${imgUrls.length}`)
                console.log(`去重后的图片数量：${imgUrls.length}`)
                console.log(`写入文件：${filePath}`)
            }

            /**
             * 获取命令行输入
             * @param {String} tips 提示
             */
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
            let loop = true
            while (loop) {
                url = readSyncByfs(`相册地址：`)
                if (!url) {
                    loop = false
                }
                await processPhotos(url)
            }
        }

        try {
            loadCookie()
        } catch (error) {
            console.log('加载 cookie 失败，跳过')
        }
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

        let isLogin = (await page.url().indexOf(`/u/`)) !== -1
        console.log(`是否登录`, isLogin)
        if (!isLogin) {
            // 加载完成之后用户名和密码框还会变，登录失败可以尝试增大这个时间
            await page.waitFor(1000)
            await login()
        }
        const diff = process.hrtime(time)
        console.log(`加载、登录用时： ${diff[0]}秒`)

        saveCookie()

        console.log(`开始`)
        try {
            await crawl()
        } catch (error) {
            console.error(error)
            errScreenshot()
        }
    })
