import { normalizeWhatsAppWebhook } from '../WhatsAppWebhookNormalizer.js';

describe('normalizeWhatsAppWebhook', () => {
  it('convierte payloads de Meta a envelopes canonicos', () => {
    const result = normalizeWhatsAppWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-id-1' },
                messages: [
                  {
                    id: 'wamid.1',
                    from: '573001234567',
                    timestamp: '1774990800',
                    type: 'text',
                    text: { body: 'Hola ORQO' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.workspaceId).toBe('phone-id-1');
    expect(result.value[0]?.payload.text).toBe('Hola ORQO');
  });

  it('ignora mensajes no soportados sin romper el webhook', () => {
    const result = normalizeWhatsAppWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-id-1' },
                messages: [
                  {
                    id: 'wamid.image',
                    from: '573001234567',
                    timestamp: '1774990800',
                    type: 'image',
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});
