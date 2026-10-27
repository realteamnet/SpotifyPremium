// ==UserScript==
// @name         Spotify Premium (Hermit)
// @namespace    https://github.com/realteamnet/SpotifyPremium
// @version      2.1
// @description  Premium state, no ads and no upsell UI in the Spotify web player (own implementation), desktop and mobile player (Hermit)
// @author       realteamnet
// @homepageURL  https://github.com/realteamnet/SpotifyPremium
// @downloadURL  https://raw.githubusercontent.com/realteamnet/SpotifyPremium/main/SpotifyPremium-HERMIT.user.js
// @updateURL    https://raw.githubusercontent.com/realteamnet/SpotifyPremium/main/SpotifyPremium-HERMIT.user.js
// @icon         https://raw.githubusercontent.com/tromoSM/SpotifyPremiumPatch/main/assets/icon_48.png
// @license      MIT
// @match        https://open.spotify.com/*
// @run-at       document-start
// ==/UserScript==

/*
Generated file: built from src/ parts by tools/build.mjs (development repo). Do not edit by hand.
Based on: Own implementation. Hints only (no code) from https://github.com/tromoSM/SpotifyPremiumPatch and https://github.com/SpotX-Official/SpotX
Parts: src/lib/client.js, src/lib/response-rewrite.js, src/lib/bundle-patcher.js, src/platform/players.js, src/own/desktop.js, src/own/mobile.js, src/own/main.js
*/
(function () {
'use strict'

const BUILD = {"script":"OWN","platform":"ALL","browser":"HERMIT","version":"2.1"}
const TAG = '[SpotifyPremium]'

// ── lib/client: player version and page helpers ──

// appServerConfig: <script id="appServerConfig" type="text/plain"> with base64 JSON, parsed before the entry bundle
function clientVersion() {
    try {
        return JSON.parse(atob(document.getElementById('appServerConfig').textContent.trim())).clientVersion ?? ''
    } catch {
        return ''
    }
}

// Compares major.minor.patch only (1.3.8.509.g26b… → 1.3.8)
function compareVersions(a, b) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
    return 0
}

// <style> works at document-start: the CSP has no style-src. Injected early enough, there's no <html> yet: wait for it
function addStyle(css) {
    if (!css) return
    const style = document.createElement('style')
    style.textContent = css
    const append = () => (document.head ?? document.documentElement).appendChild(style)
    if (document.documentElement) return append()
    new MutationObserver((_, obs) => { if (document.documentElement) { obs.disconnect(); append() } }).observe(document, { childList: true })
}

// What to switch on so the userscript manager runs the script before the page's own scripts
function earlyInjectionHelp() {
    const handler = typeof GM_info === 'object' ? GM_info.scriptHandler ?? '' : ''
    if (/violentmonkey/i.test(handler)) return 'ViolentMonkey dashboard → Settings → Advanced → turn on "Synchronous page mode"'
    if (/tampermonkey/i.test(handler)) return 'Tampermonkey dashboard → Settings → Config mode: Advanced → Experimental → Inject Mode: Instant'
    return ''
}

// A dismissible bar at the top of the page (textContent only: no markup from strings)
function showNotice(title, text) {
    const show = () => {
        const bar = document.createElement('div')
        bar.dataset.spNotice = '1'
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;gap:12px;align-items:flex-start;'
            + 'padding:10px 14px;background:#b3261e;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 2px 8px #0008'
        const msg = document.createElement('div')
        msg.style.flex = '1'
        const strong = document.createElement('strong')
        strong.textContent = title
        msg.append(strong, document.createElement('br'), text)
        const close = document.createElement('button')
        close.textContent = '×'
        close.title = 'Dismiss'
        close.style.cssText = 'background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 4px'
        close.onclick = () => bar.remove()
        bar.append(msg, close)
        document.body.append(bar)
    }
    if (document.body) show()
    else document.addEventListener('DOMContentLoaded', show, { once: true })
}

// ── lib/response-rewrite: rewrite JSON API responses through fetch and XMLHttpRequest ──
// A rewriter is { label, url: RegExp, body?: (requestBody: string) => boolean, patch: (json) => json | null }.
// patch returns null to leave the response unchanged.

function installResponseRewriters(rewriters) {
    const matching = (url, body) => rewriters.filter(r => r.url.test(url) && (!r.body || (typeof body === 'string' && r.body(body))))
    const needsBody = url => rewriters.some(r => r.body && r.url.test(url))

    // Returns the new JSON text, or null when nothing changed
    function apply(list, text) {
        let json
        try { json = JSON.parse(text) } catch { return null }
        let changed = false
        for (const r of list) {
            try {
                const out = r.patch(json)
                if (out !== null && out !== undefined) { json = out; changed = true; console.log(`${TAG} rewrote ${r.label}`) }
            } catch (er) {
                console.error(`${TAG} ${r.label} rewrite failed`, er)
            }
        }
        return changed ? JSON.stringify(json) : null
    }

    // ── fetch ──
    const originalFetch = window.fetch
    window.fetch = async function (input, init) {
        const url = input instanceof Request ? input.url : String(input)
        if (!rewriters.some(r => r.url.test(url))) return originalFetch.apply(this, arguments)
        let body = init?.body
        if (body === undefined && input instanceof Request && needsBody(url)) {
            try { body = await input.clone().text() } catch { /* body unreadable */ }
        }
        const list = matching(url, body)
        const res = await originalFetch.apply(this, arguments)
        if (!list.length) return res
        try {
            const out = apply(list, await res.clone().text())
            if (out === null) return res
            const headers = new Headers(res.headers)
            headers.delete('content-length')
            headers.delete('content-encoding')
            const modified = new Response(out, { status: res.status, statusText: res.statusText, headers })
            Object.defineProperty(modified, 'url', { value: res.url })
            return modified
        } catch (er) {
            console.error(TAG, er)
            return res
        }
    }

    // ── XMLHttpRequest ──
    const XHR = XMLHttpRequest.prototype
    const originalOpen = XHR.open
    const originalSend = XHR.send
    const textDesc = Object.getOwnPropertyDescriptor(XHR, 'responseText')
    const responseDesc = Object.getOwnPropertyDescriptor(XHR, 'response')

    XHR.open = function (method, url) {
        this._spUrl = String(url)
        return originalOpen.apply(this, arguments)
    }
    XHR.send = function (body) {
        const list = this._spUrl ? matching(this._spUrl, body) : []
        if (list.length) this._spRewriters = list
        return originalSend.apply(this, arguments)
    }

    const ready = xhr => xhr._spRewriters && xhr.readyState === 4 && ['', 'text', 'json'].includes(xhr.responseType)
    function rewritten(xhr) {
        if (xhr._spText === undefined) {
            const raw = xhr.responseType === 'json' ? JSON.stringify(responseDesc.get.call(xhr)) : textDesc.get.call(xhr)
            xhr._spText = apply(xhr._spRewriters, raw) ?? raw
        }
        return xhr._spText
    }
    Object.defineProperty(XHR, 'responseText', {
        ...textDesc,
        get() { return ready(this) && this.responseType !== 'json' ? rewritten(this) : textDesc.get.call(this) },
    })
    Object.defineProperty(XHR, 'response', {
        ...responseDesc,
        get() {
            if (!ready(this)) return responseDesc.get.call(this)
            return this.responseType === 'json' ? JSON.parse(rewritten(this)) : rewritten(this)
        },
    })
}

// ── lib/bundle-patcher: regex-patch the player's JS before it runs ──
// Entry bundle (rspack runtime + inline modules): its <script> is blocked, the file fetched (CDN sends
// Access-Control-Allow-Origin: *), patched as text and run from a blob: URL (CSP allows blob:, not inline).
// Other chunks call self.rspackChunk.push([ids, modules]): the array is created here first with an accessor
// `push`, so every module factory is patched (toString → regex → eval) before the runtime registers it.
// The player is detected from the entry <script> (entries: {desktop: RegExp, mobile: RegExp}); after that only rules
// for that player (rule.player) or for any player (no player) apply. Before it is known, all rules apply.
// A rule is { key, match, replace, anchor?, required?, player? }:
//   match/replace  regex source + replacement with $1…$9 (arrays = several patches under one key, like SpotX)
//   anchor         a stable literal near the target (method name, string, testid). tools/doctor.mjs shows the code
//                  around it when the rule stops matching, so repatching is a regex edit
//   required       expected in the entry bundle: a console warning names it if it no longer matches

function compileRules(list, flags = 'g') {
    const out = []
    for (const { key, match, replace, anchor, required, player } of list) {
        const matches = [].concat(match), replaces = [].concat(replace)
        matches.forEach((m, i) => {
            try {
                out.push({ key: matches.length > 1 ? `${key}[${i}]` : key, re: new RegExp(m, flags), replace: replaces[i] ?? '', anchor, required: !!required, player })
            } catch (er) {
                console.warn(`${TAG} skipping ${key}: regex not valid in JS`, er.message)
            }
        })
    }
    return out
}

function installBundlePatcher({ entries, rules }) {
    const stats = Object.fromEntries(rules.map(r => [r.key, 0]))
    let player = null
    const active = () => rules.filter(r => !player || !r.player || r.player === player)

    function patchSource(src) {
        let out = src
        for (const r of active()) {
            r.re.lastIndex = 0
            if (!r.re.test(out)) continue
            r.re.lastIndex = 0
            out = out.replace(r.re, (...args) => {
                stats[r.key]++
                const groups = args.slice(1, args.findIndex(a => typeof a === 'number'))
                return r.replace.replace(/\$(\d)/g, (_, n) => groups[n - 1] ?? '')
            })
        }
        return out
    }

    // A module factory is `id(e,t,r){…}` (method shorthand, desktop) or `function(e,t,i){…}` (mobile)
    function compileModule(src) {
        const indirectEval = eval
        if (/^(?:async\s+)?function\b|^\(|^[\w$]+\s*=>/.test(src)) return indirectEval(`(${src})`)
        return Object.values(indirectEval(`({${src}})`))[0]
    }

    const seen = new WeakSet()
    function patchChunk(chunk) {
        if (!Array.isArray(chunk) || seen.has(chunk)) return
        seen.add(chunk)
        const modules = chunk[1]
        if (!modules || typeof modules !== 'object') return
        for (const id of Object.keys(modules)) {
            const fn = modules[id]
            if (typeof fn !== 'function') continue
            const src = Function.prototype.toString.call(fn)
            const out = patchSource(src)
            if (out === src) continue
            try {
                modules[id] = compileModule(out)
            } catch (er) {
                console.error(`${TAG} module ${id}: patched source failed to compile, kept original`, er)
            }
        }
    }

    // ── rspackChunk hook ──
    // The runtime does: s = self.rspackChunk ||= []; s.forEach(handler); s.push = handler.bind(null, s.push.bind(s))
    const chunks = (window.rspackChunk ||= [])
    const runtimeStarted = chunks.push !== Array.prototype.push
    chunks.forEach(patchChunk)
    // Injected late, the runtime's push is already installed: keep it, or every later chunk would be swallowed
    let handler = Object.hasOwn(chunks, 'push') ? chunks.push : null
    const rawPush = function (...items) { items.forEach(patchChunk); return Array.prototype.push.apply(chunks, items) }
    const handlerPush = function (...items) { items.forEach(patchChunk); return handler.apply(this, items) }
    Object.defineProperty(chunks, 'push', {
        configurable: true,
        get() { return handler ? handlerPush : rawPush },
        set(fn) { handler = fn },
    })

    // ── entry bundle ──
    function insertScript(src) {
        const s = document.createElement('script')
        s.src = src
        s.dataset.sp = '1'
        ;(document.head ?? document.documentElement).appendChild(s)
    }

    function loadPatchedEntry(src) {
        const started = performance.now()
        fetch(src)
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text() })
            .then(text => {
                const out = patchSource(text).replace(/\n\/\/# sourceMappingURL=.*$/, '')
                insertScript(URL.createObjectURL(new Blob([out], { type: 'text/javascript' })))
                console.log(`${TAG} patched ${src.split('/').pop()} in ${Math.round(performance.now() - started)} ms (${player} player)`, Object.fromEntries(active().map(r => [r.key, stats[r.key]])))
                const missing = active().filter(r => r.required && !stats[r.key]).map(r => r.key)
                if (missing.length) console.warn(`${TAG} Spotify changed: no match for ${missing.join(', ')}. Repatch: node tools/doctor.mjs (docs/repatching.md)`)
            })
            .catch(er => {
                console.error(`${TAG} couldn't patch the entry bundle, loading it unpatched`, er)
                insertScript(src)
            })
    }

    // Which player an entry <script> belongs to, or undefined
    const entryOf = node => node.nodeName === 'SCRIPT' && !node.dataset?.sp
        ? Object.keys(entries).find(name => entries[name].test(node.src ?? '')) : undefined
    const isEntry = node => !!entryOf(node)
    // Injected late (e.g. ViolentMonkey without "Synchronous page mode"): the entry already ran unpatched
    const parsed = [...document.scripts].find(isEntry)
    if (parsed) player = entryOf(parsed)
    const late = runtimeStarted || !!parsed
    if (late) console.warn(`${TAG} injected after the entry bundle was parsed: the code patches won't apply, only the response layer`)

    // Firefox fires beforescriptexecute; elsewhere the MutationObserver catches the tag before it has loaded
    document.addEventListener('beforescriptexecute', e => { if (isEntry(e.target)) e.preventDefault() }, true)
    new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                const name = entryOf(node)
                if (!name) continue
                player = name
                node.type = 'javascript/blocked'   // stops a parser-inserted script before it runs
                node.remove()
                loadPatchedEntry(node.src)
            }
        }
    }).observe(document, { childList: true, subtree: true })

    return {
        late, stats, patchSource,
        get player() { return player },
        rules: rules.map(r => ({ key: r.key, match: r.re.source, anchor: r.anchor, required: r.required, player: r.player })),
    }
}

