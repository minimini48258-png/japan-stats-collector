// 不動産情報ライブラリAPI（国土交通省, XPT002）は
//   - 緯度経度ではなくXYZタイル座標（z/x/y）でクエリする方式
//   - CORS非対応・APIキーはサーバーサイド必須
// という2つの制約があるため、
//   1. GSI住所検索API（同じくCORS非対応）で市区町村の代表地点を取得
//   2. 代表地点を中心にズーム14のタイル座標を計算し、3x3タイルをまとめて取得
//   3. レスポンスのproperties.city_county_name_jaで選択した市区町村に絞り込む
// という流れで取得する。1・2の呼び出しはいずれもCloudflare Workers（worker/）を経由する。
//
// 制約: 面積の大きい市区町村では3x3タイル（ズーム14で概ね7km四方）に収まらない
// 地点が漏れる可能性がある。次フェーズでズームやタイル数を可変にする改善余地あり。

export interface LandPricePoint {
  pointId: string;
  prefecture: string;
  city: string;
  address: string;
  price: number;
  year: string;
  useCategory: string;
}

const ZOOM = 14;
const TILE_RADIUS = 1; // 中心タイルの上下左右1マスずつ = 3x3

function getProxyBase(): string {
  const base = process.env.NEXT_PUBLIC_REINFOLIB_PROXY_BASE_URL;
  if (!base) {
    throw new Error(
      "不動産情報ライブラリ用プロキシURL（NEXT_PUBLIC_REINFOLIB_PROXY_BASE_URL）が設定されていません。.env.local を確認してください。"
    );
  }
  return base.replace(/\/$/, "");
}

function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

/** GSI住所検索APIで地名から代表地点（緯度経度）を取得する */
async function geocode(query: string): Promise<{ lon: number; lat: number } | null> {
  const res = await fetch(
    `${getProxyBase()}/gsi/address-search?q=${encodeURIComponent(query)}`
  );
  if (!res.ok) {
    throw new Error(`住所検索（GSI）に失敗しました（HTTP ${res.status}）`);
  }
  const json = await res.json();
  const first = Array.isArray(json) ? json[0] : undefined;
  const coords = first?.geometry?.coordinates as [number, number] | undefined;
  if (!coords) return null;
  return { lon: coords[0], lat: coords[1] };
}

/**
 * 区域区分・用途地域・災害危険区域・避難場所・学校・医療機関等、
 * 不動産情報ライブラリのXKT/XGT系タイルAPI（z/x/y+response_format共通形式）を汎用的に取得する。
 * これらのAPIはレイヤーごとにproperties名の構造がバラバラ（例: 地価は city_county_name_ja で
 * 市区町村を特定できるが、災害危険区域は都道府県コードしか持たない等）なため、
 * 個別の市区町村名フィルタは行わず、代表地点を中心とした3x3タイル（ズーム14, 概ね7km四方）の
 * 範囲に含まれる features をそのままCSV化する設計にしている。
 */
export async function fetchGisLayer(
  endpointCode: string,
  prefectureName: string,
  cityName: string
): Promise<Record<string, unknown>[]> {
  const center = await geocode(`${prefectureName}${cityName}`);
  if (!center) {
    throw new Error(`「${prefectureName}${cityName}」の位置情報を取得できませんでした`);
  }
  const centerTile = lonLatToTile(center.lon, center.lat, ZOOM);

  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];

  for (let dx = -TILE_RADIUS; dx <= TILE_RADIUS; dx++) {
    for (let dy = -TILE_RADIUS; dy <= TILE_RADIUS; dy++) {
      const x = centerTile.x + dx;
      const y = centerTile.y + dy;
      const params = new URLSearchParams({
        endpoint: endpointCode,
        z: String(ZOOM),
        x: String(x),
        y: String(y),
      });
      const res = await fetch(`${getProxyBase()}/reinfolib/gis?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`不動産情報ライブラリAPI（プロキシ経由）に失敗しました（HTTP ${res.status}）`);
      }
      const json = await res.json();
      const features: unknown[] = Array.isArray(json?.features) ? json.features : [];
      for (const raw of features) {
        const f = raw as { properties?: Record<string, unknown> };
        const p = f.properties ?? {};
        const key = JSON.stringify(p);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(p);
      }
    }
  }

  return rows;
}

/**
 * 地価公示・都道府県地価調査データを取得する。
 * `priceClassification` は "0"=地価公示のみ, "1"=都道府県地価調査のみ。
 */
export async function fetchLandPrice(
  prefectureName: string,
  cityName: string,
  year: string,
  priceClassification: "0" | "1"
): Promise<LandPricePoint[]> {
  const center = await geocode(`${prefectureName}${cityName}`);
  if (!center) {
    throw new Error(`「${prefectureName}${cityName}」の位置情報を取得できませんでした`);
  }
  const centerTile = lonLatToTile(center.lon, center.lat, ZOOM);

  const seen = new Set<string>();
  const points: LandPricePoint[] = [];

  for (let dx = -TILE_RADIUS; dx <= TILE_RADIUS; dx++) {
    for (let dy = -TILE_RADIUS; dy <= TILE_RADIUS; dy++) {
      const x = centerTile.x + dx;
      const y = centerTile.y + dy;
      const params = new URLSearchParams({
        z: String(ZOOM),
        x: String(x),
        y: String(y),
        year,
        priceClassification,
      });
      const res = await fetch(`${getProxyBase()}/reinfolib/land-price?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`不動産情報ライブラリAPI（プロキシ経由）に失敗しました（HTTP ${res.status}）`);
      }
      const json = await res.json();
      const features: unknown[] = Array.isArray(json?.features) ? json.features : [];
      for (const raw of features) {
        const f = raw as { properties?: Record<string, unknown> };
        const p = f.properties ?? {};
        const pointId = String(p.point_id ?? "");
        if (!pointId || seen.has(pointId)) continue;
        if (cityName && String(p.city_county_name_ja ?? "") !== cityName) continue;
        seen.add(pointId);
        points.push({
          pointId,
          prefecture: String(p.prefecture_name_ja ?? ""),
          city: String(p.city_county_name_ja ?? ""),
          address: String(p.location_number_ja ?? ""),
          price: Number(p.u_current_years_price_ja ?? 0),
          year: String(p.target_year_name_ja ?? year),
          useCategory: String(p.use_category_name_ja ?? ""),
        });
      }
    }
  }

  return points;
}
