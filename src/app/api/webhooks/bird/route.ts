import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '@/env.mjs';
import prisma from '@/lib/db/prisma';
import type { Prisma, MessageDirection, MessageChannel } from '@prisma/client';

const HEADER_CANDIDATES = ['x-signature', 'bird-signature', 'x-bird-signature'];

function readSignatureHeader(request: Request): string | null {
    for (const name of HEADER_CANDIDATES) {
        const value = request.headers.get(name);
        if (value) return value.replace(/^sha256=/, '');
    }
    return null;
}

function verifySignature(rawBody: string, header: string, secret: string): boolean {
    try {
        const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
        const actualBuf = new Uint8Array(Buffer.from(header, 'hex'));
        const expectedBuf = new Uint8Array(Buffer.from(expected, 'hex'));
        if (actualBuf.length !== expectedBuf.length) return false;
        return timingSafeEqual(actualBuf, expectedBuf);
    } catch {
        return false;
    }
}

function extractMessageFields(event: any): {
    birdMessageId?: string;
    conversationId?: string;
    direction: MessageDirection;
    phone?: string;
    body: string;
    channel: MessageChannel;
} {
    const eventName = String(event?.event ?? '');
    const payload = event?.payload ?? event?.data ?? event ?? {};

    let m: any;
    let conversationId: string | undefined;

    if (eventName === 'conversation.updated' && payload?.lastMessage) {
        m = payload.lastMessage;
        conversationId = payload.id; // payload IS the conversation here
    } else {
        m = payload?.message ?? payload;
        conversationId = m?.conversationId ?? m?.conversation_id;
    }

    // Direction: prefer an explicit field; otherwise infer from sender.type —
    // Bird tags the external party as `contact` and us (agents / channel) with
    // a different role string. Default to inbound when there's no signal.
    const explicitDirection = String(m?.direction ?? m?.kind ?? '').toLowerCase();
    const senderType = String(m?.sender?.type ?? '').toLowerCase();
    const direction =
        explicitDirection.includes('out') ? 'outbound' :
        explicitDirection.includes('in') ? 'inbound' :
        senderType === 'contact' ? 'inbound' :
        senderType ? 'outbound' :
        'inbound';

    const phone =
        m?.sender?.contact?.identifierValue ??
        m?.sender?.contact?.platformAddress ??
        m?.from?.identifierValue ??
        m?.from?.phone ??
        (typeof m?.from === 'string' ? m.from : undefined) ??
        m?.sender?.identifierValue ??
        m?.contact?.identifierValue ??
        m?.sender?.phone ??
        m?.participant?.identifierValue;

    const body =
        m?.preview?.text ??
        m?.body?.text?.text ??
        m?.body?.text ??
        m?.text ??
        (typeof m?.body === 'string' ? m.body : '');

    const channel = String(m?.channel ?? '').toLowerCase().includes('sms') ? 'sms' : 'whatsapp';

    return {
        birdMessageId: m?.id ?? m?.messageId,
        conversationId,
        direction,
        phone,
        body,
        channel,
    };
}

export async function POST(request: Request) {
    // Buffer raw body — needed both for HMAC verification and JSON parsing.
    const rawBody = await request.text();

    // Verify signature when a secret is configured. We bail with 401 on
    // mismatch; without the secret set we accept everything (dev convenience).
    if (env.BIRD_WEBHOOK_SECRET) {
        const header = readSignatureHeader(request);
        if (!header || !verifySignature(rawBody, header, env.BIRD_WEBHOOK_SECRET)) {
            console.warn('Bird webhook: signature verification failed');
            return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
        }
    } else {
        console.warn('Bird webhook: BIRD_WEBHOOK_SECRET not set — accepting unsigned events');
    }

    let event: unknown;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
    }

    // Extract the bits we persist. Acknowledge with 200 even on missing
    // fields — Bird shouldn't retry a payload we never know how to consume.
    const fields = extractMessageFields(event);
    if (!fields.birdMessageId || !fields.phone) {
        // Stringify so deeply-nested objects (e.g. payload.lastMessage) aren't
        // collapsed to `[Object]` by Node's default depth limit.
        console.warn(
            'Bird webhook: missing required fields, skipping insert\nEvent:\n',
            JSON.stringify(event, null, 2),
        );
        return NextResponse.json({ ok: true });
    }

    // Idempotent insert. P2002 on the unique birdMessageId means this is a
    // retry of a delivery we already recorded — silently ignore.
    try {
        await prisma.message.create({
            data: {
                channel: fields.channel,
                direction: fields.direction,
                birdMessageId: fields.birdMessageId,
                conversationId: fields.conversationId ?? null,
                phone: fields.phone,
                body: fields.body,
                status: 'sent',
            },
        });
    } catch (error) {
        const code = (error as Prisma.PrismaClientKnownRequestError | undefined)?.code;
        if (code !== 'P2002') {
            console.error('Bird webhook: persist error', error);
            // Returning 500 makes Bird retry — appropriate for transient DB issues.
            return NextResponse.json({ error: 'persist failed' }, { status: 500 });
        }
    }

    return NextResponse.json({ ok: true });
}
