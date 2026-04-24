import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api/errors";
import { sendProductUpdateToAll, sendProductUpdateTest } from "@/lib/email/productUpdate";

const sendSchema = z.object({
    testEmail: z.string().email().optional(),
    testName: z.string().max(120).optional(),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!user.isSuperAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let payload;
    try {
        payload = sendSchema.parse(await request.json());
    } catch (error) {
        return handleApiError(error, "Invalid request body");
    }

    try {
        const result = payload.testEmail
            ? await sendProductUpdateTest({
                testEmail: payload.testEmail,
                testName: payload.testName,
                adminUserId: user.id,
                // The unsubscribe page treats cityId as decoration for product-update
                // preferences; the admin can exercise the full click-through flow.
                adminCityId: "athens",
            })
            : await sendProductUpdateToAll();
        return NextResponse.json(result);
    } catch (error) {
        return handleApiError(error, "Failed to send product update emails");
    }
}
