"use client";

import { catalog, categories, CatalogItem } from "@/lib/catalog";
import type { StatsTable } from "@/lib/estat";

export interface ItemSelectionState {
  checked: boolean;
  loading: boolean;
  error?: string;
  yearOptions: StatsTable[];
  selectedYear?: string;
}

interface Props {
  selection: Record<string, ItemSelectionState>;
  onToggle: (item: CatalogItem) => void;
  onYearChange: (itemId: string, year: string) => void;
}

export default function CategoryTree({ selection, onToggle, onYearChange }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {categories.map((category) => (
        <div key={category}>
          <h3 className="mb-2 text-base font-semibold text-gray-900">{category}</h3>
          <ul className="flex flex-col gap-2">
            {catalog
              .filter((item) => item.category === category)
              .map((item) => {
                const state = selection[item.id];
                const disabled = !item.apiAvailable;
                return (
                  <li
                    key={item.id}
                    className={`rounded border px-3 py-2 ${
                      disabled ? "border-gray-200 bg-gray-50 text-gray-400" : "border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={state?.checked ?? false}
                        onChange={() => onToggle(item)}
                      />
                      <span className="font-medium">{item.itemName}</span>
                      <span className="text-xs text-gray-500">
                        {item.publisher} / {item.frequency}
                      </span>
                    </div>

                    {item.subcategory && (
                      <p className="ml-6 text-xs text-gray-500">{item.subcategory}</p>
                    )}

                    {disabled && (
                      <p className="ml-6 text-xs text-gray-400">
                        {item.note ?? "公式APIが無いため自動取得は未対応です。"}
                        {item.sourceUrl && (
                          <>
                            {" "}
                            <a
                              className="underline"
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              情報源を見る
                            </a>
                          </>
                        )}
                      </p>
                    )}

                    {!disabled && state?.checked && (
                      <div className="ml-6 mt-2 flex items-center gap-2 text-sm">
                        {state.loading && <span className="text-gray-400">年度を確認中…</span>}
                        {state.error && <span className="text-red-500">{state.error}</span>}
                        {!state.loading && !state.error && (
                          <>
                            <span className="text-gray-600">年度:</span>
                            <select
                              className="rounded border border-gray-300 px-2 py-1"
                              value={state.selectedYear ?? ""}
                              onChange={(e) => onYearChange(item.id, e.target.value)}
                            >
                              <option value="">選択してください</option>
                              {state.yearOptions.map((t) => (
                                <option key={t.statsDataId} value={t.statsDataId}>
                                  {t.year}年（{t.title || t.statisticsName}）
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
