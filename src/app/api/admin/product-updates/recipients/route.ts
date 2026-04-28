import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api/errors";
import { getProductUpdateRecipients } from "@/lib/db/productUpdates";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!user.isSuperAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const recipients = await getProductUpdateRecipients();
        return NextResponse.json({ count: recipients.length });
    } catch (error) {
        return handleApiError(error, "Failed to fetch recipient count");
    }
}
