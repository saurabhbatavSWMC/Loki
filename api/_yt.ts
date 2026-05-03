import { Innertube, type YT } from 'youtubei.js';
import { BG } from 'bgutils-js';
import { JSDOM } from 'jsdom';

let ytPromise: Promise<Innertube> | null = null;

async function generatePoToken(visitorData: string): Promise<string | null> {
  try {
    const requestKey = 'O43z0dpjhgX20SCx4KAo';

    const dom = new JSDOM(
      '<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>',
      { url: 'https://www.youtube.com/', referrer: 'https://www.youtube.com/', userAgent: 'Mozilla/5.0' },
    );
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      location: dom.window.location,
      origin: dom.window.origin,
    });

    const bgConfig = {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
      globalObj: globalThis,
      identifier: visitorData,
      requestKey,
    };

    const bgChallenge = await BG.Challenge.create(bgConfig);
    if (!bgChallenge) throw new Error('no_bg_challenge');

    const interpreterJavascript =
      bgChallenge.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue;
    if (interpreterJavascript) {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      new Function(interpreterJavascript)();
    } else {
      throw new Error('no_interpreter');
    }

    const poTokenResult = await BG.PoToken.generate({
      program: bgChallenge.program,
      globalName: bgChallenge.globalName,
      bgConfig,
    });

    return poTokenResult.poToken ?? null;
  } catch (err) {
    console.warn('[yt-potoken] generation failed:', (err as Error).message);
    return null;
  }
}

async function createSession(): Promise<Innertube> {
  const seed = await Innertube.create({ retrieve_player: false });
  const visitorData = seed.session.context.client.visitorData;
  if (!visitorData) {
    return Innertube.create({ retrieve_player: true });
  }
  const poToken = await generatePoToken(visitorData);
  return Innertube.create({
    po_token: poToken ?? undefined,
    visitor_data: visitorData,
    retrieve_player: true,
  });
}

export function getYt(): Promise<Innertube> {
  if (!ytPromise) {
    ytPromise = createSession().catch((err) => {
      ytPromise = null;
      throw err;
    });
  }
  return ytPromise;
}

const ID = /^[A-Za-z0-9_-]{11}$/;

export function extractVideoId(input: string): string | null {
  const s = input.trim();
  if (ID.test(s)) return s;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    return id && ID.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    if (u.pathname === '/watch') {
      const v = u.searchParams.get('v');
      return v && ID.test(v) ? v : null;
    }
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
      return parts[1] && ID.test(parts[1]) ? parts[1] : null;
    }
  }
  return null;
}

const CLIENTS = ['WEB', 'IOS', 'ANDROID', 'TV', 'MWEB'] as const;

export interface ResolvedInfo {
  info: YT.VideoInfo;
  client: (typeof CLIENTS)[number];
}

export async function getInfoWithStreaming(videoId: string): Promise<ResolvedInfo> {
  const yt = await getYt();
  let lastErr: unknown;
  for (const client of CLIENTS) {
    try {
      const info = await yt.getBasicInfo(videoId, client);
      if (info.streaming_data) return { info, client };
      lastErr = new Error(`no_streaming_data:${client}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Streaming data not available');
}
