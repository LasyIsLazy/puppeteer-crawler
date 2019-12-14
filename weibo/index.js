const puppeteer = require('puppeteer-core')
const axios = require('axios')
const BASE_URL = 'https://weibo.com/'
const path = require('path')
const fs = require('fs')
const Ora = require('ora')
const launchConfig = require('../.launchrc.json')
const { account, password } = require('./account.json')

let imgPage
let imgUrl
let curTarget
let imgUrls = []
let $preImg
let waitForLoad


puppeteer.launch(launchConfig).then(async (browser) => {

    const page = await browser.newPage()

    // const cookies = JSON.parse(fs.readFileSync(path.join(__dirname, 'cookies')).toString())
    // console.log(cookies)
    // await page.setCookie(...cookies)

    console.log(`进入首页`)
    waitForLoad = page.waitForNavigation({
        waitUntil: 'load'
    })

    await page.goto(BASE_URL)
    await waitForLoad


    await page.waitForSelector('.login_innerwrap #loginname')
    await page.click('.login_innerwrap #loginname')
    await page.type('.login_innerwrap #loginname', account)
    console.log(`账号输入完成`)


    await page.waitForSelector('#pl_login_form > div > div:nth-child(3) > div.info_list.password > div > input')
    await page.click('#pl_login_form > div > div:nth-child(3) > div.info_list.password > div > input')
    await page.type('#pl_login_form > div > div:nth-child(3) > div.info_list.password > div > input', password)
    console.log(`密码输入完成`)

    await page.waitForSelector('#pl_login_form > div > div:nth-child(3) > div.info_list.login_btn > a')
    waitForLoad = page.waitForNavigation({
        waitUntil: 'load'
    })
    await page.click('#pl_login_form > div > div:nth-child(3) > div.info_list.login_btn > a')
    console.log(`点击登录`)

    await waitForLoad
    console.log(`跳转完成`)

    const processPhotos = async (url) => {
        const spinner = new Ora({
            discardStdin: false,
            prefixText: `相册：${url}`,
            text: `开始获取`
        });
        const nextImg = (count) => {
            spinner.prefixText = `第 ${count} 张图片：`
        }
        const updateStatus = (msg) => {
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

        await page.waitForResponse(res => res.url().indexOf('photo/tag/getphototag') !== 0)
        updateStatus(`图片加载完成`)

        await page.waitForSelector(`[node-type="wrapIcon"]`)

        let hasNext = true
        let count = 0
        while (hasNext) {
            nextImg(++count)
            await page.evaluate(() => {
                document.querySelector(`[node-type="wrapIcon"]`).style.display = 'block'
            })
            await page.waitForSelector(`[title="查看原图"]`)
            await page.evaluate(() => {
                document.querySelector(`[title="查看原图"]`).click()
            })
            updateStatus(`查看原图`)

            const pageTarget = page.target()
            curTarget = await browser.waitForTarget(target => target.opener() === pageTarget)

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

            $preImg = await page.evaluate(() => { window._pptr_pre_img = document.querySelector(`[node-type="img_box"]>img`).src })

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

})
