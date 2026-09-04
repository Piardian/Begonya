export const launch = jest.fn().mockResolvedValue({
  newPage: jest.fn().mockResolvedValue({
    setViewport: jest.fn(),
    goto: jest.fn(),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('')),
  }),
  close: jest.fn(),
});
