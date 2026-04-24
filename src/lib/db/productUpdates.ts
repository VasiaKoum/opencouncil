"use server";

/**
 * Phase 1 product-update email recipients.
 *
 * The recipient list is intentionally hardcoded here. No DB-driven audience
 * picker, no audit row. When we want to send a product update:
 *   1. Update the list below with the users to include (or leave empty and
 *      rely on the admin UI's test-email input).
 *   2. Edit `src/lib/email/templates/ProductUpdateEmail.tsx` with the copy
 *      to send.
 *   3. A super-admin clicks "Send emails" from the admin notifications page.
 *
 * userId + cityId are required for generating a per-recipient unsubscribe
 * token. cityId is used only to satisfy the token payload; the unsubscribe
 * page's "preferences" action clears `allowProductUpdates` independently of
 * any city.
 */
export interface ProductUpdateRecipient {
    email: string;
    name: string;
    userId: string;
    cityId: string;
}

const PRODUCT_UPDATE_RECIPIENTS: ProductUpdateRecipient[] = [
    // { email: 'user@example.com', name: 'User', userId: 'clxxxx', cityId: 'athens' },
];

export async function getProductUpdateRecipients(): Promise<ProductUpdateRecipient[]> {
    return PRODUCT_UPDATE_RECIPIENTS;
}
