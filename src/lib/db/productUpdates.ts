"use server";

import prisma from './prisma';

/**
 * Audience for product-update emails: every non-super-admin user who hasn't
 * opted out of product updates (`allowProductUpdates`). The consent gate is
 * what turns this from "spam to everyone" into a deliverable Phase-1 audience.
 */
export interface ProductUpdateRecipient {
    email: string;
    name: string;
    userId: string;
}

export async function getProductUpdateRecipients(): Promise<ProductUpdateRecipient[]> {
    const users = await prisma.user.findMany({
        where: {
            isSuperAdmin: false,
            allowProductUpdates: true,
        },
        select: {
            id: true,
            email: true,
            name: true,
        },
    });

    return users.map((u) => ({
        email: u.email,
        name: u.name ?? '',
        userId: u.id,
    }));
}
