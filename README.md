# Pocket Arcade Demo

This project uses the supplied MIT-licensed Stake Originals-inspired React app and its animated Crash, Plinko, and Mines games. Dino is removed from the routes and lobby. The original game source and license notice are kept under `stake-originals-clone-main/`.

**Demo only:** the website creates simulated deposit codes, shows a play-money balance in euros, and can check a fake withdrawal receipt. It never asks for card or wallet details, takes money, or pays cryptocurrency. The calculator app uses virtual credits, and its game results are user-controlled, so the HMAC codes must never be used for anything with real value.

## Run Locally

Requires Node.js 20 or newer. Install the root dependencies and start both processes in separate terminals:

```sh
npm install
npm start
```

```sh
npm run dev:web
```

Open <http://localhost:5173>. The web app forwards `/api` requests to the Express server at port 3000. For a static production build, run `npm run build`; the React files are written to the root `public/` directory for Express/Vercel.

## Play With Demo Codes

1. Open **Demo wallet** and choose €10, €20, or €50. **Create demo deposit code** does not charge you; it displays a Session ID and an 8-character demo code.
2. Enter the Session ID and demo code in Demo wallet, then choose **Redeem demo code**. The code can only be redeemed once. The website balance is shown in euros; the calculator receives 1,000, 2,000, or 5,000 virtual credits for the corresponding €10, €20, or €50 demo value.
3. Play Crash, Plinko, or Mines. Website game amounts use the demo euro balance, saved in this browser.
4. For the calculator workflow, get the `POCKET.g3a` file, connect the fx-CG50 by USB, choose **USB Flash**, copy the file to the calculator (replace the previous Pocket Arcade file if prompted), safely eject it, and open Pocket Arcade from **MENU**. In the app choose `4`, select the same amount, and enter the Session ID and demo code. The calculator balance and games remain virtual credits. After playing, choose `5` for a demo receipt. Enter the Session ID, exit code, and amount in Demo wallet and choose **Check demo withdrawal**. To close the add-in cleanly before launching it again, press **EXIT** from the game menu. No payout occurs.

The calculator app is a virtual-credit companion; its local game results cannot be used for real-money deposits or withdrawals. On Apple Silicon, install the PrizmSDK release from [Insoft-UK/PrizmSDK](https://github.com/Insoft-UK/PrizmSDK/releases) under `/Applications/CASIO/PrizmSDK`. This project uses the legacy C headers from [Jonimoose/libfxcg](https://github.com/Jonimoose/libfxcg), so set `FXCG_INCLUDE` to that repository's `include` directory:

```sh
git clone --depth 1 https://github.com/Jonimoose/libfxcg.git /path/to/libfxcg
FXCGSDK=/Applications/CASIO/PrizmSDK \
FXCG_INCLUDE=/path/to/libfxcg/include \
make -C calculator_app
```

The build writes `calculator_app/POCKET.g3a`. Connect the fx-CG50 by USB, choose **USB Flash**, copy the file to the calculator, safely eject it, and open Pocket Arcade from **MENU**.

The calculator interface uses the fx-CG50's indexed display mode and built-in text font, with cyan, green, yellow, and red text highlights. Every screen is arranged within the calculator's seven text rows; it avoids full-colour pixel drawing because that conflicts with the native text renderer. The add-in restores indexed display mode when it exits so it can be launched again.

## Deploy to Vercel

1. Push this whole workspace to GitHub and import it into Vercel. Set the project Root Directory to the repository root.
2. Set the Build Command to `npm run build`. The root build script installs the nested game dependencies from their lockfile and builds the React app into `public/`.
3. Add a Redis integration from the Vercel Marketplace, such as Upstash Redis. Ensure the project receives `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Vercel deployments refuse to start the API without Redis.
4. Add `MASTER_SECRET` with the same demo placeholder used by `calculator_app/main.c`: `YOUR_SHARED_SECRET_KEY`. This is intentionally not a production secret. Rebuild the calculator if you change it.
5. Deploy. Open the site and use Demo wallet; no real payment provider is involved.

Vercel Redis stores sessions for 24 hours, rate-limits requests across instances, and atomically prevents reusing a redeemed pass or receipt. Local development uses memory storage, so demo passes reset when the server restarts. Run `npm test` for the API checks.