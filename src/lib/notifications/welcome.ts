"use server";

import { sendEmail } from '@/lib/email/resend';
import { renderReactEmailToHtml } from '@/lib/email/render';
import { WelcomeEmail } from '@/lib/email/templates/WelcomeEmail';
import { createOrUpdateConversation, sendWelcomeSMS } from './bird';
import { recordOutboundMessage, updateMessage } from '@/lib/db/messages';
import { klitiki } from '@/lib/utils';

interface City {
    name: string;
    name_municipality: string;
}

/**
 * Send welcome messages (email + WhatsApp/SMS) when user signs up for notifications
 */
export async function sendWelcomeMessages(userId: string, city: City, phone?: string) {
    try {
        // Get user details from DB
        const { default: prisma } = await import('@/lib/db/prisma');
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            console.error('User not found for welcome message');
            return;
        }

        const userName = user.name ? klitiki(user.name) : 'φίλε μας';

        // Render welcome email template
        const welcomeEmailHtml = await renderReactEmailToHtml(
            WelcomeEmail({ userName, cityName: city.name_municipality })
        );

        // Send welcome email
        sendEmail({
            from: 'OpenCouncil <notifications@opencouncil.gr>',
            to: user.email,
            subject: `Καλώς ήρθατε στο OpenCouncil - ${city.name}`,
            html: welcomeEmailHtml
        }).catch(err => console.error('Error sending welcome email:', err));

        // Send welcome WhatsApp/SMS if phone provided
        if (phone) {
            const result = await createOrUpdateConversation({
                phone,
                notificationType: 'welcome',
                params: { userName, cityName: city.name },
            });

            // Guard on `success` only — not `success && messageId`. Bird sometimes
            // returns 2xx with no message ID in the response shape; falling through
            // to SMS in that case would silently double-send the welcome.
            if (result.success) {
                const row = await recordOutboundMessage({
                    channel: 'whatsapp',
                    phone,
                    body: '[welcome template]',
                    conversationId: result.conversationId ?? null,
                });
                await updateMessage(row.id, {
                    status: 'sent',
                    birdMessageId: result.messageId ?? null,
                });
            } else {
                console.log('WhatsApp welcome failed, falling back to SMS:', result.error);
                const smsResult = await sendWelcomeSMS(phone, userName, city.name);
                if (smsResult.success && smsResult.messageId && smsResult.body) {
                    const row = await recordOutboundMessage({
                        channel: 'sms',
                        phone,
                        body: smsResult.body,
                        conversationId: smsResult.conversationId ?? null,
                    });
                    await updateMessage(row.id, {
                        status: 'sent',
                        birdMessageId: smsResult.messageId,
                    });
                }
            }
        }

    } catch (error) {
        console.error('Error sending welcome messages:', error);
        // Don't throw - welcome messages are nice-to-have, not critical
    }
}