// ── platform/players: the entry bundle of each player. Spotify's server picks the player from the user agent ──
// docs/web-player.md → "Page", "Bundler" and "Mobile web player"
const PLAYERS = {
    desktop: /\/cdn\/build\/web-player\/web-player\.[0-9a-f]+\.js(?:\?|$)/,
    mobile: /\/cdn\/build\/mobile-web-player\/mobile-web-player\.[0-9a-f]+\.js(?:\?|$)/,
}

// ── own/desktop: what to change in the desktop web player ──
// Targets are described in docs/web-player.md → "What is where". Written for this repo; SpotX's patches.json was
// used only as a hint for which parts of the client matter.

const OWN_DESKTOP = {
    // Response layer: the product state is built from this GraphQL query, so the client sees premium from the start
    rewriters: [{
        label: 'accountAttributes',
        url: /^https:\/\/api-partner\.spotify\.com\/pathfinder\//,
        body: body => { try { return JSON.parse(body).operationName === 'accountAttributes' } catch { return false } },
        patch(json) {
            const account = json?.data?.me?.account
            if (!account?.attributes) return null
            account.product = 'PREMIUM'
            Object.assign(account.attributes, { catalogue: 'premium', ads: false, onDemand: true })
            return json
        },
    }],

    // Code layer: the same state enforced inside the player, plus the ad and upsell switches
    rules: [
        {
            key: 'productState', anchor: '_fetchProductState', required: true,   // class mx: async _fetchProductState(e){…} → merge premium pairs into its result
            match: 'async _fetchProductState\\(([\\w$]+)\\)\\{',
            replace: 'async _fetchProductState($1){return Object.assign(await this._spFetchProductState($1),{ads:"0",catalogue:"premium",product:"premium","on-demand":"1"})}async _spFetchProductState($1){',
        },
        {
            key: 'adsReducer', anchor: 'setAdsEnabled:', required: true,     // root slice: setAdsEnabled:e=>{e.adsEnabled=!0} → ads can never be switched on
            match: '(setAdsEnabled:([\\w$]+)=>\\{\\2\\.adsEnabled=)!0',
            replace: '$1!1',
        },
        {
            key: 'premiumReducer', anchor: 'setPremium:', required: true, // root slice: setPremium:(e,t)=>{e.isPremium=t.payload} → always true
            match: '(setPremium:\\(([\\w$]+),[\\w$]+\\)=>\\{\\2\\.isPremium=)[\\w$]+\\.payload',
            replace: '$1!0',
        },
        {
            key: 'hptoReducer', anchor: 'setHptoHidden:', required: true,    // root slice: setHptoHidden → always hidden (home page takeover ad)
            match: '(setHptoHidden:\\(([\\w$]+),[\\w$]+\\)=>\\{\\2\\.isHptoHidden=)[\\w$]+\\.payload',
            replace: '$1!0',
        },
        {
            key: 'upgradeMenu', anchor: '"loggedin_upgrade_menu"', required: true,    // profile menu item: ({divider:e})=>{let t=(0,x.D)("loggedin_upgrade_menu")… → null
            match: '(=>\\{)(let [\\w$]+=\\(0,[\\w$.]+\\)\\("loggedin_upgrade_menu"\\))',
            replace: '$1return null;$2',
        },
    ],

    // UI layer: hide instead of patching shared breakpoint tokens
    css: '[data-testid="upgrade-button"]{display:none!important}',
}

