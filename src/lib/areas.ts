import areaCodesRaw from "@/data/area-codes.json";

export interface Municipality {
  code: string;
  name: string;
}

export interface Prefecture {
  prefCode: string;
  prefName: string;
  municipalities: Municipality[];
}

const areaCodes = areaCodesRaw as Prefecture[];

export function getPrefectures(): Prefecture[] {
  return areaCodes;
}

export function getMunicipalities(prefCode: string): Municipality[] {
  return areaCodes.find((p) => p.prefCode === prefCode)?.municipalities ?? [];
}

/** 都道府県のみを対象にする場合のe-Stat地域コード（例: 長野県 = "20000"） */
export function prefAreaCode(prefCode: string): string {
  return `${prefCode}000`;
}
