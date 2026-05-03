import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'node:stream';
import { getYt, extractVideoId, getInfoWithStreaming } from './_yt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = String(req.query.url ?? '');
  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).end('invalid_url');

  try {
    const yt = await getYt();
    const { info, client } = await getInfoWithStreaming(videoId);
    const fmt = info.chooseFormat({ type: 'audio', quality: 'best' });
    if (!fmt) {
      res.statusCode = 404;
      return res.end('no_audio_format');
    }

    const webStream = await yt.download(videoId, {
      type: 'audio',
      quality: 'best',
      client,
    });

    res.setHeader('Content-Type', fmt.mime_type ?? 'audio/mp4');
    res.setHeader('Cache-Control', 'no-store');
    if (fmt.content_length) res.setHeader('Content-Length', String(fmt.content_length));

    const nodeStream = Readable.fromWeb(
      webStream as unknown as Parameters<typeof Readable.fromWeb>[0],
    );

    req.on('close', () => { nodeStream.destroy(); });
    nodeStream.on('error', (err) => {
      console.warn('[api/stream] error:', err);
      if (!res.headersSent) res.statusCode = 502;
      res.end();
    });
    nodeStream.pipe(res);
  } catch (err) {
    console.warn('[api/stream] failed:', err);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end('stream_failed');
    }
  }
}
