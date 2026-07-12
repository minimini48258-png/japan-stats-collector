"use client";

interface Props {
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}

export default function DownloadButton({ disabled, loading, onClick }: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className="rounded bg-blue-600 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
    >
      {loading ? "取得中…" : "ダウンロード"}
    </button>
  );
}
