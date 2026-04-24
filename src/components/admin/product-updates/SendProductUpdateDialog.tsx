'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { Mail, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface SendResult {
    sent: number;
    failed: number;
    failedEmails: string[];
}

type Status = 'idle' | 'sending-test' | 'sending-all' | 'success' | 'error';

export function SendProductUpdateDialog() {
    const t = useTranslations('ProductUpdates');
    const [open, setOpen] = useState(false);
    const [testEmail, setTestEmail] = useState('');
    const [status, setStatus] = useState<Status>('idle');
    const [result, setResult] = useState<SendResult | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const reset = () => {
        setStatus('idle');
        setResult(null);
        setErrorMessage(null);
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) {
            setTestEmail('');
            reset();
        }
    };

    const send = async (body: Record<string, unknown>, nextStatus: Status) => {
        reset();
        setStatus(nextStatus);
        try {
            const res = await fetch('/api/admin/product-updates/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setErrorMessage(data?.error ?? `HTTP ${res.status}`);
                setStatus('error');
                return;
            }
            const data: SendResult = await res.json();
            setResult(data);
            setStatus('success');
        } catch (error) {
            console.error('Product update send error:', error);
            setErrorMessage(error instanceof Error ? error.message : String(error));
            setStatus('error');
        }
    };

    const sendTest = () => send({ testEmail }, 'sending-test');
    const sendAll = () => send({}, 'sending-all');

    const isLoading = status === 'sending-test' || status === 'sending-all';
    const testEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <Mail className="h-4 w-4" />
                    {t('triggerButton')}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('dialogTitle')}</DialogTitle>
                    <DialogDescription>{t('dialogDescription')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="product-update-test-email">{t('testEmailLabel')}</Label>
                        <Input
                            id="product-update-test-email"
                            type="email"
                            placeholder={t('testEmailPlaceholder')}
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            disabled={isLoading}
                        />
                        <p className="text-xs text-muted-foreground">{t('testEmailHelp')}</p>
                    </div>

                    {status === 'success' && result && (
                        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium">{t('successTitle')}</p>
                                <p>{t('successSummary', { sent: result.sent, failed: result.failed })}</p>
                                {result.failedEmails.length > 0 && (
                                    <p className="mt-1 text-xs break-all">
                                        {t('failedList')}: {result.failedEmails.join(', ')}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium">{t('errorTitle')}</p>
                                <p>{errorMessage}</p>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="outline"
                        onClick={sendTest}
                        disabled={isLoading || !testEmailValid}
                    >
                        {status === 'sending-test' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('sendTestButton')}
                    </Button>
                    <Button onClick={sendAll} disabled={isLoading} variant="default">
                        {status === 'sending-all' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('sendAllButton')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
