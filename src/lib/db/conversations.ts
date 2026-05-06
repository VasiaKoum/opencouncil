import prisma from './prisma';
import type { Message } from '@prisma/client';

/**
 * One row per participant phone — what the admin sees in the Conversations
 * list. `messages` carries the full thread (oldest first); the page derives
 * the last-message preview and the count from it. Including the full thread
 * keeps the expandable row content cheap to render — fine for v0 volume; if
 * threads grow large we can switch to lazy-loading on expand.
 */
export interface ConversationSummary {
    phone: string;
    messages: Message[];
}

/**
 * v0 implementation: fetch a recent window of messages, then group by phone
 * in JS. Sorted by latest message first.
 *
 * The `recentMessageWindow` cap is generous — the admin list won't show more
 * conversations than fit in that window. Once the message volume justifies
 * it, swap this for a SQL `DISTINCT ON (phone) ... ORDER BY phone,
 * createdAt DESC` so we're not pulling unbounded rows into the app process.
 */
export async function getConversationSummaries(
    limit = 50,
    recentMessageWindow = 1000,
): Promise<ConversationSummary[]> {
    // Fetch newest-first so the window is the *recent* slice, not the oldest;
    // otherwise once the table exceeds `recentMessageWindow` rows, fresh
    // conversations would silently drop off the admin view. We reverse each
    // conversation's messages below so the page still renders oldest-first.
    const messages = await prisma.message.findMany({
        orderBy: { createdAt: 'desc' },
        take: recentMessageWindow,
    });

    const byPhone = new Map<string, ConversationSummary>();
    for (const msg of messages) {
        const existing = byPhone.get(msg.phone);
        if (existing) {
            existing.messages.push(msg);
        } else {
            byPhone.set(msg.phone, { phone: msg.phone, messages: [msg] });
        }
    }
    // Each `messages` array is currently newest-first (mirrors the query
    // order); flip to oldest-first for chat-style rendering. The first item
    // post-reversal is the oldest, the last item is the latest — which is
    // also what we sort the conversation list by.
    for (const conv of byPhone.values()) {
        conv.messages.reverse();
    }

    // Sort conversations by most recent message first.
    return Array.from(byPhone.values())
        .sort((a, b) => {
            const aLast = a.messages[a.messages.length - 1].createdAt.getTime();
            const bLast = b.messages[b.messages.length - 1].createdAt.getTime();
            return bLast - aLast;
        })
        .slice(0, limit);
}
