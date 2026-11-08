import NavigationEndpoint from "youtubei.js/NavigationEndpoint";
import { getCookie } from "youtubei.js/Utils";

const USER_AGENT =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ANDROID_CLIENT_VERSION = "20.10.38";
const ANDROID_USER_AGENT =
    `com.google.android.youtube/${ANDROID_CLIENT_VERSION} (Linux; U; Android 14) gzip`;

const LIVE_COOKIES_FILE = "/var/tmp/youtubei.js/live_cookies.txt";
const BOOTSTRAP_COOKIES_FILE = "/var/tmp/bootstrap_cookies.txt";
const LIVE_GOOGLE_SSO_FILE = "/var/tmp/youtubei.js/live_google_sso.json";
const BOOTSTRAP_GOOGLE_SSO_FILE = "/var/tmp/google_sso_cookies.json";

const USE_CUSTOM_PLAYER_REQ =
    Deno.env.get("KVTUBE_CUSTOM_PLAYER_REQ") === "1" ||
    Deno.env.get("KVTUBE_CUSTOM_PLAYER_REQ") === "true";

// Refresh live_cookies.txt on module load if bootstrap_cookies.txt is newer
try {
    const bootStat = Deno.statSync(BOOTSTRAP_COOKIES_FILE);
    const liveStat = Deno.statSync(LIVE_COOKIES_FILE);
    if (bootStat.mtime && liveStat.mtime && bootStat.mtime > liveStat.mtime) {
        Deno.removeSync(LIVE_COOKIES_FILE);
    }
} catch {
    // ignore
}

let cachedCookies = "";
let lastFileLoadMs = 0;
let authMutex: Promise<void> = Promise.resolve();

let cachedProxyUrl: string | null = null;
let cachedProxyClient: Deno.HttpClient | null = null;

// Only used inside reloginViaGoogleSso() to coalesce concurrent SSO refreshes.
// Normal player/metadata calls NEVER acquire this lock.
function withAuthLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = authMutex.then(fn, fn);
    authMutex = next.then(() => undefined, () => undefined);
    return next;
}

function getProxyHttpClient(config?: any): Deno.HttpClient | undefined {
    const proxyUrl: string | null =
        config?.networking?.proxy ||
        Deno.env.get("PROXY") ||
        Deno.env.get("HTTPS_PROXY") ||
        Deno.env.get("https_proxy") ||
        Deno.env.get("HTTP_PROXY") ||
        Deno.env.get("http_proxy") ||
        null;
    if (!proxyUrl) return undefined;
    if (cachedProxyClient && cachedProxyUrl === proxyUrl) {
        return cachedProxyClient;
    }
    try {
        cachedProxyClient = Deno.createHttpClient({
            proxy: { url: proxyUrl },
        });
        cachedProxyUrl = proxyUrl;
        return cachedProxyClient;
    } catch {
        return undefined;
    }
}

function proxyFetch(
    input: string | URL,
    init: RequestInit | undefined,
    config?: any,
): Promise<Response> {
    const client = getProxyHttpClient(config);
    if (client) {
        return fetch(input, { ...(init || {}), client } as RequestInit);
    }
    return fetch(input, init);
}

// Invidious video_json.cr:19:42 evaluates:
//   (info["storyboards"]? || JSON::Any.new(""))["playerLiveStoryboardSpecRenderer"]?
// When YouTube omits `storyboards` (e.g. jNQXAC9IVRw), omitting the key or storing a
// string crashes Invidious with `Expected Hash for #[]?(key : String), not String`.
// Normalizing missing/non-map `storyboards` to `{}` satisfies Crystal's Hash lookup cleanly.
function ensureValidStoryboards(data: any): void {
    if (!data || typeof data !== "object") return;
    if (
        !data.storyboards ||
        typeof data.storyboards !== "object" ||
        Array.isArray(data.storyboards)
    ) {
        data.storyboards = {};
    }
}

function hasPlayableFormats(data: any): boolean {
    const af = data?.streamingData?.adaptiveFormats;
    if (!Array.isArray(af) || af.length === 0) return false;
    return Boolean(af[0]?.url || af[0]?.signatureCipher || af[0]?.cipher);
}

