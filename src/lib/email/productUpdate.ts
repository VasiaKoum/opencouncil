"use server";

import { sendEmail } from '@/lib/email/resend';
import { renderReactEmailToHtml } from '@/lib/email/render';
import { ProductUpdateEmail } from '@/lib/email/templates/ProductUpdateEmail';
import { fillProductUpdatePlaceholders } from '@/lib/email/templates/productUpdateDefault';
import { buildUnsubscribeUrl } from '@/lib/notifications/tokens';
import { getProductUpdateRecipients, ProductUpdateRecipient } from '@/lib/db/productUpdates';

const FROM_ADDRESS = 'OpenCouncil <notifications@opencouncil.gr>';
const RATE_LIMIT_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export interface SendProductUpdateResult {
    sent: number;
    failed: number;
    failedEmails: string[];
}

async function renderForRecipient(
    bodyHtml: string,
    userName: string,
    unsubscribeUrl: string,
): Promise<string> {
    const filled = fillProductUpdatePlaceholders(bodyHtml, { userName, unsubscribeUrl });
    return renderReactEmailToHtml(ProductUpdateEmail({ bodyHtml: filled }));
}

async function sendToRecipient(
    recipient: ProductUpdateRecipient,
    subject: string,
    bodyHtml: string,
): Promise<boolean> {
    const unsubscribeUrl = await buildUnsubscribeUrl(recipient.userId, undefined, 'el');
    const html = await renderForRecipient(bodyHtml, recipient.name, unsubscribeUrl);
    const result = await sendEmail({
        from: FROM_ADDRESS,
        to: recipient.email,
        subject,
        html,
    });
    return result.success;
}

/**
 * Send a product-update email to every consenting recipient with rate limiting.
 * `bodyHtml` is the editor-sanitized HTML with {{userName}}/{{unsubscribeUrl}}
 * placeholders intact; per-recipient substitution happens here. Sanitization
 * is handled client-side so this server module stays jsdom-free.
 */
export async function sendProductUpdateToAll(params: {
    subject: string;
    bodyHtml: string;
}): Promise<SendProductUpdateResult> {
    const { subject, bodyHtml } = params;
    const recipients = await getProductUpdateRecipients();
    let sent = 0;
    let failed = 0;
    const failedEmails: string[] = [];

    for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        try {
            const ok = await sendToRecipient(recipient, subject, bodyHtml);
            if (ok) sent++;
            else {
                failed++;
                failedEmails.push(recipient.email);
            }
        } catch (error) {
            console.error(`Product update send failed for ${recipient.email}:`, error);
            failed++;
            failedEmails.push(recipient.email);
        }
        if (i < recipients.length - 1) {
            await sleep(RATE_LIMIT_DELAY_MS);
        }
    }

    return { sent, failed, failedEmails };
}

/**
 * Send a preview of the product-update email to a single test address.
 * Uses the admin's own userId for the unsubscribe link so the full flow can
 * be previewed end-to-end; clicking the link unsubscribes the admin.
 */
export async function sendProductUpdateTest(params: {
    subject: string;
    bodyHtml: string;
    testEmail: string;
    testName?: string;
    adminUserId: string;
}): Promise<SendProductUpdateResult> {
    const { subject, bodyHtml, testEmail, testName, adminUserId } = params;
    try {
        const unsubscribeUrl = await buildUnsubscribeUrl(adminUserId, undefined, 'el');
        const html = await renderForRecipient(bodyHtml, testName ?? '', unsubscribeUrl);
        const result = await sendEmail({
            from: FROM_ADDRESS,
            to: testEmail,
            subject: `[TEST] ${subject}`,
            html,
        });
        if (result.success) {
            return { sent: 1, failed: 0, failedEmails: [] };
        }
        return { sent: 0, failed: 1, failedEmails: [testEmail] };
    } catch (error) {
        console.error(`Product update test send failed for ${testEmail}:`, error);
        return { sent: 0, failed: 1, failedEmails: [testEmail] };
    }
}
