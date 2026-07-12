"use client";

import { getMunicipalities, getPrefectures } from "@/lib/areas";

interface Props {
  prefCode: string;
  muniCode: string;
  onChange: (prefCode: string, muniCode: string) => void;
}

export default function AreaSelector({ prefCode, muniCode, onChange }: Props) {
  const prefectures = getPrefectures();
  const municipalities = prefCode ? getMunicipalities(prefCode) : [];

  return (
    <div className="flex flex-wrap gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-700">都道府県</span>
        <select
          className="rounded border border-gray-300 px-3 py-2"
          value={prefCode}
          onChange={(e) => onChange(e.target.value, "")}
        >
          <option value="">選択してください</option>
          {prefectures.map((p) => (
            <option key={p.prefCode} value={p.prefCode}>
              {p.prefName}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-700">市区町村</span>
        <select
          className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          value={muniCode}
          disabled={!prefCode}
          onChange={(e) => onChange(prefCode, e.target.value)}
        >
          <option value="">都道府県全体</option>
          {municipalities.map((m) => (
            <option key={m.code} value={m.code}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
