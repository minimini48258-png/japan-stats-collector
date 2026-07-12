// e-Stat API（政府統計の総合窓口）クライアント。
// CORSに対応している（access-control-allow-origin: *）ことを確認済みのため、
// ブラウザから直接 https://api.e-stat.go.jp を呼び出す。
// APIキー（appId）は無料登録すれば即時発行され、課金は発生しないため
// クライアントに埋め込む運用とする（.env の NEXT_PUBLIC_ESTAT_APP_ID）。
//
// 参考: 政府統計の総合窓口（e-Stat）API仕様 3.0版
// https://www.e-stat.go.jp/api/api-info/e-stat-manual3-0

const ESTAT_BASE = "https://api.e-stat.go.jp/rest/3.0/app/json";

function getAppId(): string {
  const appId = process.env.NEXT_PUBLIC_ESTAT_APP_ID;
  if (!appId) {
    throw new Error(
      "e-Stat APIキー（NEXT_PUBLIC_ESTAT_APP_ID）が設定されていません。.env.local を確認してください。"
    );
  }
  return appId;
}

export interface StatsTable {
  statsDataId: string;
  statisticsName: string;
  title: string;
  cycle: string;
  surveyDate: string;
  year: number | null;
}

/** SURVEY_DATE（例: "202010" "2020" "0"）から西暦年を推定する */
function extractYear(surveyDate: string | number | undefined): number | null {
  if (!surveyDate) return null;
  const s = String(surveyDate);
  const match = s.match(/^(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

/**
 * itemName（例: "国勢調査"）をキーワードにe-Statの統計表を検索し、
 * 指定した地域コードのデータを持つ統計表の一覧を年別に返す。
 */
export async function searchStatsTables(
  searchWord: string,
  areaCode: string
): Promise<StatsTable[]> {
  const params = new URLSearchParams({
    appId: getAppId(),
    searchWord,
    searchKind: "1",
    cdArea: areaCode,
  });
  const res = await fetch(`${ESTAT_BASE}/getStatsList?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`e-Stat getStatsList に失敗しました（HTTP ${res.status}）`);
  }
  const json = await res.json();
  const result = json?.GET_STATS_LIST?.RESULT;
  if (result && result["@status"] !== 0 && result["@status"] !== "0") {
    throw new Error(`e-Stat API エラー: ${result["@errorMsg"] ?? "不明なエラー"}`);
  }

  const rawList = json?.GET_STATS_LIST?.DATALIST_INF?.TABLE_INF;
  const list: unknown[] = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];

  return list
    .map((raw): StatsTable => {
      const t = raw as Record<string, unknown>;
      const title = t.TITLE as { $?: string } | string | undefined;
      return {
        statsDataId: String(t["@id"]),
        statisticsName: String(t.STATISTICS_NAME ?? ""),
        title: typeof title === "string" ? title : title?.$ ?? "",
        cycle: String(t.CYCLE ?? ""),
        surveyDate: String(t.SURVEY_DATE ?? ""),
        year: extractYear(t.SURVEY_DATE as string | number | undefined),
      };
    })
    .filter((t) => t.year !== null)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

export interface StatsRow {
  category: string;
  area: string;
  time: string;
  value: string;
  unit: string;
}

/** 指定した統計表・地域コードのデータを取得し、CSV化しやすい行データに変換する */
export async function fetchStatsData(
  statsDataId: string,
  areaCode: string
): Promise<StatsRow[]> {
  const params = new URLSearchParams({
    appId: getAppId(),
    statsDataId,
    cdArea: areaCode,
  });
  const res = await fetch(`${ESTAT_BASE}/getStatsData?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`e-Stat getStatsData に失敗しました（HTTP ${res.status}）`);
  }
  const json = await res.json();
  const result = json?.GET_STATS_DATA?.RESULT;
  if (result && result["@status"] !== 0 && result["@status"] !== "0") {
    throw new Error(`e-Stat API エラー: ${result["@errorMsg"] ?? "不明なエラー"}`);
  }

  const statData = json?.GET_STATS_DATA?.STATISTICAL_DATA;
  const classObjRaw = statData?.CLASS_INF?.CLASS_OBJ;
  const classObjs: unknown[] = Array.isArray(classObjRaw) ? classObjRaw : classObjRaw ? [classObjRaw] : [];

  // コード→ラベルの対応表を作る（cat01, area, time など全分類軸をまとめて解決する）
  const codeToLabel = new Map<string, string>();
  for (const obj of classObjs) {
    const o = obj as Record<string, unknown>;
    const classRaw = o.CLASS;
    const classes: unknown[] = Array.isArray(classRaw) ? classRaw : classRaw ? [classRaw] : [];
    for (const c of classes) {
      const cls = c as Record<string, unknown>;
      codeToLabel.set(String(cls["@code"]), String(cls["@name"]));
    }
  }

  const valuesRaw = statData?.DATA_INF?.VALUE;
  const values: unknown[] = Array.isArray(valuesRaw) ? valuesRaw : valuesRaw ? [valuesRaw] : [];

  return values.map((raw) => {
    const v = raw as Record<string, unknown>;
    const catCode = String(v["@cat01"] ?? "");
    const areaCodeVal = String(v["@area"] ?? "");
    const timeCode = String(v["@time"] ?? "");
    return {
      category: codeToLabel.get(catCode) ?? catCode,
      area: codeToLabel.get(areaCodeVal) ?? areaCodeVal,
      time: codeToLabel.get(timeCode) ?? timeCode,
      value: String(v["$"] ?? ""),
      unit: String(v["@unit"] ?? ""),
    };
  });
}