function parseCookieString(cookieStr: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const part of cookieStr.split(/;\s*/)) {
        const idx = part.indexOf("=");
        if (idx > 0) {
            const k = part.slice(0, idx).trim();
            const v = part.slice(idx + 1).trim();
            if (k && !k.startsWith("ST-")) {
                map.set(k, v);
            }
        }
    }
    return map;
}

function serializeCookieMap(map: Map<string, string>): string {
    return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

function hasValidAuthCookies(cookieStr: string): boolean {
    if (!cookieStr) return false;
    const map = parseCookieString(cookieStr);
    return map.has("SID") && map.has("SAPISID") && map.has("LOGIN_INFO");
}

function loadTextFile(path: string): string | null {
    try {
        const content = Deno.readTextFileSync(path).trim();
        return content.length > 0 ? content : null;
    } catch {
        return null;
    }
}

function hasSsoCookieSource(): boolean {
    return Boolean(
        loadTextFile(LIVE_GOOGLE_SSO_FILE) ||
            loadTextFile(BOOTSTRAP_GOOGLE_SSO_FILE),
    );
}

function saveCookiesToFile(cookieStr: string): void {
    try {
        Deno.writeTextFileSync(LIVE_COOKIES_FILE, cookieStr);
    } catch {
        // ignore write errors
    }
}

function initOrLoadCookies(forceReload = false): string {
    const now = Date.now();
    if (forceReload || !cachedCookies || now - lastFileLoadMs > 15_000) {
        lastFileLoadMs = now;
        const live = loadTextFile(LIVE_COOKIES_FILE);
        if (live && hasValidAuthCookies(live)) {
            if (!cachedCookies || forceReload) {
                cachedCookies = live;
            } else {
                const map = parseCookieString(live);
                for (const [k, v] of parseCookieString(cachedCookies).entries()) {
                    map.set(k, v);
                }
                cachedCookies = serializeCookieMap(map);
            }
        } else {
            const bootstrap = loadTextFile(BOOTSTRAP_COOKIES_FILE);
            if (bootstrap && hasValidAuthCookies(bootstrap)) {
                cachedCookies = serializeCookieMap(parseCookieString(bootstrap));
                saveCookiesToFile(cachedCookies);
            }
        }
    }
    return cachedCookies;
}

function updateCookiesFromResponse(resp: Response): void {
    const setCookies = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
    if (!setCookies || setCookies.length === 0) return;
    const map = parseCookieString(cachedCookies);
    let changed = false;
    for (const sc of setCookies) {
        const kv = sc.split(";", 1)[0];
        const idx = kv.indexOf("=");
        if (idx > 0) {
            const k = kv.slice(0, idx).trim();
            const v = kv.slice(idx + 1).trim();
            if (k.startsWith("ST-")) continue;
            if (v === "EXPIRED" || v === "") {
                if (map.has(k)) {
                    map.delete(k);
                    changed = true;
                }
            } else if (map.get(k) !== v) {
                map.set(k, v);
                changed = true;
            }
        }
    }
    if (changed) {
        cachedCookies = serializeCookieMap(map);
        saveCookiesToFile(cachedCookies);
    }
}

interface SsoCookieEntry {
    host: string;
    name: string;
    value: string;
    path: string;
    secure: boolean;
}

async function reloginViaGoogleSso(
    seenCookies?: string,
    config?: any,
): Promise<string> {
    return await withAuthLock(async () => {
        // Coalesce concurrent relogin triggers if another request already refreshed cookies
        if (
            seenCookies !== undefined &&
            cachedCookies !== seenCookies &&
            hasValidAuthCookies(cachedCookies)
        ) {
            return cachedCookies;
        }

        try {
            const rawJson = loadTextFile(LIVE_GOOGLE_SSO_FILE) ||
                loadTextFile(BOOTSTRAP_GOOGLE_SSO_FILE);
            if (!rawJson) return cachedCookies;

            const ssoList: SsoCookieEntry[] = JSON.parse(rawJson);
            const googleCookies = new Map<string, SsoCookieEntry>();
            const ytCookies = new Map<string, string>();

            for (const item of ssoList) {
                googleCookies.set(`${item.host}:${item.name}`, item);
            }

            let currentUrl =
                "https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26hl%3Den%26next%3D%252F";

            for (let hop = 0; hop < 8; hop++) {
                const u = new URL(currentUrl);
                const host = u.hostname;
                const cookiePairs: string[] = [];

                if (host.endsWith("google.com")) {
                    const byName = new Map<string, string>();
                    for (const c of googleCookies.values()) {
                        const chost = c.host.startsWith(".")
                            ? c.host.slice(1)
                            : c.host;
                        if (host === chost || host.endsWith("." + chost)) {
                            byName.set(c.name, c.value);
                        }
                    }
                    for (const [k, v] of byName.entries()) {
                        cookiePairs.push(`${k}=${v}`);
                    }
                } else if (host.endsWith("youtube.com")) {
                    for (const [k, v] of ytCookies.entries()) {
                        cookiePairs.push(`${k}=${v}`);
                    }
                }

                const resp = await proxyFetch(
                    currentUrl,
                    {
                        method: "GET",
                        redirect: "manual",
                        headers: {
                            "User-Agent": USER_AGENT,
                            ...(cookiePairs.length > 0
                                ? { "Cookie": cookiePairs.join("; ") }
                                : {}),
                        },
                    },
                    config,
                );

                const setCookies = resp.headers.getSetCookie
                    ? resp.headers.getSetCookie()
                    : [];
                for (const sc of setCookies) {
                    const parts = sc.split(/;\s*/);
                    const kv = parts[0];
                    const eqIdx = kv.indexOf("=");
                    if (eqIdx <= 0) continue;
                    const cname = kv.slice(0, eqIdx).trim();
                    const cval = kv.slice(eqIdx + 1).trim();
                    let cdomain = host;
                    for (const attr of parts.slice(1)) {
                        if (attr.toLowerCase().startsWith("domain=")) {
                            cdomain = attr.slice(7).trim();
                        }
                    }
                    if (cdomain.includes("youtube.com")) {
                        if (cval === "EXPIRED" || cval === "") {
                            ytCookies.delete(cname);
                        } else if (!cname.startsWith("ST-")) {
                            ytCookies.set(cname, cval);
                        }
                    } else if (cdomain.includes("google.com")) {
                        const key = `${cdomain}:${cname}`;
                        if (cval === "EXPIRED" || cval === "") {
                            googleCookies.delete(key);
                        } else {
                            googleCookies.set(key, {
                                host: cdomain,
                                name: cname,
                                value: cval,
                                path: "/",
                                secure: true,
                            });
                        }
                    }
                }

                try {
                    await resp.body?.cancel();
                } catch {
                    // ignore
                }

                const loc = resp.headers.get("location");
                if (resp.status >= 300 && resp.status < 400 && loc) {
                    currentUrl = new URL(loc, currentUrl).toString();
                } else {
                    break;
                }
            }

            try {
                Deno.writeTextFileSync(
                    LIVE_GOOGLE_SSO_FILE,
                    JSON.stringify(Array.from(googleCookies.values())),
                );
            } catch {
                // ignore
            }

            const freshStr = serializeCookieMap(ytCookies);
            if (hasValidAuthCookies(freshStr)) {
                console.log(
                    `[INFO] Refreshed YouTube session via Google SSO (${ytCookies.size} cookies)`,
                );
                cachedCookies = freshStr;
                saveCookiesToFile(cachedCookies);
            }
        } catch (err) {
            console.warn("[WARN] Google SSO relogin failed:", err);
        }
        return cachedCookies;
    });
}

async function makeSidAuthHeader(
    cookieStr: string,
    userSessionId?: string,
    origin = "https://www.youtube.com",
): Promise<string> {
    if (!cookieStr) return "";
    const ts = Math.floor(Date.now() / 1000).toString();
    const schemes: Array<[string, string]> = [
        ["SAPISIDHASH", "SAPISID"],
        ["SAPISID1PHASH", "__Secure-1PAPISID"],
        ["SAPISID3PHASH", "__Secure-3PAPISID"],
    ];
    const parts: string[] = [];
    for (const [scheme, cname] of schemes) {
        const sid = getCookie(cookieStr, cname);
        if (!sid) continue;
        const hashInput = userSessionId
            ? `${userSessionId} ${ts} ${sid} ${origin}`
            : `${ts} ${sid} ${origin}`;
        const buf = await crypto.subtle.digest(
            "SHA-1",
            new TextEncoder().encode(hashInput),
        );
        const hex = Array.from(new Uint8Array(buf))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        parts.push(
            userSessionId ? `${scheme} ${ts}_${hex}_u` : `${scheme} ${ts}_${hex}`,
        );
    }
    return parts.join(" ");
}

async function fetchAndroidPlayer(
    videoId: string,
    config?: any,
    visitorData?: string,
): Promise<{ status: number; data: any } | null> {
    try {
        const body = {
            context: {
                client: {
                    clientName: "ANDROID",
                    clientVersion: ANDROID_CLIENT_VERSION,
                    androidSdkVersion: 34,
                    hl: "en",
                    gl: "US",
                    userAgent: ANDROID_USER_AGENT,
                    ...(visitorData ? { visitorData } : {}),
                },
            },
            videoId,
            contentCheckOk: true,
            racyCheckOk: true,
        };
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "User-Agent": ANDROID_USER_AGENT,
            "X-YouTube-Client-Name": "3",
            "X-YouTube-Client-Version": ANDROID_CLIENT_VERSION,
            ...(visitorData ? { "X-Goog-Visitor-Id": visitorData } : {}),
        };
        const resp = await proxyFetch(
            "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
            {
                method: "POST",
                headers,
                body: JSON.stringify(body),
            },
            config,
        );
        const data = await resp.json();
        // Ensure youtubePlayerParsing recognizes ANDROID so it skips web JS deciphering
        if (data && typeof data === "object") {
            const existing = data.responseContext?.serviceTrackingParams;
            const hasAndroidMarker = Array.isArray(existing) &&
                existing.some((s: any) =>
                    s?.service === "ECATCHER" &&
                    Array.isArray(s?.params) &&
                    s.params.some((p: any) =>
                        p?.key === "client.name" &&
                        String(p?.value || "").includes("ANDROID")
                    )
                );
            if (!hasAndroidMarker) {
                data.responseContext = {
                    ...(data.responseContext || {}),
                    serviceTrackingParams: [
                        ...(Array.isArray(existing) ? existing : []),
                        {
                            service: "ECATCHER",
                            params: [{ key: "client.name", value: "ANDROID" }],
                        },
                    ],
                };
            }
        }
        return { status: resp.status, data };
    } catch (err) {
        console.warn("[WARN] ANDROID fallback failed:", err);
        return null;
    }
}

