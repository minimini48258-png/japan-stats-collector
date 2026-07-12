"use client";

import { useMemo, useState } from "react";
import AreaSelector from "@/components/AreaSelector";
import CategoryTree, { ItemSelectionState } from "@/components/CategoryTree";
import DownloadButton from "@/components/DownloadButton";
import { catalog, CatalogItem } from "@/lib/catalog";
import { getMunicipalities, getPrefectures, prefAreaCode } from "@/lib/areas";
import { searchStatsTables, fetchStatsData, StatsTable } from "@/lib/estat";
import { fetchLandPrice } from "@/lib/reinfolib";
import { toCsv, downloadFiles, DownloadFile } from "@/lib/download";

// XPT002（地価公示・地価調査）が対応する年は1995〜2024年
const REINFOLIB_MAX_YEAR = 2024;

function reinfolibYearOptions(): StatsTable[] {
  return Array.from({ length: 8 }).map((_, i) => {
    const year = REINFOLIB_MAX_YEAR - i;
    return {
      statsDataId: String(year),
      statisticsName: "",
      title: `${year}年`,
      cycle: "半年",
      surveyDate: String(year),
      year,
    };
  });
}

export default function Home() {
  const [prefCode, setPrefCode] = useState("");
  const [muniCode, setMuniCode] = useState("");
  const [selection, setSelection] = useState<Record<string, ItemSelectionState>>({});
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const areaCode = muniCode || (prefCode ? prefAreaCode(prefCode) : "");
  const { prefName, muniName, areaLabel } = useMemo(() => {
    if (!prefCode) return { prefName: "", muniName: "", areaLabel: "" };
    const pref = getPrefectures().find((p) => p.prefCode === prefCode);
    if (!pref) return { prefName: "", muniName: "", areaLabel: "" };
    if (!muniCode) return { prefName: pref.prefName, muniName: "", areaLabel: pref.prefName };
    const muni = getMunicipalities(prefCode).find((m) => m.code === muniCode);
    return {
      prefName: pref.prefName,
      muniName: muni?.name ?? "",
      areaLabel: muni ? `${pref.prefName}${muni.name}` : pref.prefName,
    };
  }, [prefCode, muniCode]);

  const handleAreaChange = (nextPref: string, nextMuni: string) => {
    setPrefCode(nextPref);
    setMuniCode(nextMuni);
    // 地域が変わったら選択済み年度はリセットする（統計表IDが地域に紐づくため）
    setSelection((prev) => {
      const next: Record<string, ItemSelectionState> = {};
      for (const [id, state] of Object.entries(prev)) {
        next[id] = { ...state, yearOptions: [], selectedYear: undefined, error: undefined };
      }
      return next;
    });
  };

  const handleToggle = async (item: CatalogItem) => {
    const current = selection[item.id];
    const willCheck = !current?.checked;

    setSelection((prev) => ({
      ...prev,
      [item.id]: {
        checked: willCheck,
        loading: willCheck && item.apiProvider === "estat",
        yearOptions: current?.yearOptions ?? [],
        selectedYear: current?.selectedYear,
      },
    }));

    if (!willCheck || !areaCode) return;

    if (item.apiProvider === "reinfolib") {
      setSelection((prev) => ({
        ...prev,
        [item.id]: { ...prev[item.id], loading: false, yearOptions: reinfolibYearOptions() },
      }));
      return;
    }

    if (item.apiProvider === "estat") {
      try {
        const tables = await searchStatsTables(item.itemName, areaCode);
        setSelection((prev) => ({
          ...prev,
          [item.id]: { ...prev[item.id], loading: false, yearOptions: tables },
        }));
      } catch (err) {
        setSelection((prev) => ({
          ...prev,
          [item.id]: {
            ...prev[item.id],
            loading: false,
            error: err instanceof Error ? err.message : "年度の取得に失敗しました",
          },
        }));
      }
    }
  };

  const handleYearChange = (itemId: string, year: string) => {
    setSelection((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], selectedYear: year },
    }));
  };

  const selectedReadyItems = catalog.filter(
    (item) => selection[item.id]?.checked && selection[item.id]?.selectedYear
  );

  const handleDownload = async () => {
    if (!areaCode || selectedReadyItems.length === 0) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const files: DownloadFile[] = [];
      for (const item of selectedReadyItems) {
        const year = selection[item.id].selectedYear!;
        if (item.apiProvider === "estat") {
          const rows = await fetchStatsData(year, areaCode);
          files.push({
            filename: `${item.itemName}_${areaLabel}.csv`,
            csv: toCsv(rows as unknown as Record<string, unknown>[]),
          });
        } else if (item.apiProvider === "reinfolib") {
          const rows = await fetchLandPrice(
            prefName,
            muniName,
            year,
            item.reinfolibPriceClassification ?? "0"
          );
          files.push({
            filename: `${item.itemName}_${areaLabel}_${year}.csv`,
            csv: toCsv(rows as unknown as Record<string, unknown>[]),
          });
        }
      }
      await downloadFiles(files, `統計データ_${areaLabel}.zip`);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "ダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">統計データ収集ツール</h1>
        <p className="mt-2 text-sm text-gray-600">
          都道府県・市区町村・分野・年度を選んで、人口や産業などの公的統計データをまとめてダウンロードできます。
          自動取得できるのはe-Stat・不動産情報ライブラリの公式APIで提供されているデータのみです。
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">1. 地域を選択</h2>
        <AreaSelector prefCode={prefCode} muniCode={muniCode} onChange={handleAreaChange} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">2. 分野・年度を選択</h2>
        {!prefCode ? (
          <p className="text-sm text-gray-400">先に地域を選択してください。</p>
        ) : (
          <CategoryTree selection={selection} onToggle={handleToggle} onYearChange={handleYearChange} />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">3. ダウンロード</h2>
        <DownloadButton
          disabled={selectedReadyItems.length === 0}
          loading={downloading}
          onClick={handleDownload}
        />
        {downloadError && <p className="text-sm text-red-500">{downloadError}</p>}
      </section>
    </main>
  );
}
