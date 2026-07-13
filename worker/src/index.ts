// 統計データ収集ツール用の薄いプロキシ。
// 不動産情報ライブラリAPI（地価公示・地価調査）とGSI住所検索APIは
// ブラウザから直接呼べない（CORS非対応、または不動産情報ライブラリはAPIキーをサーバー側でしか使えない）ため、
// このWorkerが唯一のサーバーサイド処理としてそれらを中継する。

export interface Env {
  REINFOLIB_API_KEY: string;
  ALLOWED_ORIGIN: string;
}

const DEV_ORIGINS = ["http://localhost:3411", "http://localhost:3000"];
// shiso-lab-site（chips.jp）への本組み込みが完了するまでは、GitHub Pages版が
// 唯一の公開先のため許可オリジンに含めておく
const EXTRA_ALLOWED_ORIGINS = ["https://minimini48258-png.github.io"];

function corsHeaders(env: Env, origin: string | null): HeadersInit {
  const allowed =
    origin &&
    (origin === env.ALLOWED_ORIGIN || DEV_ORIGINS.includes(origin) || EXTRA_ALLOWED_ORIGINS.includes(origin))
      ? origin
      : env.ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function handleGsiAddressSearch(url: URL, headers: HeadersInit): Promise<Response> {
  const q = url.searchParams.get("q");
  if (!q) {
    return new Response(JSON.stringify({ error: "q パラメータが必要です" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  const upstream = new URL("https://msearch.gsi.go.jp/address-search/AddressSearch");
  upstream.searchParams.set("q", q);
  const res = await fetch(upstream.toString());
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

// 不動産情報ライブラリが提供するXKT/XGT系タイルAPI（区域区分・用途地域・災害危険区域・
// 避難場所・学校・医療機関 等）は全てz/x/y+response_formatの共通パラメータ形式のため、
// 許可リストに載っているコードだけ汎用的に中継する（任意文字列を転送するとSSRF的リスクがあるため）。
const ALLOWED_GIS_ENDPOINTS = new Set([
  "XKT001", // 都市計画区域/区域区分
  "XKT002", // 用途地域
  "XKT006", // 学校
  "XKT010", // 医療機関
  "XKT021", // 地すべり防止地区
  "XKT022", // 急傾斜地崩壊危険区域
  "XKT026", // 洪水浸水想定区域
  "XKT027", // 高潮浸水想定区域
  "XKT028", // 津波浸水想定
  "XKT029", // 土砂災害警戒区域
  "XKT030", // 都市計画道路
  "XGT001", // 指定緊急避難場所
]);

async function handleReinfolibGis(url: URL, env: Env, headers: HeadersInit): Promise<Response> {
  const endpoint = url.searchParams.get("endpoint") ?? "";
  if (!ALLOWED_GIS_ENDPOINTS.has(endpoint)) {
    return new Response(JSON.stringify({ error: `未対応のendpointです: ${endpoint}` }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  const required = ["z", "x", "y"];
  for (const key of required) {
    if (!url.searchParams.get(key)) {
      return new Response(JSON.stringify({ error: `${key} パラメータが必要です` }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
  }

  const upstream = new URL(`https://www.reinfolib.mlit.go.jp/ex-api/external/${endpoint}`);
  upstream.searchParams.set("response_format", "geojson");
  for (const key of ["z", "x", "y"]) {
    upstream.searchParams.set(key, url.searchParams.get(key)!);
  }

  const res = await fetch(upstream.toString(), {
    headers: { "Ocp-Apim-Subscription-Key": env.REINFOLIB_API_KEY },
  });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handleReinfolibLandPrice(url: URL, env: Env, headers: HeadersInit): Promise<Response> {
  const required = ["z", "x", "y", "year"];
  for (const key of required) {
    if (!url.searchParams.get(key)) {
      return new Response(JSON.stringify({ error: `${key} パラメータが必要です` }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
  }

  const upstream = new URL("https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002");
  upstream.searchParams.set("response_format", "geojson");
  for (const key of ["z", "x", "y", "year", "priceClassification", "useCategoryCode"]) {
    const value = url.searchParams.get(key);
    if (value) upstream.searchParams.set(key, value);
  }

  const res = await fetch(upstream.toString(), {
    headers: { "Ocp-Apim-Subscription-Key": env.REINFOLIB_API_KEY },
  });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(env, origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers });
    }

    if (url.pathname === "/gsi/address-search") {
      return handleGsiAddressSearch(url, headers);
    }

    if (url.pathname === "/reinfolib/land-price") {
      return handleReinfolibLandPrice(url, env, headers);
    }

    if (url.pathname === "/reinfolib/gis") {
      return handleReinfolibGis(url, env, headers);
    }

    return new Response("Not Found", { status: 404, headers });
  },
};
