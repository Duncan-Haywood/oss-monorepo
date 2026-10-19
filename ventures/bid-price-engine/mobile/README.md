# Bid Price Engine as an Android and iOS app

The web app is already installable: open it in Chrome (Install app) or Safari
(Share, Add to Home Screen) and it runs full screen and offline from a service
worker. This folder is for people who want a store build of their own.

The calculator is plain HTML and ES modules with no bundler, so
[Capacitor](https://capacitorjs.com/) wraps it unchanged.

```bash
cd ventures/bid-price-engine/mobile
npm install
# Set your own appId in capacitor.config.json first (reverse-domain, e.g. com.yourco.bidprice).
npm run add:android     # needs Android Studio
npm run add:ios         # needs macOS and Xcode
npm run open:android    # build, sign and upload with YOUR developer account
```

Rebuild after changing the calculator: `npm run sync-web && npx cap sync`.

Publishing to Google Play or the App Store happens under your own developer
account and your own appId. Nothing here signs, uploads or runs on anyone's
behalf. The app makes no network calls; the figures stay on the device.

Not legal, tax or financial advice; no warranty. MIT licensed.
