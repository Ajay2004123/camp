import { supabase } from './supabase'

/**
 * Send an email by calling the Supabase Edge Function "send-email"
 * which uses Resend internally.
 *
 * @param {string} type  - email template type
 * @param {string} to    - recipient email
 * @param {object} data  - template variables
 */
export async function sendEmail(type, to, data = {}) {
  try {
    const { error } = await supabase.functions.invoke('send-email', {
      body: { type, to, ...data },
    })
    if (error) console.warn('Email warning:', error.message)
    return !error
  } catch (err) {
    // Non-fatal — log but don't crash the app
    console.warn('Email invoke failed:', err.message)
    return false
  }
}

export const EMAIL = {
  BOOKING_CONFIRMED:  'booking_confirmed',
  BOOKING_APPROVED:   'booking_approved',
  BOOKING_REJECTED:   'booking_rejected',
  RETURN_REMINDER:    'return_reminder',
  OWNER_NEW_REQUEST:  'owner_new_request',
  ITEM_RETURNED:      'item_returned',
  REVIEW_REQUEST:     'review_request',
}
