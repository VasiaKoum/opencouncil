"use server";

import { withUserAuthorizedToEdit } from '@/lib/auth';
import prisma from '@/lib/db/prisma';
import { recordOutboundMessage, updateMessage } from '@/lib/db/messages';
import {
    sendConversationMessage,
    createOrUpdateConversation,
    sendSMSMessage,
    sendWelcomeSMS,
} from '@/lib/notifications/bird';
import { reconcileMessageStatus } from '@/lib/notifications/reconcile';
import { releaseNotifications } from '@/lib/notifications/deliver';
import type { MessageChannel } from '@prisma/client';

export interface SendReplyResult {
    success: boolean;
    error?: string;
}

/**
 * Send a free-form text reply into an existing Bird conversation via the
 * Conversations API, persisting the local Message row through the lifecycle
 * (pending → sent / failed → polled terminal status).
 */
export async function sendTestReply(input: {
    conversationId: string;
    phone: string;
    text: string;
    channel: MessageChannel;
}): Promise<SendReplyResult> {
    await withUserAuthorizedToEdit({});

    const text = input.text.trim();
    if (!text) return { success: false, error: 'Message body is required' };
    if (!input.conversationId) return { success: false, error: 'Conversation ID is required' };
    if (!input.phone) return { success: false, error: 'Phone number is required' };

    const row = await recordOutboundMessage({
        channel: input.channel,
        phone: input.phone,
        body: text,
        conversationId: input.conversationId,
    });

    const result = await sendConversationMessage({
        conversationId: input.conversationId,
        channel: input.channel,
        text,
        recipientPhone: input.phone,
    });

    await updateMessage(row.id, {
        status: result.success ? 'sent' : 'failed',
        birdMessageId: result.messageId ?? null,
    });

    if (result.success && result.messageId) {
        await reconcileMessageStatus({
            localMessageId: row.id,
            channel: input.channel,
            birdMessageId: result.messageId,
        });
    }

    return result.success ? { success: true } : { success: false, error: result.error };
}

/**
 * Send a free-form SMS test to a phone via the Messaging API.
 * Persists an outbound Message row in the same shape as `sendTestTemplate`.
 */
export async function sendTestSms(input: {
    phone: string;
    body: string;
}): Promise<SendReplyResult> {
    await withUserAuthorizedToEdit({});

    const phone = input.phone.trim();
    const body = input.body.trim();
    if (!phone) return { success: false, error: 'Phone number is required' };
    if (!body) return { success: false, error: 'Message body is required' };

    const row = await recordOutboundMessage({
        channel: 'sms',
        phone,
        body,
    });

    const result = await sendSMSMessage(phone, body);

    await updateMessage(row.id, {
        status: result.success ? 'sent' : 'failed',
        conversationId: result.conversationId ?? null,
        birdMessageId: result.messageId ?? null,
    });

    if (result.success && result.messageId) {
        await reconcileMessageStatus({
            localMessageId: row.id,
            channel: 'sms',
            birdMessageId: result.messageId,
        });
    }

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

    // Route through createOrUpdateConversation so the welcome message lands in
    // the same Bird thread we reuse for later notifications.
    const result = await createOrUpdateConversation({
        phone,
        notificationType: 'welcome',
        params: {
            userName: input.userName?.trim() || 'Friend',
            cityName: input.cityName?.trim() || 'Athens',
        },
    });

    await updateMessage(row.id, {
        status: result.success ? 'sent' : 'failed',
        conversationId: result.conversationId ?? null,
        birdMessageId: result.messageId ?? null,
    });

    if (result.success && result.messageId) {
        await reconcileMessageStatus({
            localMessageId: row.id,
            channel: 'whatsapp',
            birdMessageId: result.messageId,
        });
        return { success: true };
    }

    const userName = input.userName?.trim() || 'Friend';
    const cityName = input.cityName?.trim() || 'Athens';
    const smsResult = await sendWelcomeSMS(phone, userName, cityName);
    if (smsResult.body) {
        const smsRow = await recordOutboundMessage({
            channel: 'sms',
            phone,
            body: smsResult.body,
            conversationId: smsResult.conversationId ?? null,
        });
        await updateMessage(smsRow.id, {
            status: smsResult.success ? 'sent' : 'failed',
            birdMessageId: smsResult.messageId ?? null,
        });
        if (smsResult.success && smsResult.messageId) {
            await reconcileMessageStatus({
                localMessageId: smsRow.id,
                channel: 'sms',
                birdMessageId: smsResult.messageId,
            });
        }
    }

    return smsResult.success
        ? { success: true }
        : { success: false, error: `WhatsApp: ${result.error}; SMS: ${smsResult.error}` };
}

// ---------------------------------------------------------------------------
// Admin "Before-meeting" test send. Creates a real Notification +
// NotificationDelivery row for a chosen user/city/meeting (mirroring the prod
// flow that `createNotificationsForMeeting` runs after the agenda task), then
// calls `releaseNotifications` so it goes through the same conversation +
// message-row pipeline as a real notification.
// ---------------------------------------------------------------------------

export interface CityOption { id: string; name: string }
export interface MeetingOption { id: string; name: string; dateTime: string }

export async function listCitiesForTest(): Promise<CityOption[]> {
    await withUserAuthorizedToEdit({});
    const cities = await prisma.city.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });
    return cities;
}

export async function listMeetingsForTest(cityId: string): Promise<MeetingOption[]> {
    await withUserAuthorizedToEdit({});
    if (!cityId) return [];
    const meetings = await prisma.councilMeeting.findMany({
        where: { cityId },
        select: { id: true, name: true, dateTime: true },
        orderBy: { dateTime: 'desc' },
        take: 20,
    });
    return meetings.map((m) => ({ ...m, dateTime: m.dateTime.toISOString() }));
}

export async function sendTestBeforeMeetingNotification(input: {
    phone: string;
    cityId: string;
    meetingId: string;
}): Promise<SendReplyResult> {
    await withUserAuthorizedToEdit({});

    const phone = input.phone.trim();
    if (!phone) return { success: false, error: 'Phone number is required' };
    if (!input.cityId) return { success: false, error: 'City is required' };
    if (!input.meetingId) return { success: false, error: 'Meeting is required' };

    const user = await prisma.user.findFirst({ where: { phone } });
    if (!user) {
        return { success: false, error: `No user found with phone ${phone}` };
    }

    const firstSubject = await prisma.subject.findFirst({
        where: { councilMeetingId: input.meetingId, cityId: input.cityId },
    });
    if (!firstSubject) {
        return { success: false, error: 'Meeting has no subjects to attach' };
    }

    let notificationId: string;
    try {
        const notification = await prisma.notification.create({
            data: {
                userId: user.id,
                cityId: input.cityId,
                meetingId: input.meetingId,
                type: 'beforeMeeting',
                subjects: {
                    create: [{ subjectId: firstSubject.id, reason: 'generalInterest' }],
                },
            },
        });
        notificationId = notification.id;

        await prisma.notificationDelivery.create({
            data: {
                notificationId: notification.id,
                medium: 'message',
                status: 'pending',
                phone,
                body: '[beforeMeeting template]',
            },
        });
    } catch (error: any) {
        if (error?.code === 'P2002' && error?.meta?.target?.includes('userId')) {
            return {
                success: false,
                error: 'A beforeMeeting notification already exists for this user + meeting',
            };
        }
        throw error;
    }

    const result = await releaseNotifications([notificationId]);

    if (result.failed > 0) {
        return { success: false, error: `Release failed (${result.failed} failed deliveries)` };
    }
    return { success: true };
}
