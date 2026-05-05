'use client';

import { useState, useTransition } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Send, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { sendTestTemplate } from '@/app/[locale]/(other)/admin/conversations/actions';

type Status = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Top-right "Send test message" button on the admin Conversations page.
 * Posts a WhatsApp welcome template (BIRD_WHATSAPP_TEMPLATE_WELCOME) to a
 * phone via the Messaging API — kicks off a fresh thread the recipient can
 * reply to, opening the 24h customer-service window.
 */
export function SendTemplateDialog() {
    const [open, setOpen] = useState(false);
    const [phone, setPhone] = useState('');
    const [userName, setUserName] = useState('');
    const [cityName, setCityName] = useState('Athens');
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const reset = () => {
        setStatus('idle');
        setError(null);
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) {
            setPhone('');
            setUserName('');
            setCityName('Athens');
            reset();
        }
    };

    const submit = () => {
        const trimmed = phone.trim();
        if (!trimmed) return;
        setStatus('sending');
        setError(null);
        startTransition(async () => {
            const result = await sendTestTemplate({
                phone: trimmed,
                userName: userName || undefined,
                cityName: cityName || undefined,
            });
            if (result.success) {
                setStatus('sent');
            } else {
                setStatus('error');
                setError(result.error ?? 'Send failed');
            }
        });
    };

    const phoneValid = /^\+[0-9]{6,}$/.test(phone.trim());

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Send className="h-4 w-4" />
                    Send test message
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Send WhatsApp welcome template</DialogTitle>
                    <DialogDescription>
                        Sends the pre-approved welcome template via the Messaging API. Use a
                        phone you control so you can reply on WhatsApp and exercise the full
                        flow.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="send-template-phone">Phone (E.164)</Label>
                        <Input
                            id="send-template-phone"
                            type="tel"
                            placeholder="+306900000000"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            disabled={pending}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="send-template-name">User name</Label>
                            <Input
                                id="send-template-name"
                                placeholder="Friend"
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                disabled={pending}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="send-template-city">City</Label>
                            <Input
                                id="send-template-city"
                                placeholder="Athens"
                                value={cityName}
                                onChange={(e) => setCityName(e.target.value)}
                                disabled={pending}
                            />
                        </div>
                    </div>

                    {status === 'sent' && (
                        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-800">
                            <CheckCircle className="h-4 w-4 shrink-0" />
                            <span>Template queued. Check WhatsApp on the recipient phone.</span>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span className="break-words">{error}</span>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
                        Close
                    </Button>
                    <Button onClick={submit} disabled={pending || !phoneValid}>
                        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Send
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
