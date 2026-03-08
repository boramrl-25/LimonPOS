"use client";

export function toYYYYMMDD(d: Date) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export type ReportDateFilterProps = {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
};

export function ReportDateFilter({ dateFrom, dateTo, onDateFromChange, onDateToChange }: ReportDateFilterProps) {
  const today = toYYYYMMDD(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toYYYYMMDD(yesterday);
  const last7 = new Date();
  last7.setDate(last7.getDate() - 6);
  const last7Str = toYYYYMMDD(last7);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-slate-400 text-sm">From:</span>
      <input
        type="date"
        value={dateFrom}
        max={today}
        onChange={(e) => onDateFromChange(e.target.value)}
        className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 border border-slate-600 text-sm"
      />
      <span className="text-slate-400 text-sm">To:</span>
      <input
        type="date"
        value={dateTo}
        max={today}
        onChange={(e) => onDateToChange(e.target.value)}
        className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 border border-slate-600 text-sm"
      />
      <button
        type="button"
        onClick={() => { onDateFromChange(today); onDateToChange(today); }}
        className={`px-3 py-2 rounded-lg text-sm font-medium ${dateFrom === today && dateTo === today ? "bg-sky-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
      >
        Today
      </button>
      <button
        type="button"
        onClick={() => { onDateFromChange(yesterdayStr); onDateToChange(yesterdayStr); }}
        className={`px-3 py-2 rounded-lg text-sm font-medium ${dateFrom === yesterdayStr && dateTo === yesterdayStr ? "bg-sky-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
      >
        Yesterday
      </button>
      <button
        type="button"
        onClick={() => { onDateFromChange(last7Str); onDateToChange(today); }}
        className={`px-3 py-2 rounded-lg text-sm font-medium ${dateFrom === last7Str && dateTo === today ? "bg-sky-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
      >
        Last 7 Days
      </button>
    </div>
  );
}