async function fetchWebEmbeddedPlayer(
    videoId: string,
    sts: number,
    cookieStr: string,
    config?: any,
): Promise<{
    status: number;
    data: any;
    loggedIn: boolean;
    userSid?: string;
    sessionIndex: string;
    visitorData?: string;
}> {
    const embedResp = await proxyFetch(
        `https://www.youtube.com/embed/${videoId}?html5=1`,
        {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://www.reddit.com/",
                ...(cookieStr ? { "Cookie": cookieStr } : {}),
            },
        },
        config,
    );
    updateCookiesFromResponse(embedResp);
    const html = await embedResp.text();
    const m = html.match(/ytcfg\.set\s*\(\s*(\{.+?\})\s*\)\s*;/);
    if (!m) {
        throw new Error("Could not extract ytcfg from embed page");
    }
    const ytcfg = JSON.parse(m[1]);
    const loggedIn = Boolean(ytcfg.LOGGED_IN);
    const wpcc =
        ytcfg?.WEB_PLAYER_CONTEXT_CONFIGS
            ?.WEB_PLAYER_CONTEXT_CONFIG_ID_EMBEDDED_PLAYER || {};
    const context = ytcfg.INNERTUBE_CONTEXT;
    context.thirdParty = {
        ...(context.thirdParty || {}),
        embedUrl: "https://www.reddit.com/",
    };
    const datasyncId: string = ytcfg.DATASYNC_ID || "";
    const userSid: string | undefined = ytcfg.USER_SESSION_ID ||
        (datasyncId ? datasyncId.split("||")[0] : undefined);
    const sessionIndex = String(ytcfg.SESSION_INDEX ?? 0);
    const visitorData: string | undefined = context.client?.visitorData;
    const origin = "https://www.youtube.com";
    const activeCookies = cachedCookies || cookieStr;
    const authHeader = await makeSidAuthHeader(activeCookies, userSid, origin);

    const body = {
        context,
        videoId,
        playbackContext: {
            contentPlaybackContext: {
                html5Preference: "HTML5_PREF_WANTS",
                signatureTimestamp: sts,
                encryptedHostFlags: wpcc.encryptedHostFlags,
            },
        },
        contentCheckOk: true,
        racyCheckOk: true,
    };

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-YouTube-Client-Name": String(
            ytcfg.INNERTUBE_CONTEXT_CLIENT_NAME || 56,
        ),
        "X-YouTube-Client-Version":
            context.client?.clientVersion || "2.20261105.09.00",
        "Origin": origin,
        "X-Origin": origin,
        "X-Goog-Visitor-Id": visitorData || "",
    };
    if (authHeader && activeCookies) {
        headers["X-Goog-AuthUser"] = sessionIndex;
        headers["X-Youtube-Bootstrap-Logged-In"] = "true";
        headers["Authorization"] = authHeader;
        headers["Cookie"] = activeCookies;
    }

    const resp = await proxyFetch(
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        },
        config,
    );
    updateCookiesFromResponse(resp);
    const data = await resp.json();
    return {
        status: resp.status,
        data,
        loggedIn,
        userSid,
        sessionIndex,
        visitorData,
    };
}

