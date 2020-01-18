const puppeteer = require('puppeteer-core')
const axios = require('axios')
const BASE_URL = 'https://weibo.com/'
const path = require('path')
const fs = require('fs')
const Ora = require('ora')

let imgPage
let imgUrl
let curTarget
let imgUrls = []
const { account, password } = require('./account.json')

puppeteer
    .launch({
        headless: false,
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
            let watchDog
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

                await page.goto(url)

                const title = await page.title()

                const firstCover = await page.$('.ph_ar_box .photo_pict')
                firstCover.click()

                updateStatus(`查看图片`)

                await page.waitForResponse(
                    res => res.url().indexOf('photo/tag/getphototag') !== 0
                )
                updateStatus(`图片加载完成`)

                await page.waitForSelector(`[node-type="wrapIcon"]`)

                let hasNext = true
                let count = 0
                while (hasNext) {
                    nextImg(++count)
                    await page.evaluate(() => {
                        document.querySelector(
                            `[node-type="wrapIcon"]`
                        ).style.display = 'block'
                    })
                    await page.waitForSelector(`[title="查看原图"]`)
                    await page.evaluate(() => {
                        document.querySelector(`[title="查看原图"]`).click()
                    })
                    updateStatus(`查看原图`)

                    const pageTarget = page.target()
                    curTarget = await browser.waitForTarget(
                        target => target.opener() === pageTarget
                    )

                    imgPage = await curTarget.page()

                    updateStatus(`查看原图页面：${imgPage.url()}`)
                    await imgPage.waitForSelector('.F_album')
                    updateStatus(`原图页面加载完成`)
                    imgUrl = await imgPage.evaluate(() => {
                        const $pic = document.querySelector(`#pic`)
                        if (!$pic) {
                            return ''
                        }
                        return $pic.src
                    })
                    if (imgUrl) {
                        updateStatus(`获取到图片地址：${imgUrl}`)
                        imgUrls.push(imgUrl)
                    } else {
                        updateStatus('该照片不存在或已被删除')
                    }

                    updateStatus(`关闭图片原图页`)
                    await imgPage.close()

                    $preImg = await page.evaluate(() => {
                        window._pptr_pre_img = document.querySelector(
                            `[node-type="img_box"]>img`
                        ).src
                    })

                    updateStatus(`点击下一页`)
                    await page.mouse.move(1000, 400)
                    await page.mouse.click(1000, 400)

                    await page.waitFor(200)
                    await page.mouse.move(820, 800)
                    await page.waitFor(200)

                    if (await page.$(`li.current:last-of-type`)) {
                        hasNext = false
                    }
                }

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
            
            console.log(`开始处理`)
            await crawl()
        } catch (error) {
            console.error(error)
            errScreenshot()
        }
    })
