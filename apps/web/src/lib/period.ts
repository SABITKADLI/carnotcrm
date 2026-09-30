export type PeriodMode =
  | "last-7"
  | "last-30"
  | "last-90"
  | "last-180"
  | "current-quarter"
  | "year-to-date"
  | "fy"
  | "custom"
  | "all"
  // Retained so old bookmarked links continue to work.
  | "this-month"
  | "previous-month"
  | "month";

const pad = (value: number) => String(value).padStart(2, "0");

export function currentFinancialYear(today = new Date()) {
  const start =
    today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

export function periodBounds(
  mode: PeriodMode,
  selectedMonth = "",
  financialYear = currentFinancialYear(),
  today = new Date(),
  customStart = "",
  customEnd = "",
) {
  if (mode === "all") return null;
  const todayValue = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (mode === "custom") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd))
      return null;
    return customStart <= customEnd
      ? { start: customStart, end: customEnd }
      : { start: customEnd, end: customStart };
  }
  const rollingOptions: Partial<Record<PeriodMode, number>> = {
    "last-7": 7,
    "last-30": 30,
    "last-90": 90,
    "last-180": 180,
  };
  const rollingDays = rollingOptions[mode];
  if (rollingDays) {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    start.setDate(start.getDate() - rollingDays + 1);
    return {
      start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      end: todayValue,
    };
  }
  if (mode === "current-quarter") {
    const startMonth = Math.floor(today.getMonth() / 3) * 3;
    return {
      start: `${today.getFullYear()}-${pad(startMonth + 1)}-01`,
      end: todayValue,
    };
  }
  if (mode === "year-to-date")
    return { start: `${today.getFullYear()}-01-01`, end: todayValue };
  if (mode === "fy") {
    const startYear = Number(financialYear.split("-")[0]);
    if (!Number.isFinite(startYear)) return null;
    return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
  }
  let year = today.getFullYear();
  let month = today.getMonth() + 1;
  if (mode === "previous-month") {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  } else if (mode === "month" && /^\d{4}-\d{2}$/.test(selectedMonth)) {
    [year, month] = selectedMonth.split("-").map(Number);
  }
  const last = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(last)}`,
  };
}

export function inPeriod(
  value: string | undefined,
  mode: PeriodMode,
  selectedMonth = "",
  financialYear = currentFinancialYear(),
  today = new Date(),
  customStart = "",
  customEnd = "",
) {
  const bounds = periodBounds(
    mode,
    selectedMonth,
    financialYear,
    today,
    customStart,
    customEnd,
  );
  if (!bounds) return true;
  const day = (value || "").slice(0, 10);
  return !!day && day >= bounds.start && day <= bounds.end;
}

export function periodQuery(
  mode: PeriodMode,
  month: string,
  fy: string,
  customStart = "",
  customEnd = "",
) {
  return new URLSearchParams({
    period: mode,
    month,
    fy,
    start: customStart,
    end: customEnd,
  }).toString();
}
