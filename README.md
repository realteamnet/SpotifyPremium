# SpotifyPremium

Userscripts for the Spotify web player (`open.spotify.com`) that unlock the premium client state: no ads, no upgrade
prompts or premium banners.

They only change what the web player believes and shows in your own browser. Anything Spotify enforces on its servers
still follows your real plan.

## Which file

One script works on both the desktop and the mobile player: it detects which one Spotify serves and patches that.

| File | Browser |
|------|---------|
| [`SpotifyPremium.user.js`](https://raw.githubusercontent.com/realteamnet/SpotifyPremium/main/SpotifyPremium.user.js) | ViolentMonkey / Tampermonkey (desktop, or Android: Firefox, Kiwi, …) |
| [`SpotifyPremium-HERMIT.user.js`](https://raw.githubusercontent.com/realteamnet/SpotifyPremium/main/SpotifyPremium-HERMIT.user.js) | [Hermit](https://hermit.chimbori.com/) (Android). See [Hermit](#hermit) |
| [`SpotifyPremium-MINI.user.js`](https://raw.githubusercontent.com/realteamnet/SpotifyPremium/main/SpotifyPremium-MINI.user.js) | smaller alternative, ViolentMonkey / Tampermonkey |
| [`SpotifyPremium-MINI-HERMIT.user.js`](https://raw.githubusercontent.com/realteamnet/SpotifyPremium/main/SpotifyPremium-MINI-HERMIT.user.js) | smaller alternative, Hermit |

`SpotifyPremium` is the main script. It patches two things:
- **Account state:** the account-info response is rewritten so the client sees a premium account.
- **Player code:** before the player runs, it sets the ad, premium and upsell switches, and hides the upgrade button and premium banners.

`SpotifyPremium-MINI` only rewrites the account-state response. It's a port of
[tromoSM/SpotifyPremiumPatch](https://github.com/tromoSM/SpotifyPremiumPatch). Install **one** script per browser.

Older `-DESKTOP`, `-MOBILE` and `-STANDALONE` files are gone. If you installed one, remove it and install a file above.

## Install

- **ViolentMonkey / Tampermonkey:** click a file above (it opens the raw file) and confirm the install.
  Updates come from this repo automatically.
- **Hermit:** see [Hermit](#hermit) below.

Reload `open.spotify.com` afterwards. The browser console shows `[SpotifyPremium…]` messages when the patches apply.
In the console, `SpotifyPremium.stats` shows how often each code patch matched.

If a red bar at the top says the script **started too late**, your userscript manager ran it after Spotify had loaded.
Only the account-state part works then. Turn on the setting the bar names and reload:
- **ViolentMonkey (Chrome, Edge):** dashboard → Settings → Advanced → **Synchronous page mode**.
- **Tampermonkey:** Settings → Config mode: Advanced → Experimental → **Inject Mode: Instant**.

## Hermit

The `*-HERMIT` files are the mobile builds with a header Hermit accepts. Hermit doesn't support `@grant`, `@require` or
`@resource`, and these scripts don't need them.

1. Create a Lite App for `https://open.spotify.com`.
2. Hermit → **Settings** → **User Scripts** → **+**. Paste the full contents of `SpotifyPremium-HERMIT.user.js`
   (open [the raw file](https://raw.githubusercontent.com/realteamnet/SpotifyPremium/main/SpotifyPremium-HERMIT.user.js) and copy everything), name it "Spotify Premium", and save.
3. In the Spotify Lite App: **Quick Settings** → **User Scripts** → tick "Spotify Premium". Then relaunch the Lite App.

To update in Hermit, paste the new version over the old one (Hermit may not update scripts automatically). It works with a mobile or a
desktop user agent. User Scripts are a Hermit Premium feature.

## When Spotify updates

Each code patch is checked against the current player regularly. If one stops matching, the console says which:
`Spotify changed: no match for …`. A fixed version is published here, and your userscript manager picks it up
automatically. The account-state part usually keeps working in the meantime.

## Credits and licences

- `SpotifyPremium`, `SpotifyPremium-HERMIT`: own implementation, MIT. Ideas from
  [tromoSM/SpotifyPremiumPatch](https://github.com/tromoSM/SpotifyPremiumPatch) and
  [SpotX-Official/SpotX](https://github.com/SpotX-Official/SpotX).
- `SpotifyPremium-MINI*`: derived from tromoSM/SpotifyPremiumPatch, licensed under
  [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) like the original.

Not affiliated with Spotify. Using these may break Spotify's terms of use.
