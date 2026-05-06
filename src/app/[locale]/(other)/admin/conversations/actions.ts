"use server";

import { revalidatePath } from 'next/cache';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { recordOutboundMessage, updateMessageStatus } from '@/lib/db/messages';
import { sendConversationMessage, sendWelcomeWhatsAppMessage } from '@/lib/notifications/bird';

export interface SendReplyResult {
    success: boolean;
    error?: string;
}

/**
 * Send a free-form text reply into an existing Bird conversation via the
 * Conversations API, persisting the local Message row through the lifecycle
 * (pending → sent / failed). Used by the admin "Reply" form on
 * `/admin/conversations` for testing the integration without a webhook.
 */
export async function sendTestReply(input: {
    conversationId: string;
    phone: string;
    text: string;
}): Promise<SendReplyResult> {
    await withUserAuthorizedToEdit({});

    const text = input.text.trim();
    if (!text) return { success: false, error: 'Message body is required' };
    if (!input.conversationId) return { success: false, error: 'Conversation ID is required' };
    if (!input.phone) return { success: false, error: 'Phone number is required' };

    // Persist first so the audit row exists even if the Bird call fails or
    // the process crashes mid-flight.
    const row = await recordOutboundMessage({
        channel: 'whatsapp',
        phone: input.phone,
        body: text,
        conversationId: input.conversationId,
    });

    const result = await sendConversationMessage(input.conversationId, text);

    await updateMessageStatus(row.id, {
        status: result.success ? 'sent' : 'failed',
        birdMessageId: result.messageId ?? null,
    });

    revalidatePath('/[locale]/(other)/admin/conversations', 'page');

    return result.success ? { success: true } : { success: false, error: result.error };
}

/**
 * Send a WhatsApp welcome template to a phone via the Messaging API. Used by
 * the admin "Send test message" dialog on `/admin/conversations` to seed a
 * conversation for testing — kicks off a thread the user can reply to.
 */
export async function sendTestTemplate(input: {
    phone: string;
    userName?: string;
    cityName?: string;
}): Promise<SendReplyResult> {
    await withUserAuthorizedToEdit({});

    const phone = input.phone.trim();
    if (!phone) return { success: false, error: 'Phone number is required' };

    // Persist first; the row survives even if Bird is unreachable.
    const row = await recordOutboundMessage({
        channel: 'whatsapp',
        phone,
        body: '[welcome template]',
    });

    const result = await sendWelcomeWhatsAppMessage(
        phone,
        input.userName?.trim() || 'Friend',
        input.cityName?.trim() || 'Athens',
    );

    await updateMessageStatus(row.id, {
        status: result.success ? 'sent' : 'failed',
    });

    revalidatePath('/[locale]/(other)/admin/conversations', 'page');

    return result.success ? { success: true } : { success: false, error: result.error };
}
