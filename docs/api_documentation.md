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
| **🔵 POST** | `/api/auth/contacts/sync` | | <details><summary>View Payload</summary><pre><code>{
  "contacts": "sample_contacts"
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

## Chat Service

Base prefix: `/api/chat`

### Module: conversation

| Method | Endpoint | Description | Body |
| --- | --- | --- | --- |
| **🔵 POST** | `/api/chat/initiate` | | <details><summary>View Payload</summary><pre><code>{
  "participantId": "sample_participantId",
  "type": "sample_type"
}</code></pre></details> |
| **🟢 GET** | `/api/chat` | | - |
| **🟢 GET** | `/api/chat/:conversationId` | | - |
| **🟡 PATCH** | `/api/chat/:conversationId/block` | | - |
| **🟡 PATCH** | `/api/chat/:conversationId/mute` | | - |
| **🟡 PATCH** | `/api/chat/:conversationId/archive` | | - |
| **🔴 DELETE** | `/api/chat/:conversationId` | | - |
| **🔵 POST** | `/api/chat/groups` | | <details><summary>View Payload</summary><pre><code>{
  "name": "sample_name",
  "participants": "sample_participants"
}</code></pre></details> |
| **🟠 PUT** | `/api/chat/groups/:conversationId` | | <details><summary>View Payload</summary><pre><code>{
  "name": "sample_name",
  "description": "sample_description"
}</code></pre></details> |
| **🔵 POST** | `/api/chat/groups/:conversationId/members` | | <details><summary>View Payload</summary><pre><code>{
  "members": "sample_members"
}</code></pre></details> |
| **🔴 DELETE** | `/api/chat/groups/:conversationId/members/:memberId` | | - |
| **🔵 POST** | `/api/chat/groups/:conversationId/leave` | | - |
| **🟡 PATCH** | `/api/chat/groups/:conversationId/admins/:memberId` | | - |

### Module: message

| Method | Endpoint | Description | Body |
| --- | --- | --- | --- |
| **🔵 POST** | `/api/chat` | | <details><summary>View Payload</summary><pre><code>{
  "conversationId": "sample_conversationId",
  "content": "sample_content",
  "type": "sample_type"
}</code></pre></details> |
| **🟢 GET** | `/api/chat/:conversationId` | | - |
| **🟡 PATCH** | `/api/chat/:messageId/status` | | <details><summary>View Payload</summary><pre><code>{
  "status": "sample_status",
  "deviceId": "sample_deviceId"
}</code></pre></details> |
| **🔴 DELETE** | `/api/chat/:messageId` | | - |
| **🟡 PATCH** | `/api/chat/:messageId/pin` | | - |
| **🟢 GET** | `/api/chat/:conversationId/pinned` | | - |
| **🔵 POST** | `/api/chat/:messageId/reactions` | | <details><summary>View Payload</summary><pre><code>{
  "emoji": "sample_emoji"
}</code></pre></details> |
| **🟢 GET** | `/api/chat/:conversationId/search` | | - |
| **🔵 POST** | `/api/chat/:messageId/report` | | <details><summary>View Payload</summary><pre><code>{
  "reason": "sample_reason",
  "details": "sample_details"
}</code></pre></details> |
| **🔵 POST** | `/api/chat/:messageId/forward` | | <details><summary>View Payload</summary><pre><code>{
  "targetConversationId": "sample_targetConversationId"
}</code></pre></details> |
| **🔵 POST** | `/api/chat/reports/user/:targetUserId` | | <details><summary>View Payload</summary><pre><code>{
  "reason": "sample_reason",
  "details": "sample_details"
}</code></pre></details> |

## Notification Service

Base prefix: `/api/notification`

### Module: notification

| Method | Endpoint | Description | Body |
| --- | --- | --- | --- |
| **🟢 GET** | `/api/notification/health` | | - |
| **🟢 GET** | `/api/notification/history` | | - |
| **🔵 POST** | `/api/notification/devices` | | <details><summary>View Payload</summary><pre><code>{
  "deviceId": "sample_deviceId",
  "fcmToken": "sample_fcmToken",
  "deviceInfo": "sample_deviceInfo"
}</code></pre></details> |
| **🔵 POST** | `/api/notification/test` | | <details><summary>View Payload</summary><pre><code>{
  "userId": "sample_userId",
  "title": "sample_title",
  "body": "sample_body",
  "data": "sample_data"
}</code></pre></details> |

