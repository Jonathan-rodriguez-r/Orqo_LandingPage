import {
  normalizeWhatsAppStatusUpdates,
  normalizeWhatsAppWebhook,
} from '../WhatsAppWebhookNormalizer.js';
import type { WorkspaceChannelRouter } from '../WorkspaceChannelRouter.js';
import { Ok, Err } from '../../../shared/Result.js';

function makeRouter(workspaceId: string): WorkspaceChannelRouter {
  return {
    resolveByPhoneNumberId: jest.fn().mockResolvedValue(Ok(workspaceId)),
    resolveByIgAccountId: jest.fn().mockResolvedValue(Ok(workspaceId)),
    resolveByPageId: jest.fn().mockResolvedValue(Ok(workspaceId)),
  } as unknown as WorkspaceChannelRouter;
}

function makeRouterNotFound(): WorkspaceChannelRouter {
  return {
    resolveByPhoneNumberId: jest.fn().mockResolvedValue(
      Err(new Error('No workspace configurado para phone_number_id: unknown-id')),
    ),
    resolveByIgAccountId: jest.fn().mockResolvedValue(
      Err(new Error('No workspace configurado para ig_account_id: unknown-id')),
    ),
    resolveByPageId: jest.fn().mockResolvedValue(
      Err(new Error('No workspace configurado para page_id: unknown-id')),
    ),
  } as unknown as WorkspaceChannelRouter;
}

describe('normalizeWhatsAppWebhook', () => {
  it('convierte payloads de Meta a envelopes canonicos', async () => {
    const router = makeRouter('ws-from-routing-table');
    const result = await normalizeWhatsAppWebhook(
      {
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
      },
      router,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    expect(result.value).toHaveLength(1);
    // workspaceId must come from routing table, NOT from phone_number_id
    expect(result.value[0]?.workspaceId).toBe('ws-from-routing-table');
    expect(result.value[0]?.channel).toBe('whatsapp');
    expect(result.value[0]?.provider).toBe('meta');
    expect(result.value[0]?.senderExternalId).toBe('573001234567');
    expect(result.value[0]?.payload.text).toBe('Hola ORQO');
  });

  it('retorna Err si el router no encuentra el workspace para ese phone_number_id', async () => {
    const router = makeRouterNotFound();
    const result = await normalizeWhatsAppWebhook(
      {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'unknown-id' },
                  messages: [
                    {
                      id: 'wamid.1',
                      from: '573001234567',
                      timestamp: '1774990800',
                      type: 'text',
                      text: { body: 'Hola' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      router,
    );

    expect(result.ok).toBe(false);
  });

  it('ignora mensajes no soportados sin romper el webhook', async () => {
    const router = makeRouter('ws-1');
    const result = await normalizeWhatsAppWebhook(
      {
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
      },
      router,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});

describe('normalizeWhatsAppStatusUpdates', () => {
  it('convierte statuses de Meta a actualizaciones de outbox', async () => {
    const router = makeRouter('ws-from-routing-table');
    const result = await normalizeWhatsAppStatusUpdates(
      {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'phone-id-1' },
                  statuses: [
                    {
                      id: 'wamid.outbound.1',
                      recipient_id: '573001234567',
                      status: 'delivered',
                      timestamp: '1774990800',
                      conversation: { id: 'conversation-1' },
                      pricing: { billable: true },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      router,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      workspaceId: 'ws-from-routing-table',
      providerMessageId: 'wamid.outbound.1',
      providerAccountId: 'phone-id-1',
      recipient: '573001234567',
      status: 'delivered',
      metadata: {
        conversation: { id: 'conversation-1' },
        pricing: { billable: true },
      },
    });
    expect(result.value[0]?.occurredAt.toISOString()).toBe('2026-03-31T21:00:00.000Z');
  });

  it('incluye la razon de fallo cuando Meta envia errores', async () => {
    const router = makeRouter('ws-1');
    const result = await normalizeWhatsAppStatusUpdates(
      {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'phone-id-1' },
                  statuses: [
                    {
                      id: 'wamid.failed',
                      recipient_id: '573001234567',
                      status: 'failed',
                      timestamp: '1774990800',
                      errors: [
                        {
                          code: 131042,
                          title: 'Business eligibility payment issue',
                          message: 'Message failed to send',
                          error_data: { details: 'Payment method issue' },
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      router,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    expect(result.value[0]?.status).toBe('failed');
    expect(result.value[0]?.failureReason).toContain('131042');
    expect(result.value[0]?.metadata?.['errors']).toHaveLength(1);
  });

  it('ignora estados no soportados sin romper el webhook', async () => {
    const router = makeRouter('ws-1');
    const result = await normalizeWhatsAppStatusUpdates(
      {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'phone-id-1' },
                  statuses: [
                    {
                      id: 'wamid.unknown',
                      recipient_id: '573001234567',
                      status: 'mystery',
                      timestamp: '1774990800',
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      router,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});
