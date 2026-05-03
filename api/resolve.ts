import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractVideoId, getInfoWithStreaming } from './_yt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = String(req.query.url ?? '');
  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: 'invalid_url' });

  try {
    const { info, client } = await getInfoWithStreaming(videoId);

    if (info.basic_info.is_live) {
      return res.status(400).json({ error: 'live_stream_unsupported' });
    }

    const fmt = info.chooseFormat({ type: 'audio', quality: 'best' });
    if (!fmt) return res.status(404).json({ error: 'no_audio_format' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      videoId,
      client,
      title: info.basic_info.title ?? 'YouTube tape',
      author: info.basic_info.author ?? null,
      durationSec: info.basic_info.duration ?? null,
      mime: fmt.mime_type ?? 'audio/mp4',
      contentLength: fmt.content_length ?? null,
      itag: fmt.itag ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    const code = /age/i.test(message)
      ? 'age_restricted'
      : /private/i.test(message)
        ? 'private_video'
        : /unavailable|not.*found/i.test(message)
          ? 'video_unavailable'
          : /streaming data|no_streaming_data/i.test(message)
            ? 'no_streaming_data'
            : 'resolve_failed';
    return res.status(502).json({ error: code, message });
  }
}
