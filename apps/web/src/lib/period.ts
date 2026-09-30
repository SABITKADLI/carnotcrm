export type PeriodMode =
  "this-month" | "previous-month" | "month" | "fy" | "all";

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
) {
  if (mode === "all") return null;
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
) {
  const bounds = periodBounds(mode, selectedMonth, financialYear, today);
  if (!bounds) return true;
  const day = (value || "").slice(0, 10);
  return !!day && day >= bounds.start && day <= bounds.end;
}

export function periodQuery(mode: PeriodMode, month: string, fy: string) {
  return new URLSearchParams({ period: mode, month, fy }).toString();
}
