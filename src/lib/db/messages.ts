import prisma from './prisma';
import type { Message, MessageChannel, MessageDirection, MessageStatus } from '@prisma/client';

/**
 * Insert a new outbound Message row in `pending` state, before the request 
 * is sent to Bird. The `birdMessageId` is set later when Bird's response 
 * comes back; until then the row tracks the local-side intent + body so the 
 * audit trail is preserved even if the API call fails.
 */
export async function recordOutboundMessage(input: {
    channel: MessageChannel;
    phone: string;
    body: string;
    conversationId?: string | null;
    notificationDeliveryId?: string | null;
}): Promise<Message> {
    return prisma.message.create({
        data: {
            channel: input.channel,
            direction: 'outbound' satisfies MessageDirection,
            phone: input.phone,
            body: input.body,
            conversationId: input.conversationId ?? null,
            notificationDeliveryId: input.notificationDeliveryId ?? null,
            status: 'pending' satisfies MessageStatus,
        },
    });
}

/**
 * Update the status (and optionally the Bird-assigned message ID) of a
 * previously recorded message.
 */
export async function updateMessageStatus(
    id: string,
    update: { status: MessageStatus; birdMessageId?: string | null },
): Promise<Message> {
    return prisma.message.update({
        where: { id },
        data: {
            status: update.status,
            ...(update.birdMessageId !== undefined ? { birdMessageId: update.birdMessageId } : {}),
        },
    });
}
