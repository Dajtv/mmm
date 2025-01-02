const { spawn, execSync } = require('child_process');
const CDP = require('chrome-remote-interface');
const { randomUUID } = require('crypto');
const { tmpdir } = require('os');
const { sep } = require('path');
const { rmSync, writeFileSync } = require('fs');
const { createServer, connect } = require('net');
const { executablePath } = require('puppeteer');
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function deleteFolder(path) {
  rmSync(path, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 500
  });
}
// https://github.com/puppeteer/puppeteer/blob/c75dbf4f36c90720e498f27fb51c437f455addeb/packages/browsers/src/launch.ts#L428
function pidExists(pid) {
  try {
    return process.kill(pid, 0);
  } catch (exception) {
    return false;
  }
}
// Puppeteer's stringifyFunction
function stringifyFunction(callback) {
  let functionDeclaration = `function(...args) {
    const callback = ${callback};
    const data = callback(...args);
    if (typeof data === 'object') {
      return JSON.stringify(data);
    }
    return data;
  }`;
  try {
    new Function(`(${functionDeclaration})`);
  } catch {
    let prefix = 'function ';
    if (functionDeclaration.startsWith('async ')) {
      prefix = `async ${prefix}`;
      functionDeclaration = functionDeclaration.substring('async '.length);
    }
    functionDeclaration = `${prefix}${functionDeclaration}`;
    try {
      new Function(`(${functionDeclaration})`);
    } catch {
      throw new Error('Passed function cannot be serialized!');
    }
  }
  return functionDeclaration;
}
function getFreePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.listen(0, () => {
      const port = socket.address().port;
      socket.close();
      resolve(port);
    });
    socket.on('error', error => {
      reject(error);
    });
  });
}
function connectPort(port) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    socket.on('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.on('error', error => {
      reject(error);
    });
  });
}
function socketReady(port) {
  return new Promise(resolve => {
    const processTimeout = setTimeout(() => {
      clearInterval(processInterval);
      resolve(false);
    }, 30 * 1000);
    const processInterval = setInterval(() => {
      connectPort(port).then(() => {
        clearTimeout(processTimeout);
        clearInterval(processInterval);
        resolve(true);
      }).catch(error => {
        // Coded by Sussy Baka <3
      });
    }, 0.1 * 1000);
  });
}
function sleep(duration) {
  return new Promise(resolve => setTimeout(resolve, duration * 1000));
}
async function createCdpSession(target) {
  const client = await CDP({
    target: target
  });
  await client.DOM.enable()

  await client.Network.enable();
  await client.Page.enable();
  await client.Page.setLifecycleEventsEnabled({
    enabled: true
  });
  await client.Target.setDiscoverTargets({
    discover: true
  });
  return client;
}

const CHROME_BINARY = "/root/chrome-linux64/chrome";