// ── own/mobile: what to change in the mobile web player ──
// Targets are described in docs/web-player.md → "Mobile web player". The mobile selectors compare
// product === "PREMIUM" (enum G.Premium) and catalogue === "premium".

const PREMIUM_STATE = { product: 'PREMIUM', catalogue: 'premium', ads: '0', 'on-demand': '1' }

const OWN_MOBILE = {
    // Response layer: the player SDK GETs @webgate/melody/v1/product_state (spclient) with fetch
    rewriters: [{
        label: 'product_state',
        url: /\/melody\/v1\/product_state(?:\?|$)/,
        patch: json => (json && typeof json === 'object' ? Object.assign(json, PREMIUM_STATE) : null),
    }],

    // Code layer: session reducer `case X:return{...e,product:t.productState}` → merge the premium pairs
    rules: [{
        key: 'sessionProduct', anchor: '.productState}', required: true,
        match: '(case [\\w$]+:return\\{\\.\\.\\.[\\w$]+,product:)([\\w$]+)\\.productState\\}',
        replace: `$1{...$2.productState,${Object.entries(PREMIUM_STATE).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',')}}}`,
    }, {
        // Playback device registration (Harmony): `type:h.type??X.SMARTPHONE,name:"Mobile Web Player"` → COMPUTER.
        // Spotify applies its mobile free-tier rules (shuffle-only next/back) to smartphone devices; the desktop
        // player registers as a computer. Experimental: whether the server keys only on this is unverified
        key: 'deviceType', anchor: 'name:"Mobile Web Player"', required: true,
        match: '(type:[\\w$]+\\.type\\?\\?(?:[\\w$]+\\.)+)SMARTPHONE(,name:"Mobile Web Player")',
        replace: '$1COMPUTER$2',
    }],

    css: '[data-testid="premium-banner"],[data-testid="upsell-download-app-button"]{display:none!important}',
}