async function fetchWebMetadata(
    videoId: string,
    sts: number,
    config?: any,
    visitorData?: string,
    userSid?: string,
    sessionIndex = "0",
    contentPoToken?: string,
): Promise<any | null> {
    try {
        const origin = "https://www.youtube.com";
        const authHeader = await makeSidAuthHeader(
            cachedCookies,
            userSid,
            origin,
        );
        const body: Record<string, any> = {
            context: {
                client: {
                    clientName: "WEB",
                    clientVersion: "2.20261105.01.00",
                    hl: "en",
                    gl: "US",
                    userAgent: USER_AGENT,
                    ...(visitorData ? { visitorData } : {}),
                },
            },
            videoId,
            playbackContext: {
                contentPlaybackContext: {
                    html5Preference: "HTML5_PREF_WANTS",
                    signatureTimestamp: sts,
                },
            },
            contentCheckOk: true,
            racyCheckOk: true,
        };
        if (contentPoToken) {
            body.serviceIntegrityDimensions = { poToken: contentPoToken };
        }
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            "X-YouTube-Client-Name": "1",
            "X-YouTube-Client-Version": "2.20261105.01.00",
            "Origin": origin,
            "X-Origin": origin,
        };
        if (visitorData) {
            headers["X-Goog-Visitor-Id"] = visitorData;
        }
        if (authHeader && cachedCookies) {
            headers["X-Goog-AuthUser"] = sessionIndex;
            headers["X-Youtube-Bootstrap-Logged-In"] = "true";
            headers["Authorization"] = authHeader;
            headers["Cookie"] = cachedCookies;
        }
        const resp = await proxyFetch(
            "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
            {
                method: "POST",
                headers,
                body: JSON.stringify(body),
            },
            config,
        );
        updateCookiesFromResponse(resp);
        return await resp.json();
    } catch {
        return null;
    }
}

