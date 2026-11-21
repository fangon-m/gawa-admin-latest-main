jest.mock('../../utilities/reportAttachments', () => ({
  SAFE_PATH: /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i,
  downloadReportAttachment: jest.fn(),
  verifyAttachmentToken: jest.fn(token => {
    if (token === 'valid-token') return '913c2894-ed89-4c89-895a-52cbd740d28a/1795250916461-krxj3r7ux7-0.heic';
    if (token === 'missing-token') return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/missing.heic';
    return null;
  }),
}));
jest.mock('sharp', () => jest.fn(() => ({
  jpeg: jest.fn(() => ({
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('converted-jpeg')),
  })),
})));

const { downloadReportAttachment } = require('../../utilities/reportAttachments');
const { getAttachment } = require('../reportAttachments');

const attachmentPath = '913c2894-ed89-4c89-895a-52cbd740d28a/1795250916461-krxj3r7ux7-0.heic';

function response() {
  return {
    set: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('report attachment serving', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects missing or invalid tokens', async () => {
    const res = response();

    await getAttachment({ query: { token: 'bad' } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(downloadReportAttachment).not.toHaveBeenCalled();
  });

  it('converts HEIC uploads to JPEG for the browser', async () => {
    downloadReportAttachment.mockResolvedValue({
      bucket: 'issue-reports',
      data: {
        type: 'image/heic',
        arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('heic-bytes')),
      },
    });
    const res = response();

    await getAttachment({ query: { token: 'valid-token' } }, res);

    expect(res.set).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('converted-jpeg'));
  });

  it('returns 404 when the object cannot be found', async () => {
    downloadReportAttachment.mockResolvedValue(null);
    const res = response();

    await getAttachment({ query: { token: 'missing-token' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'ATTACHMENT_NOT_FOUND' });
  });
});