// ── own/main ──
// One script for both players: the server picks the player, the patcher detects it from the entry <script>.
// Response rewriters and CSS cover both (their URLs and testids don't overlap); code rules are tagged per player.
const OWN = { desktop: OWN_DESKTOP, mobile: OWN_MOBILE }
installResponseRewriters(Object.values(OWN).flatMap(o => o.rewriters))
const patcher = installBundlePatcher({
    entries: PLAYERS,
    rules: compileRules(Object.entries(OWN).flatMap(([player, o]) => o.rules.map(r => ({ ...r, player })))),
})
addStyle(Object.values(OWN).map(o => o.css).join(''))
window.SpotifyPremium = {
    build: BUILD, late: patcher.late, rules: patcher.rules, stats: patcher.stats, patchSource: patcher.patchSource,
    get player() { return patcher.player },
    get version() { return clientVersion() },   // appServerConfig is parsed after document-start
}
console.log(`${TAG} active: waiting for the player`)

// Started too late: only the response layer works. Say which setting fixes it, when the manager has one
if (patcher.late) {
    const help = earlyInjectionHelp()
    showNotice('Spotify Premium userscript started too late, so only part of it works.',
        help ? `Fix: ${help}, then reload this page.` : 'Your browser ran the script after Spotify had loaded. Reload the page; if this keeps showing, the browser can\'t run it early enough.')
}
})()
