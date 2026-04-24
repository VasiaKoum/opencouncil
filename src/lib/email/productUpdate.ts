"use server";

import { sendEmail } from '@/lib/email/resend';
import { renderReactEmailToHtml } from '@/lib/email/render';
import { ProductUpdateEmail } from '@/lib/email/templates/ProductUpdateEmail';
import { buildUnsubscribeUrl } from '@/lib/notifications/tokens';
import { getProductUpdateRecipients, ProductUpdateRecipient } from '@/lib/db/productUpdates';

const FROM_ADDRESS = 'OpenCouncil <notifications@opencouncil.gr>';
const SUBJECT = 'Νέα από το OpenCouncil';
const RATE_LIMIT_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export interface SendProductUpdateResult {
    sent: number;
    failed: number;
    failedEmails: string[];
}

async function sendToRecipient(recipient: ProductUpdateRecipient): Promise<boolean> {
    const unsubscribeUrl = buildUnsubscribeUrl(recipient.userId, recipient.cityId, 'el');
    const html = await renderReactEmailToHtml(
        ProductUpdateEmail({ userName: recipient.name, unsubscribeUrl })
    );
    const result = await sendEmail({
        from: FROM_ADDRESS,
        to: recipient.email,
        subject: SUBJECT,
        html,
    });
    return result.success;
}

/**
 * Send a product-update email to the hardcoded recipient list with rate limiting.
 */
export async function sendProductUpdateToAll(): Promise<SendProductUpdateResult> {
    const recipients = await getProductUpdateRecipients();
    let sent = 0;
    let failed = 0;
    const failedEmails: string[] = [];

    for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        try {
            const ok = await sendToRecipient(recipient);
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
    testEmail: string;
    testName?: string;
    adminUserId: string;
    adminCityId: string;
}): Promise<SendProductUpdateResult> {
    const { testEmail, testName, adminUserId, adminCityId } = params;
    try {
        const unsubscribeUrl = buildUnsubscribeUrl(adminUserId, adminCityId, 'el');
        const html = await renderReactEmailToHtml(
            ProductUpdateEmail({ userName: testName ?? '', unsubscribeUrl })
        );
        const result = await sendEmail({
            from: FROM_ADDRESS,
            to: testEmail,
            subject: `[TEST] ${SUBJECT}`,
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
