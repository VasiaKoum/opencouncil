import * as React from 'react';
import { Section, Heading, Text, Button } from '@react-email/components';
import { BaseTemplate } from '../components/BaseTemplate';

export interface ProductUpdateEmailProps {
    userName: string;
    unsubscribeUrl: string;
}

const PLACEHOLDER_COPY = {
    title: 'Νέα από το OpenCouncil',
    greeting: (userName: string) => `Γεια σας ${userName || 'φίλε μας'},`,
    body: [
        'Αυτό είναι ένα δείγμα ενημέρωσης από το OpenCouncil.',
        'Επεξεργαστείτε το template ProductUpdateEmail.tsx πριν το αποστείλετε.',
    ],
    cta: {
        label: 'Επισκεφθείτε το OpenCouncil',
        url: 'https://opencouncil.gr',
    },
    unsubscribeLead: 'Δεν θέλετε να λαμβάνετε τέτοιες ενημερώσεις;',
    unsubscribeLink: 'Απεγγραφή',
};

export const ProductUpdateEmail = ({
    userName,
    unsubscribeUrl,
}: ProductUpdateEmailProps): React.ReactElement => (
    <BaseTemplate previewText={PLACEHOLDER_COPY.title}>
        <Section style={{ padding: '0 8px' }}>
            <Heading as="h1" style={{ color: '#111827', fontSize: '22px', margin: '0 0 16px' }}>
                {PLACEHOLDER_COPY.title}
            </Heading>

            <Text style={{ color: '#374151', fontSize: '15px', lineHeight: '1.6', margin: '0 0 12px' }}>
                {PLACEHOLDER_COPY.greeting(userName)}
            </Text>

            {PLACEHOLDER_COPY.body.map((paragraph, idx) => (
                <Text
                    key={idx}
                    style={{ color: '#374151', fontSize: '15px', lineHeight: '1.6', margin: '0 0 12px' }}
                >
                    {paragraph}
                </Text>
            ))}

            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
                <Button
                    href={PLACEHOLDER_COPY.cta.url}
                    style={{
                        backgroundColor: '#fc550a',
                        color: '#ffffff',
                        padding: '12px 20px',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 600,
                        textDecoration: 'none',
                    }}
                >
                    {PLACEHOLDER_COPY.cta.label}
                </Button>
            </Section>

            <Text style={{ color: '#9ca3af', fontSize: '11px', margin: '24px 0 0', textAlign: 'center' }}>
                {PLACEHOLDER_COPY.unsubscribeLead}{' '}
                <a href={unsubscribeUrl} style={{ color: '#9ca3af' }}>
                    {PLACEHOLDER_COPY.unsubscribeLink}
                </a>
            </Text>
        </Section>
    </BaseTemplate>
);

export default ProductUpdateEmail;