async function launch(options) {
  const defaultArgs = [
    '--disable-field-trial-config',
    '--disable-background-networking',
    '--enable-features=NetworkService,NetworkServiceInProcess',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-back-forward-cache',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-extensions-with-background-pages',
   // '--disable-component-update',
    //'--no-default-browser-check',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-features=ImprovedCookieControls,LazyFrameLoading,GlobalMediaControls,DestroyProfileOnBrowserClose,MediaRouter,DialMediaRouteProvider,AcceptCHFrame,AutoExpandDetailsElement,CertificateTransparencyComponentUpdater,AvoidUnnecessaryBeforeUnloadCheckSync,Translate,HttpsUpgrades,PaintHolding,SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure',
    '--allow-pre-commit-input',
    //'--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--force-color-profile=srgb',
    '--metrics-recording-only',
    //'--no-first-run',
    '--window-size=1349,773',
    '--password-store=basic',
    '--use-mock-keychain',
    '--no-service-autorun',
    '--export-tagged-pdf',
    '--disable-search-engine-choice-screen',
    '--flag-switches-begin', '--enable-quic', '--enable-features=PostQuantumKyber', '--flag-switches-end',
    '--ignore-certificate-errors',
    '--ignore-ssl-errors',
    '--incognito'
  ];
    options.args = options.args || [];
  options.args.push(...defaultArgs);
  if (options.headless === true) {
    options.args.push('--headless=new');
  }
  const port = await getFreePort();
  const dataDir = tmpdir() + sep + randomUUID().replace(/-/g, '');
  options.args.push('--user-data-dir=' + dataDir);
  options.args.push('--remote-debugging-port=' + port);
  const instanceProcess = spawn(CHROME_BINARY, options.args, {
    detached: process.platform !== 'win32'
  });
  const instanceReady = await socketReady(port);
  const instance = {
    dataDir: dataDir,
    process: instanceProcess,
  };
  if (!instanceReady) {
    return new Session(instance);
  }
  const targets = await CDP.List({
    port: port
  });
  const currentTarget = targets.find(target => target.type === 'page');
  const client = await createCdpSession(currentTarget.webSocketDebuggerUrl);
  // Override user agent for the main page.
  if (options.userAgentOverrideRequest !== undefined) {
    await client.Emulation.setUserAgentOverride(options.userAgentOverrideRequest);
  }
  // User agent of the main page has been overrided, now we will override for other targets.
  client.Target.targetCreated(async target => {
    if (options.userAgentOverrideRequest === undefined) return;
    if (target.targetInfo.targetId === currentTarget.id) return;
    try {
      const { sessionId } = await client.Target.attachToTarget({
        targetId: target.targetInfo.targetId,
        flatten: true
      });
      await client.Emulation.setUserAgentOverride(options.userAgentOverrideRequest, sessionId);
    } catch (exception) {
      // I don't know what to do hehe.
      return;
    }
  });
  instance.client = client;
  const session = new Session(instance);
  await session.prepareSession();
  return session;
}

class Pointer {

  constructor(x, y, client) {
    this.x = x;
    this.y = y;
    this.payload = {
      type: '',
      x: x,
      y: y,
      modifiers: 0,
      timestamp: 0,
      button: 'left',
      buttons: 0,
      clickCount: 0,
      force: 0,
      tangentialPressure: 0,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      deltaX: 0,
      deltaY: 0,
      pointerType: 'mouse'
    };
    /** @type {CDP.Client} */
    this.client = client;
  }
  async down() {
    this.payload.type = 'mousePressed';
    this.payload.clickCount = 1;
    await this.client.Input.dispatchMouseEvent(this.payload);
  }

  async up() {
    this.payload.type = 'mouseReleased';
    this.payload.clickCount = 1;
    await this.client.Input.dispatchMouseEvent(this.payload);
  }

  async move(x, y, steps = 1) {
    this.payload.type = 'mouseMoved';
    this.payload.clickCount = 0;
    for (let index = 1; index <= steps; index++) {
      this.payload.x = this.payload.x + (x - this.payload.x) * (index / steps);
      this.payload.y = this.payload.y + (y - this.payload.y) * (index / steps);
      await this.client.Input.dispatchMouseEvent(this.payload);
    }
  }

}

class Locator {
  constructor(x, y, width, height, session) {
    /** @type {int} */
    this.x = x;
    /** @type {int} */
    this.y = y;
    /** @type {int} */
    this.width = width;
    /** @type {int} */
    this.height = height;
    /** @type {Session} */
    this.session = session;
    /** @type {CDP.Client} */
    this.client = this.session.client;
  }

  async click(point) {
  /*
  const drawClickMarker = async (point) => {
      await this.session.evaluate((x, y) => {
        const marker = document.createElement('div');
        marker.style.position = 'absolute';
        marker.style.left = `${x - 5}px`;
        marker.style.top = `${y - 5}px`;
        marker.style.width = '10px';
        marker.style.height = '10px';
        marker.style.borderRadius = '50%';
        marker.style.backgroundColor = 'red';
        marker.style.zIndex = '9999';
        document.body.appendChild(marker);
      }, (this.x + this.width / 2) /point,(this.y + this.height / 2)+ getRandomInt(-3,3));
    };
    */
    ///await drawClickMarker()
    const pointer = new Pointer((this.x + this.width / 2)/point , (this.y + this.height / 2)+ getRandomInt(-3,3) , this.client);
    /*
    
    */
    await pointer.down();
    await sleep(0.027);
    await pointer.up();
    
  }

  }


class Session {

