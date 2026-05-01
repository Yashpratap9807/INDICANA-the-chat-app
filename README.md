# INDICANA

Instagram-inspired encrypted messaging with profiles, media sharing, search, calling, 2FA, safety controls, and device sessions.

## What is built

- Username/password auth
- Optional verified-phone 2FA
- Password reset by OTP
- Device/session tracking with revoke support
- Search by profile name
- Profile editing, profile photos, follow/unfollow
- One-to-one encrypted messaging
- Photo sharing and camera capture
- Voice/video calling with WebRTC signaling
- Sent, delivered, and seen message states
- Block/unblock and report user actions

## Local run

### Backend

```powershell
cd D:\projects\new\backend
copy .env.example .env
npm install
npm start
```

Update `backend/.env` if your MongoDB host, JWT secret, or ports differ.

### Frontend

```powershell
cd D:\projects\new\frontend
npx -y serve .
```

Open [http://localhost:3000](http://localhost:3000).

The frontend now reads runtime config from `window.INDICANA_CONFIG` in [config.js](D:/projects/new/frontend/src/config.js), so it is no longer hardcoded to `localhost` only.

## Android APK

The project is now prepared for Android packaging with Capacitor from [frontend/package.json](D:/projects/new/frontend/package.json) and [frontend/capacitor.config.json](D:/projects/new/frontend/capacitor.config.json).

### Before building the APK

1. Deploy the backend to a public HTTPS domain
2. Edit [frontend/runtime-config.js](D:/projects/new/frontend/runtime-config.js) and set:

```js
window.INDICANA_CONFIG = window.INDICANA_CONFIG || {};

Object.assign(window.INDICANA_CONFIG, {
  apiBase: 'https://your-backend-domain.com',
  wsBase: 'wss://your-backend-domain.com',
});
```

3. In [backend/.env](D:/projects/new/backend/.env), allow both your web frontend and Capacitor Android origin in `CORS_ORIGIN`
4. Keep WebSocket and HTTPS enabled on the backend because chat and calls depend on them

Important:
- A shared APK will not work on other phones if it still points to `localhost`
- For quick same-Wi-Fi testing, you can temporarily use `http://YOUR_LAPTOP_IP:3001` and `ws://YOUR_LAPTOP_IP:3001`
- For a real shareable APK, use a public `https://...` and `wss://...` backend before building

### APK commands

```powershell
cd D:\projects\new\frontend
npm install
npm run android:sync
npm run android:open
```

Then in Android Studio:

1. Wait for Gradle sync
2. Open `Build > Build Bundle(s) / APK(s) > Build APK(s)`
3. Use the generated APK from the Android output path

The Android scaffold is created in [frontend/android](D:/projects/new/frontend/android), and the packaged web assets are copied from [frontend/dist](D:/projects/new/frontend/dist).

## Production notes

- Set a real `JWT_SECRET`
- Restrict `CORS_ORIGIN`
- Add a real SMS provider instead of console OTP logging
- Add TURN credentials for better call reliability
- Move media to object storage for production scale
- Host the backend somewhere that supports WebSockets well, because calls and live chat depend on it