function callWatchEndpoint(
    videoId: string,
    innertubeClient: any,
    innertubeClientType: string,
    contentPoToken?: string,
) {
    const watchEndpoint = new NavigationEndpoint({
        watchEndpoint: {
            videoId,
            racyCheckOk: true,
            contentCheckOk: true,
        },
    });

    return watchEndpoint.call(
        innertubeClient.actions,
        {
            playbackContext: {
                contentPlaybackContext: {
                    vis: 0,
                    splay: false,
                    lactMilliseconds: "-1",
                    signatureTimestamp: innertubeClient.session?.player
                        ?.signature_timestamp,
                },
            },
            ...(contentPoToken
                ? { serviceIntegrityDimensions: { poToken: contentPoToken } }
                : {}),
            client: innertubeClientType,
        },
    );
}

// Default stock-equivalent anonymous PO-token flow over WARP, plus storyboards
// normalization (fixes Invidious video_json.cr:19:42 crash on videos without
// storyboards such as jNQXAC9IVRw) and ANDROID (20.10.38) fallback.
async function stockPoTokenPlayerReq(
    innertubeClient: any,
    videoId: string,
    config: any,
    tokenMinter: any,
) {
    const oauthEnabled = Boolean(config?.youtube_session?.oauth_enabled);
    const primaryClient = oauthEnabled ? "TV" : "WEB";
    const contentPoToken = tokenMinter ? await tokenMinter(videoId) : undefined;

    const playerResp = await callWatchEndpoint(
        videoId,
        innertubeClient,
        primaryClient,
        contentPoToken,
    );

    if (
        !oauthEnabled &&
        (!playerResp.data?.streamingData?.adaptiveFormats?.length ||
            playerResp.data.streamingData.adaptiveFormats[0]?.url === undefined)
    ) {
        const fallbackClients = ["TV_SIMPLY", "ANDROID_VR", "MWEB"];
        for (const clientType of fallbackClients) {
            const fb = await callWatchEndpoint(
                videoId,
                innertubeClient,
                clientType,
                contentPoToken,
            );
            const fbAf = fb.data?.streamingData?.adaptiveFormats;
            if (
                Array.isArray(fbAf) &&
                fbAf.length > 0 &&
                (fbAf[0]?.url || fbAf[0]?.signatureCipher)
            ) {
                if (!playerResp.data.streamingData) {
                    playerResp.data.streamingData = fb.data.streamingData;
                } else {
                    if (fb.data.streamingData.formats?.length) {
                        playerResp.data.streamingData.formats =
                            fb.data.streamingData.formats;
                    }
                    playerResp.data.streamingData.adaptiveFormats = fbAf;
                }
                if (
                    playerResp.data.playabilityStatus?.status !== "OK" &&
                    fb.data.playabilityStatus?.status === "OK"
                ) {
                    playerResp.data.playabilityStatus =
                        fb.data.playabilityStatus;
                }
                if (!playerResp.data.videoDetails && fb.data.videoDetails) {
                    playerResp.data.videoDetails = fb.data.videoDetails;
                }
                if (!playerResp.data.microformat && fb.data.microformat) {
                    playerResp.data.microformat = fb.data.microformat;
                }
                if (!playerResp.data.captions && fb.data.captions) {
                    playerResp.data.captions = fb.data.captions;
                }
                if (!playerResp.data.storyboards && fb.data.storyboards) {
                    playerResp.data.storyboards = fb.data.storyboards;
                }
                break;
            }
        }

        if (!hasPlayableFormats(playerResp.data)) {
            const visitorData =
                innertubeClient.session?.context?.client?.visitorData;
            const androidRes = await fetchAndroidPlayer(
                videoId,
                config,
                visitorData,
            );
            if (androidRes && hasPlayableFormats(androidRes.data)) {
                const prev = playerResp.data || {};
                playerResp.data = {
                    ...androidRes.data,
                    microformat: prev.microformat || androidRes.data.microformat,
                    storyboards: prev.storyboards || androidRes.data.storyboards,
                    captions: prev.captions || androidRes.data.captions,
                    videoDetails:
                        prev.videoDetails || androidRes.data.videoDetails,
                };
            }
        }
    }

    ensureValidStoryboards(playerResp.data);
    return playerResp;
}

