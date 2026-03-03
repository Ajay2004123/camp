// Supabase Edge Function: send-email
// Deploy: supabase functions deploy send-email
// Set secrets: supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM_EMAIL=noreply@yourdomain.com

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM      = Deno.env.get("RESEND_FROM_EMAIL") ?? "CampusKeys <noreply@campuskeys.app>";
const APP_URL          = Deno.env.get("APP_URL") ?? "https://campuskeys.app";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Email templates ────────────────────────────────────────────────────────────
function baseLayout(content: string, preheader = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>CampusKeys</title>
<style>
  body{margin:0;padding:0;background:#07080c;font-family:'Segoe UI',Arial,sans-serif}
  .wrap{max-width:580px;margin:0 auto;padding:32px 16px}
  .card{background:#181c28;border-radius:20px;border:1px solid #252a3d;overflow:hidden}
  .head{background:linear-gradient(135deg,#1e2235,#181c28);padding:32px 32px 24px;border-bottom:1px solid #252a3d}
  .logo{font-size:28px;font-weight:800;color:#eef0f6;letter-spacing:-1px}
  .logo span{color:#f0c040}
  .body{padding:28px 32px}
  h2{font-size:22px;font-weight:800;color:#eef0f6;margin:0 0 10px}
  p{font-size:15px;color:#8892aa;line-height:1.65;margin:0 0 16px}
  .highlight{background:#1e2235;border-radius:12px;border:1px solid #2f3550;padding:18px 20px;margin:20px 0}
  .hl-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #252a3d;font-size:14px}
  .hl-row:last-child{border-bottom:none}
  .hl-label{color:#5a6380}
  .hl-value{color:#eef0f6;font-weight:600}
  .btn{display:inline-block;background:#f0c040;color:#07080c;font-weight:800;font-size:15px;padding:14px 30px;border-radius:12px;text-decoration:none;margin:20px 0}
  .warn{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.25);border-radius:12px;padding:14px 18px;font-size:14px;color:#f87171;margin:16px 0}
  .success{background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.25);border-radius:12px;padding:14px 18px;font-size:14px;color:#34d399;margin:16px 0}
  .footer{padding:20px 32px;border-top:1px solid #252a3d;font-size:12px;color:#5a6380;text-align:center}
  .badge{display:inline-block;background:rgba(240,192,64,.1);border:1px solid rgba(240,192,64,.2);border-radius:100px;padding:4px 12px;font-size:12px;font-weight:700;color:#f0c040;margin-bottom:16px}
</style>
</head>
<body>
<div class="wrap">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden">${preheader}</div>` : ""}
  <div class="card">
    <div class="head">
      <div class="logo">Campus<span>Keys</span> 🔑</div>
      <div style="font-size:13px;color:#5a6380;margin-top:4px">College Item Sharing Platform</div>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      © ${new Date().getFullYear()} CampusKeys · Safe campus sharing for students<br/>
      <a href="${APP_URL}" style="color:#f0c040;text-decoration:none">Open CampusKeys</a>
    </div>
  </div>
</div>
</body>
</html>`;
}

function bookingConfirmedEmail(d: any) {
  return baseLayout(`
    <div class="badge">📦 Booking Request Sent</div>
    <h2>Your request has been submitted!</h2>
    <p>Hi <strong style="color:#eef0f6">${d.borrower_name}</strong>, your booking request for <strong style="color:#f0c040">${d.item_title}</strong> has been sent to the owner. You'll get an email once they approve it.</p>
    <div class="highlight">
      <div class="hl-row"><span class="hl-label">Item</span><span class="hl-value">${d.item_title}</span></div>
      <div class="hl-row"><span class="hl-label">Owner</span><span class="hl-value">${d.owner_name}</span></div>
      <div class="hl-row"><span class="hl-label">From</span><span class="hl-value">${d.from_date}</span></div>
      <div class="hl-row"><span class="hl-label">To</span><span class="hl-value">${d.to_date}</span></div>
      <div class="hl-row"><span class="hl-label">Total Rent</span><span class="hl-value" style="color:#f0c040">₹${d.total_rent}</span></div>
      <div class="hl-row"><span class="hl-label">Pickup Location</span><span class="hl-value">📍 ${d.pickup_location}</span></div>
    </div>
    <div class="warn">⚠️ Return by <strong>${d.to_date}</strong>. Late returns are charged ₹${d.fine_per_day}/day. A reminder will be sent 5 hours before your return deadline.</div>
    <a href="${APP_URL}/bookings" class="btn">View My Bookings →</a>
  `, `Your booking for ${d.item_title} has been submitted`);
}

function bookingApprovedEmail(d: any) {
  return baseLayout(`
    <div class="badge">✅ Booking Approved!</div>
    <h2>Great news — you're all set!</h2>
    <p>Hi <strong style="color:#eef0f6">${d.borrower_name}</strong>, <strong style="color:#f0c040">${d.owner_name}</strong> has approved your booking for <strong style="color:#f0c040">${d.item_title}</strong>.</p>
    <div class="success">✅ Your booking is now confirmed. You can chat with the owner to arrange pickup.</div>
    <div class="highlight">
      <div class="hl-row"><span class="hl-label">Item</span><span class="hl-value">${d.item_title}</span></div>
      <div class="hl-row"><span class="hl-label">From</span><span class="hl-value">${d.from_date}</span></div>
      <div class="hl-row"><span class="hl-label">Return By</span><span class="hl-value" style="color:#f87171">${d.to_date}</span></div>
      <div class="hl-row"><span class="hl-label">Total Rent</span><span class="hl-value" style="color:#f0c040">₹${d.total_rent}</span></div>
      <div class="hl-row"><span class="hl-label">Pickup At</span><span class="hl-value">📍 ${d.pickup_location}</span></div>
    </div>
    <div class="warn">⚠️ You must return the item by <strong>${d.to_date}</strong>. Late returns are charged ₹${d.fine_per_day}/day. We'll remind you 5 hours before.</div>
    <a href="${APP_URL}/bookings" class="btn">Open Chat & View Details →</a>
  `, `Your booking for ${d.item_title} is confirmed!`);
}

function bookingRejectedEmail(d: any) {
  return baseLayout(`
    <div class="badge" style="background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.2);color:#f87171">❌ Booking Rejected</div>
    <h2>Your booking wasn't approved</h2>
    <p>Hi <strong style="color:#eef0f6">${d.borrower_name}</strong>, unfortunately <strong style="color:#eef0f6">${d.owner_name}</strong> was unable to approve your request for <strong style="color:#eef0f6">${d.item_title}</strong>.</p>
    <p>Don't worry — browse other available items on CampusKeys!</p>
    <a href="${APP_URL}" class="btn">Browse Items →</a>
  `, `Update on your booking request`);
}

function returnReminderEmail(d: any) {
  return baseLayout(`
    <div class="badge" style="background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.2);color:#f87171">⏰ Return Reminder</div>
    <h2>Return due in 5 hours!</h2>
    <p>Hi <strong style="color:#eef0f6">${d.borrower_name}</strong>, this is a reminder that you need to return <strong style="color:#f0c040">${d.item_title}</strong> within the next <strong style="color:#f87171">5 hours</strong>.</p>
    <div class="warn">
      ⏰ <strong>Return Deadline: ${d.to_date}</strong><br/>
      After this time, a late fine of <strong>₹${d.fine_per_day}/day</strong> will be automatically added to your account.
    </div>
    <div class="highlight">
      <div class="hl-row"><span class="hl-label">Item</span><span class="hl-value">${d.item_title}</span></div>
      <div class="hl-row"><span class="hl-label">Owner</span><span class="hl-value">${d.owner_name}</span></div>
      <div class="hl-row"><span class="hl-label">Return At</span><span class="hl-value">📍 ${d.pickup_location}</span></div>
      <div class="hl-row"><span class="hl-label">Late Fine</span><span class="hl-value" style="color:#f87171">₹${d.fine_per_day}/day after deadline</span></div>
    </div>
    <a href="${APP_URL}/bookings" class="btn">Mark as Returned →</a>
  `, `⏰ Return ${d.item_title} in 5 hours`);
}

function ownerNewRequestEmail(d: any) {
  return baseLayout(`
    <div class="badge">📬 New Booking Request</div>
    <h2>Someone wants to borrow your item!</h2>
    <p>Hi <strong style="color:#eef0f6">${d.owner_name}</strong>, <strong style="color:#f0c040">${d.borrower_name}</strong> has requested to borrow your <strong style="color:#f0c040">${d.item_title}</strong>.</p>
    <div class="highlight">
      <div class="hl-row"><span class="hl-label">Borrower</span><span class="hl-value">${d.borrower_name}</span></div>
      <div class="hl-row"><span class="hl-label">From</span><span class="hl-value">${d.from_date}</span></div>
      <div class="hl-row"><span class="hl-label">To</span><span class="hl-value">${d.to_date}</span></div>
      <div class="hl-row"><span class="hl-label">You'll Earn</span><span class="hl-value" style="color:#34d399">₹${d.total_rent}</span></div>
    </div>
    <p>Log in to approve or reject this request.</p>
    <a href="${APP_URL}/bookings" class="btn">Review Request →</a>
  `, `${d.borrower_name} wants to borrow your ${d.item_title}`);
}

function itemReturnedEmail(d: any) {
  return baseLayout(`
    <div class="badge" style="background:rgba(52,211,153,.1);border-color:rgba(52,211,153,.2);color:#34d399">✅ Item Returned</div>
    <h2>Your item has been returned!</h2>
    <p>Hi <strong style="color:#eef0f6">${d.owner_name}</strong>, <strong style="color:#f0c040">${d.borrower_name}</strong> has marked <strong style="color:#f0c040">${d.item_title}</strong> as returned.</p>
    ${d.late_days > 0 ? `<div class="warn">⚠️ Item was returned <strong>${d.late_days} day(s) late</strong>. Fine charged: <strong>₹${d.fine_charged}</strong></div>` : '<div class="success">✅ Returned on time — no fines!</div>'}
    <p>Please leave a review for ${d.borrower_name} to help the community.</p>
    <a href="${APP_URL}/bookings" class="btn">Leave a Review →</a>
  `, `${d.item_title} has been returned`);
}

function reviewRequestEmail(d: any) {
  return baseLayout(`
    <div class="badge">⭐ Leave a Review</div>
    <h2>How was your experience?</h2>
    <p>Hi <strong style="color:#eef0f6">${d.name}</strong>, your rental of <strong style="color:#f0c040">${d.item_title}</strong> is complete. Please take a moment to rate your experience.</p>
    <p>Your review helps build trust in the CampusKeys community!</p>
    <a href="${APP_URL}/bookings" class="btn">⭐ Rate & Review →</a>
  `, `Rate your experience with ${d.item_title}`);
}

// ── Handler ────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const { type, to, ...data } = body;

    if (!to || !type) return new Response(JSON.stringify({ error: "Missing to or type" }), { status: 400, headers: cors });

    let html = "";
    let subject = "";

    switch (type) {
      case "booking_confirmed":
        html = bookingConfirmedEmail(data); subject = `📦 Booking Request Sent — ${data.item_title}`; break;
      case "booking_approved":
        html = bookingApprovedEmail(data); subject = `✅ Booking Approved — ${data.item_title}`; break;
      case "booking_rejected":
        html = bookingRejectedEmail(data); subject = `Update on your booking for ${data.item_title}`; break;
      case "return_reminder":
        html = returnReminderEmail(data); subject = `⏰ Return ${data.item_title} in 5 hours!`; break;
      case "owner_new_request":
        html = ownerNewRequestEmail(data); subject = `📬 New Booking Request — ${data.item_title}`; break;
      case "item_returned":
        html = itemReturnedEmail(data); subject = `✅ ${data.item_title} has been returned`; break;
      case "review_request":
        html = reviewRequestEmail(data); subject = `⭐ Rate your experience — ${data.item_title}`; break;
      default:
        return new Response(JSON.stringify({ error: "Unknown type" }), { status: 400, headers: cors });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.message || "Resend error");

    return new Response(JSON.stringify({ ok: true, id: result.id }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