  constructor(instance) {
    /** @type {string} */
    this.dataDir = instance.dataDir;
    /** @type {ChildProcessWithoutNullStreams} */
    this.process = instance.process;
    /** @type {CDP.Client} */
    this.client = instance.client;
    /** @type {Pointer} */
    this.pointer = new Pointer(1, 1, this.client);
    this.requestHeaders = []; // Initialize an array to store request headers

    const exitListener = code => {
      this.destroyBrowserProcess();
    };
    const signalsListener = signal => {
      this.destroyBrowserProcess();
      process.exit(130);
    };
    process.on('exit', exitListener);
    process.on('SIGINT', signalsListener);
    process.on('SIGTERM', signalsListener);
    process.on('SIGHUP', signalsListener);
  }

  async prepareSession() {
    this.frameId = new RegExp(/(?<=page\/).*/).exec(this.client._ws._url).shift();
    await this.client.Network.enable();
    this.client.Network.requestWillBeSent((params) => {
      this.requestHeaders.push(params.request.headers);
    });
  }

  async goto(url) {
    const response = await this.client.Page.navigate({
      url: url,
      referrerPolicy: 'unsafeUrl'
    });
    if (response.errorText) throw new Error(response.errorText);
  }

  eventReady(event, timeout) {
    return new Promise((resolve, reject) => {
      const processTimeout = setTimeout(() => {
        reject('Timeout exceeded on event: ' + event);
      }, timeout * 1000);
      this.client.Page.lifecycleEvent(pageEvent => {
        if (pageEvent.name !== event) return;
        clearTimeout(processTimeout);
        resolve();
      });
    });
  }

  async evaluate(callback, ...args) {
    const { executionContextId } = await this.client.Page.createIsolatedWorld({
      frameId: this.frameId,
      grantUniveralAccess: true,
      worldName: 'SSBAKAAAAA'
    });
    const { result, exceptionDetails } = await this.client.Runtime.callFunctionOn({
      functionDeclaration: stringifyFunction(callback),
      executionContextId: executionContextId,
      arguments: args.length ? args.map(args => args = {value: args}) : [],
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (exceptionDetails) {
      return null;
    }
    try {
      return JSON.parse(result.value);
    } catch (exception) {
      return result.value;
    }
  }
  async reload() {
    await this.client.Page.reload();
  }

  async getUrl() {
    return await this.evaluate(() => document.location.href);
  }

  async getTitle() {
    return await this.evaluate(() => document.title);
  }

  async getContent() {
    return await this.evaluate(() => document.documentElement.outerHTML);
  }

  async getCookies() {
    const { cookies } = await this.client.Network.getCookies();
    return cookies.map(cookie => cookie.name + '=' + cookie.value).join(';');
  }
  async getRequestHeaders() {
    return this.requestHeaders
  }
  async getFrames() {
    const frames = [];
    const { targetInfos } = await this.client.Target.getTargets();
    for (const targetInfo of targetInfos) {
      if (targetInfo.type === 'iframe') {
        const session = new Session({
          dataDir: this.dataDir,
          process: this.process,
          client: await createCdpSession('ws://' + this.client._ws._originalHostOrSocketPath + '/devtools/page/' + targetInfo.targetId)
        });
        await session.prepareSession();
        frames.push(session);
      }
    }
    return frames;
  }

   async getBoundingBox(selector) {
  const boundingBox = await this.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    };
  }, selector);
  return boundingBox;
}

  locator(x,y,width,height) {
    return new Locator(x,y,width,height, this);
  }


    async captureScreenshot(path) {
    const { data } = await this.client.Page.captureScreenshot();
    const buffer = Buffer.from(data, 'base64');
    writeFileSync(path, buffer);
  }


  async destroyBrowserProcess() {
    if (this.process &&
      this.process.pid &&
      pidExists(this.process.pid)
    ) {
      try {
        if (process.platform === 'win32') {
          try {
            execSync('taskkill /pid ' + this.process.pid + ' /T /F');
          } catch (exception) {
            this.process.kill();
          }
        } else {
          const processGroupId = -this.process.pid;
          try {
            process.kill(processGroupId, 'SIGKILL');
          } catch (exception) {
            this.process.kill('SIGKILL');
          }
        }
        this.process.pid = undefined;
        this.process = undefined;
      } catch (exception) {
        throw new Error(exception);
      }
    }
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.client = undefined;
    }
    this.destroyBrowserProcess();
    deleteFolder(this.dataDir);
  }

}

module.exports = {
  launch,
  sleep
}