// Optional custom WEB_EMBEDDED_PLAYER + SSO cookie flow (enabled via KVTUBE_CUSTOM_PLAYER_REQ=1):
// - No global withAuthLock around normal player/metadata calls (lock only inside reloginViaGoogleSso)
// - No upfront tokenMinter(videoId) when WEB_EMBEDDED_PLAYER discards po_token
// - Falls back to ANDROID (20.10.38) when WEB_EMBEDDED_PLAYER returns UNPLAYABLE (playableInEmbed: false)
// - Normalizes storyboards to {} so Invidious video_json.cr:19:42 never crashes
async function customEmbedPlayerReq(
    innertubeClient: any,
    videoId: string,
    config: any,
    tokenMinter: any,
) {
    const sts = innertubeClient.session?.player?.signature_timestamp || 20760;

    let cookiesSnapshot = initOrLoadCookies(false);
    if (!hasValidAuthCookies(cookiesSnapshot) && hasSsoCookieSource()) {
        cookiesSnapshot = await reloginViaGoogleSso(cookiesSnapshot, config);
    }

    let embedRes = await fetchWebEmbeddedPlayer(
        videoId,
        sts,
        cookiesSnapshot,
        config,
    );

    const embedDenied =
        embedRes.data?.playabilityStatus?.playableInEmbed === false ||
        embedRes.data?.playabilityStatus?.status === "UNPLAYABLE";

    if (
        !embedDenied &&
        (!embedRes.loggedIn || !hasPlayableFormats(embedRes.data)) &&
        hasSsoCookieSource()
    ) {
        const refreshed = await reloginViaGoogleSso(cookiesSnapshot, config);
        embedRes = await fetchWebEmbeddedPlayer(videoId, sts, refreshed, config);
    }

    let finalData = embedRes.data || {};
    let finalStatus = embedRes.status || 200;
    let usedEmbedFormats = hasPlayableFormats(finalData) &&
        finalData.playabilityStatus?.status === "OK";

    // Fall back to ANDROID (20.10.38) when WEB_EMBEDDED_PLAYER returns UNPLAYABLE
    // (e.g. playableInEmbed: false) or fails to return playable adaptiveFormats.
    if (!usedEmbedFormats) {
        const androidRes = await fetchAndroidPlayer(
            videoId,
            config,
            embedRes.visitorData ||
                innertubeClient.session?.context?.client?.visitorData,
        );
        if (androidRes && hasPlayableFormats(androidRes.data)) {
            finalStatus = androidRes.status || 200;
            finalData = {
                ...androidRes.data,
                microformat:
                    finalData.microformat || androidRes.data.microformat,
                storyboards:
                    finalData.storyboards || androidRes.data.storyboards,
                captions: finalData.captions || androidRes.data.captions,
                videoDetails:
                    finalData.videoDetails || androidRes.data.videoDetails,
            };
            usedEmbedFormats = false;
        }
    }

    // WEB_EMBEDDED_PLAYER stream URLs do not expect GVS session po_token
    if (usedEmbedFormats && innertubeClient.session?.player) {
        innertubeClient.session.player.po_token = undefined;
    }

    if (!finalData.microformat) {
        // Lazily mint PO token ONLY when WEB metadata supplement is actually needed
        const contentPoToken = tokenMinter
            ? await tokenMinter(videoId)
            : undefined;
        const webData = await fetchWebMetadata(
            videoId,
            sts,
            config,
            embedRes.visitorData ||
                innertubeClient.session?.context?.client?.visitorData,
            embedRes.userSid,
            embedRes.sessionIndex,
            contentPoToken,
        );
        if (webData) {
            if (!finalData.microformat && webData.microformat) {
                finalData.microformat = webData.microformat;
            }
            if (!finalData.storyboards && webData.storyboards) {
                finalData.storyboards = webData.storyboards;
            }
            if (!finalData.captions && webData.captions) {
                finalData.captions = webData.captions;
            }
            if (!finalData.videoDetails && webData.videoDetails) {
                finalData.videoDetails = webData.videoDetails;
            }
        }
    }

    ensureValidStoryboards(finalData);

    return {
        success: finalStatus >= 200 && finalStatus < 300,
        status_code: finalStatus,
        data: finalData,
    };
}

export const youtubePlayerReq = async (
    innertubeClient: any,
    videoId: string,
    config: any,
    tokenMinter: any,
) => {
    if (USE_CUSTOM_PLAYER_REQ) {
        return await customEmbedPlayerReq(
            innertubeClient,
            videoId,
            config,
            tokenMinter,
        );
    }
    return await stockPoTokenPlayerReq(
        innertubeClient,
        videoId,
        config,
        tokenMinter,
    );
};
