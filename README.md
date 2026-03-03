# 🔑 CampusKeys

A college item borrowing & lending platform built with React + Supabase.

.## Features

- 🏠 **Browse** — Search & filter items; owner can't book own items
- 💬 **Home Chat** — Inline chat on browse page with real-time notifications
- 📢 **Item Requests** — Post requests for items not yet listed; others can fulfil
- 📦 **Bookings** — Approve/reject, mark returned, rate with stars ⭐
- 💬 **Full Chat** — Real-time messaging per booking with voice messages
- 🔔 **Notifications** — In-app + email for all events
- 👤 **Profile** — Stats, reviews, desktop/mobile toggle
- 🛡️ **Admin** — Block/unblock users (shows blocked screen), inbox from blocked users, manage listings & reports

## Admin Block Flow

1. Admin blocks user → user sees a **Blocked Screen** with a message box
2. User writes message → admin sees it in **Admin → Inbox tab**
3. Admin can reply directly from inbox
4. Admin can **Unblock** from the Users tab

## Database Tables

| Table | Purpose |
|-------|---------|
| profiles | User accounts + blocked flag |
| items | Listings |
| bookings | Rental transactions |
| messages | Chat per booking |
| reviews | Star ratings |
| notifications | In-app alerts |
| reports | Fraud reports |
| item_requests | Wanted item requests *(002 migration)* |
| admin_messages | User ↔ Admin messaging *(002 migration)* |
