# ChatApp API Documentation

Real-time messaging platform API - All microservices endpoints exposed through the API gateway.

## Base URL

`http://localhost:8000`

## Authentication

Most endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

---

## Auth Service

Base prefix: `/api/auth`

### Module: auth

| Method | Endpoint | Description | Body |
| --- | --- | --- | --- |
| **🔵 POST** | `/api/auth/register` | | <details><summary>View Payload</summary><pre><code>{
  "email": "sample_email",
  "password": "sample_password",
  "firstName": "sample_firstName",
  "lastName": "sample_lastName",
  "username": "sample_username",
  "phoneNumber": "sample_phoneNumber",
  "about": "sample_about",
  "provider": "sample_provider",
  "profilePhotoUrl": "sample_profilePhotoUrl",
  "profilePhotoPublicId": "sample_profilePhotoPublicId"
}</code></pre></details> |
| **🔵 POST** | `/api/auth/login` | | <details><summary>View Payload</summary><pre><code>{
  "email": "sample_email",
  "password": "sample_password"
}</code></pre></details> |
| **🔵 POST** | `/api/auth/refresh` | | <details><summary>View Payload</summary><pre><code>{
  "refreshToken": "sample_refreshToken"
}</code></pre></details> |
| **🔵 POST** | `/api/auth/logout` | | - |
| **🟢 GET** | `/api/auth/profile` | | - |
| **🟠 PUT** | `/api/auth/profile` | | <details><summary>View Payload</summary><pre><code>{
  "firstName": "sample_firstName",
  "lastName": "sample_lastName",
  "username": "sample_username",
  "phoneNumber": "sample_phoneNumber",
  "about": "sample_about",
  "profilePhotoUrl": "sample_profilePhotoUrl",
  "profilePhotoPublicId": "sample_profilePhotoPublicId"
}</code></pre></details> |
| **🟠 PUT** | `/api/auth/change-password` | | <details><summary>View Payload</summary><pre><code>{
  "currentPassword": "sample_currentPassword",
  "newPassword": "sample_newPassword"
}</code></pre></details> |
| **🟠 PUT** | `/api/auth/settings` | | <details><summary>View Payload</summary><pre><code>{
  "privacy": "sample_privacy",
  "notifications": "sample_notifications",
  "chat": "sample_chat",
  "account": "sample_account"
}</code></pre></details> |
| **🔵 POST** | `/api/auth/settings/block/:targetUserId` | | - |
| **🟢 GET** | `/api/auth/users/:userId` | | - |
| **🟡 PATCH** | `/api/auth/users/:userId/last-seen` | | - |
| **🔵 POST** | `/api/auth/keys` | | <details><summary>View Payload</summary><pre><code>{
  "deviceId": "sample_deviceId",
  "registrationId": "sample_registrationId",
  "identityKey": "sample_identityKey",
  "signedPreKey": {
    "keyId": "sample_keyId",
    "publicKey": "sample_publicKey",
    "signature": "sample_signature"
  },
  "oneTimePreKeys": "sample_oneTimePreKeys",
  "fcmToken": "sample_fcmToken",
  "deviceInfo": "sample_deviceInfo"
}</code></pre></details> |
| **🟢 GET** | `/api/auth/keys/:userId` | | - |
| **🔵 POST** | `/api/auth/keys/replenish` | | <details><summary>View Payload</summary><pre><code>{
  "deviceId": "sample_deviceId",
  "oneTimePreKeys": "sample_oneTimePreKeys"
}</code></pre></details> |

