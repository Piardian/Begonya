import { sendTelegramMessage, sendTelegramPhoto } from '../server/telegramSender';

describe('Telegram Sender', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      TELEGRAM_BOT_TOKEN: 'mock_token',
      TELEGRAM_CHAT_ID: 'mock_chat_id',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should return true and call fetch with correct URL and parameters on success', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    global.fetch = mockFetch;

    const res = await sendTelegramMessage('test text');
    expect(res).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.telegram.org/botmock_token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: 'mock_chat_id',
          text: 'test text',
        }),
      })
    );
  });

  test('should send raw text without Telegram markdown parsing', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    global.fetch = mockFetch;

    const text = 'Signal ID     : USDCAD_15m_OB_1784783700000_1784786400000\nRisk / Reward : N/A - TP not modeled';
    const res = await sendTelegramMessage(text);

    expect(res).toBe(true);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      chat_id: 'mock_chat_id',
      text,
    });
  });

  test('should return false if fetch response is not ok', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });
    global.fetch = mockFetch;

    const res = await sendTelegramMessage('test text');
    expect(res).toBe(false);
  });

  test('should return false if fetch resolves but ok is false in json payload', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false }),
    });
    global.fetch = mockFetch;

    const res = await sendTelegramMessage('test text');
    expect(res).toBe(false);
  });

  test('should return false and log error on network reject without throwing', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network disconnected'));
    global.fetch = mockFetch;

    const res = await sendTelegramMessage('test text');
    expect(res).toBe(false);
  });

  test('should return false if env token/chat_id is missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const res = await sendTelegramMessage('test text');
    expect(res).toBe(false);
  });

  // sendTelegramPhoto Tests
  test('should send photo successfully and return true on valid payload', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    global.fetch = mockFetch;

    const dummyBuffer = Buffer.from('mock_png');
    const res = await sendTelegramPhoto(dummyBuffer, 'caption text');
    expect(res).toBe(true);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.telegram.org/botmock_token/sendPhoto',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    );
  });

  test('should return false if sendPhoto fetch is not ok', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });
    global.fetch = mockFetch;

    const dummyBuffer = Buffer.from('mock_png');
    const res = await sendTelegramPhoto(dummyBuffer);
    expect(res).toBe(false);
  });

  test('should return false on sendPhoto network reject error without throwing', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    const dummyBuffer = Buffer.from('mock_png');
    const res = await sendTelegramPhoto(dummyBuffer);
    expect(res).toBe(false);
  });
});
