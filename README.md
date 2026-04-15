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

## Production notes

- Set a real `JWT_SECRET`
- Restrict `CORS_ORIGIN`
- Add a real SMS provider instead of console OTP logging
- Add TURN credentials for better call reliability
- Move media to object storage for production scale
