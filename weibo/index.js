const puppeteer = require('puppeteer-core')
const axios = require('axios')
const BASE_URL = 'https://weibo.com/'
const path = require('path')
const fs = require('fs')
const launchConfig = require('../.launchrc.json')
const { account, password } = require('./account.json')

let imgPage
let imgUrl
let curTarget
let imgUrls = []
let $preImg


puppeteer.launch(launchConfig).then(async (browser) => {

    const page = await browser.newPage()

    // const cookies = JSON.parse(fs.readFileSync(path.join(__dirname, 'cookies')).toString())
    // console.log(cookies)
    // await page.setCookie(...cookies)

    console.log(`进入首页`)
    await page.goto(BASE_URL)

    await page.waitForNavigation({
        waitUntil: 'load'
    })

    await page.waitForSelector('.login_innerwrap #loginname')
    await page.click('.login_innerwrap #loginname')
    await page.type('.login_innerwrap #loginname', account)
    console.log(`账号输入完成`)


    await page.waitForSelector('#pl_login_form > div > div:nth-child(3) > div.info_list.password > div > input')
    await page.click('#pl_login_form > div > div:nth-child(3) > div.info_list.password > div > input')
    await page.type('#pl_login_form > div > div:nth-child(3) > div.info_list.password > div > input', password)
    console.log(`密码输入完成`)

    await page.waitForSelector('#pl_login_form > div > div:nth-child(3) > div.info_list.login_btn > a')
    await page.click('#pl_login_form > div > div:nth-child(3) > div.info_list.login_btn > a')
    console.log(`点击登录`)

    await page.waitForNavigation({
        waitUntil: 'load'
    })
    console.log(`跳转完成`)

    const processPhotos = async (url) => {
        await page.goto(url)

        const title = await page.title()

        const firstCover = await page.$('.ph_ar_box .photo_pict')
        firstCover.click()

        console.log(`查看图片`)

        await page.waitForResponse(res => res.url().indexOf('photo/tag/getphototag') !== 0)
        console.log(`图片加载完成`)

        await page.waitForSelector(`[node-type="wrapIcon"]`)

        let hasNext = true
        let count = 0
        while (hasNext) {
            console.log(`处理第 ${++count} 页`)
            await page.evaluate(() => {
                document.querySelector(`[node-type="wrapIcon"]`).style.display = 'block'
            })
            await page.waitForSelector(`[title="查看原图"]`)
            await page.evaluate(() => {
                document.querySelector(`[title="查看原图"]`).click()
            })
            console.log(`查看原图`)

            const pageTarget = page.target()
            curTarget = await browser.waitForTarget(target => target.opener() === pageTarget)

            imgPage = await curTarget.page()

            console.log(`查看原图页面：${imgPage.url()}`)
            await imgPage.waitForSelector('.F_album')
            console.log(`原图页面加载完成`)
            imgUrl = await imgPage.evaluate(() => {
                const $pic = document.querySelector(`#pic`)
                if (!$pic) {
                    return ''
                }
                return $pic.src
            })
            if (imgUrl) {
                console.log(`获取到图片地址：${imgUrl}`)
                imgUrls.push(imgUrl)
            } else {
                console.log('该照片不存在或已被删除')
            }

            console.log(`关闭图片原图页`)
            await imgPage.close()

            $preImg = await page.evaluate(() => document.querySelector(`li.current`))

            console.log(`点击下一页`)
            await page.mouse.move(1000, 400)
            await Promise.all([
                page.waitForFunction(($preImg) => document.querySelector(`li.current`) !== $preImg, $preImg),
                page.mouse.click(1000, 400)
            ])

            if (await page.$(`li.current:last-of-type`)) {
                hasNext = false
            }
        }

        console.log(`图片数量：${imgUrls.length}`)
        imgUrls = Array.from(new Set(imgUrls))
        console.log(`去重后的图片数量：${imgUrls.length}`)
        const path = path.join(__dirname, 'img', title)
        fs.writeFileSync(path, imgUrls.join(`\n`))
        console.log(`写入文件：${path}`)
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
        try {
            
            await processPhotos(url)
        } catch (error) {
            console.error(error)
            page.screenshot({
                path: path.join(__dirname, 'errLog', Date.now)
            })
        }
    }

})
