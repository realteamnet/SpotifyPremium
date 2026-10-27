// ==UserScript==
// @name         Spotify Premium (STANDALONE, MOBILE, Hermit)
// @namespace    https://github.com/realteamnet/SpotifyPremium
// @version      2.0
// @description  tromoSM/SpotifyPremiumPatch inject.js converted into a single userscript (mobile web player, Hermit)
// @author       realteamnet (based on tromoSM/SpotifyPremiumPatch)
// @homepageURL  https://github.com/realteamnet/SpotifyPremium
// @downloadURL  https://raw.githubusercontent.com/realteamnet/SpotifyPremium/main/SpotifyPremium-STANDALONE-HERMIT.user.js
// @updateURL    https://raw.githubusercontent.com/realteamnet/SpotifyPremium/main/SpotifyPremium-STANDALONE-HERMIT.user.js
// @icon         https://raw.githubusercontent.com/tromoSM/SpotifyPremiumPatch/main/assets/icon_48.png
// @license      Apache-2.0
// @match        https://open.spotify.com/*
// @run-at       document-start
// ==/UserScript==

/*
Generated file: built from src/ parts by tools/build.mjs (development repo). Do not edit by hand.
Based on: https://github.com/tromoSM/SpotifyPremiumPatch (Apache-2.0): inject.js, ported
Parts: src/lib/response-rewrite.js, src/standalone/mobile.js, src/standalone/main.js
*/
(function () {
'use strict'

const BUILD = {"script":"STANDALONE","platform":"MOBILE","browser":"HERMIT","version":"2.0"}
const TAG = '[SpotifyPremium-STANDALONE-MOBILE]'

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

// ── standalone/mobile: tromoSM's approach applied to the mobile web player ──
// inject.js only knows the desktop accountAttributes query. The mobile player reads its product state from
// @webgate/melody/v1/product_state instead (docs/web-player.md → "Mobile web player"), so the same idea (rewrite the
// account response) is applied there. Mobile selectors compare product === "PREMIUM" and catalogue === "premium".
const REWRITERS = [{
    label: 'product_state',
    url: /\/melody\/v1\/product_state(?:\?|$)/,
    patch(state) {
        if (!state || typeof state !== 'object') {
            console.warn(`${TAG} couldnt find the right object`)
            return null
        }
        const oldProduct = state.product
        Object.assign(state, { product: 'PREMIUM', catalogue: 'premium', ads: '0', 'on-demand': '1' })
        console.log(`${TAG} modified account type from ${oldProduct} to ${state.product}`)
        return state
    },
}]

// ── standalone/main ──
installResponseRewriters(REWRITERS)
})()
